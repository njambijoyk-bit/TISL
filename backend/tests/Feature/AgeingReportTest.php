<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\BooksReportService;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\AgeingReport;
use App\Services\Books\Engine\Reports\PayablesAgeingReport;
use App\Services\Books\Engine\Reports\ReceivablesAgeingReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Receivables and payables ageing on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.3): the bills the old ageing gave, buckets and basis from settings,
 * and the unapplied credits kept apart. The credit and debit note cases settle the direction (audit D2): a note never opens a bill; it settles its
 * invoice or becomes a credit on its party's side.
 */
class AgeingReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    private const AS_OF = '2026-10-28';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('voucher_bill_refs');
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
        if (! Schema::hasColumn('vouchers', 'meta')) {
            Schema::table('vouchers', fn ($t) => $t->text('meta')->nullable());
        }
        DB::table('voucher_types')->insert([['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase'], ['id' => 5, 'code' => 'RC', 'name' => 'Receipt', 'base_type' => 'receipt'],
            ['id' => 6, 'code' => 'CN', 'name' => 'Credit note', 'base_type' => 'credit_note'], ['id' => 7, 'code' => 'DN', 'name' => 'Debit note', 'base_type' => 'debit_note'], ['id' => 8, 'code' => 'PV', 'name' => 'Payment', 'base_type' => 'payment']]);
        $now = now();
        DB::table('ledgers')->insert([['id' => 21, 'group_id' => 5, 'name' => 'Customer B', 'created_at' => $now, 'updated_at' => $now], ['id' => 22, 'group_id' => 5, 'name' => 'Customer C', 'created_at' => $now, 'updated_at' => $now]]);
        $this->books();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('voucher_bill_refs');
        Schema::dropIfExists('report_settings');
        Schema::dropIfExists('report_settings_log');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private array $v = [];

    private function voucher(string $no, int $type, int $party, string $date, float $total, ?float $base = null, int $cur = 1, int $loc = 1, array $meta = []): int
    {
        $now = now();

        return $this->v[$no] = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'party_ledger_id' => $party, 'voucher_number' => $no, 'date' => $date, 'status' => 'posted', 'currency_id' => $cur, 'total_amount' => $total,
            'base_total' => $base ?? $total, 'location_id' => $loc, 'meta' => $meta ? json_encode($meta) : null, 'created_at' => $now, 'updated_at' => $now]);
    }

    private function ref(string $no, int $ledger, string $type, float $amount, ?string $due = null, ?string $against = null, ?string $name = null): void
    {
        DB::table('voucher_bill_refs')->insert(['voucher_id' => $this->v[$no], 'ledger_id' => $ledger, 'ref_type' => $type, 'ref_name' => $name, 'against_voucher_id' => $against ? $this->v[$against] : null,
            'amount' => $amount, 'due_date' => $due, 'created_at' => now()]);
    }

    private function books(): void
    {
        // receivables: Customer A (3), B (21), C (22)
        $this->voucher('S1', 2, 3, '2026-10-01', 50000);   $this->ref('S1', 3, 'new', 50000, '2026-11-15');
        $this->voucher('S2', 2, 3, '2026-08-01', 30000);   $this->ref('S2', 3, 'new', 30000, '2026-08-31');
        $this->voucher('R1', 5, 3, '2026-09-05', 10000);   $this->ref('R1', 3, 'against', 10000, null, 'S2');
        $this->voucher('S3', 2, 21, '2026-06-01', 80000, 80000, 1, 2); $this->ref('S3', 21, 'new', 80000, '2026-07-01');
        $this->voucher('S4', 2, 21, '2026-09-20', 100, 13000, 2);   $this->ref('S4', 21, 'new', 100, '2026-10-10');   // 100 dollars, kept in dollars
        $this->voucher('S5', 2, 22, '2026-09-01', 9000);   $this->ref('S5', 22, 'new', 9000, '2026-09-30');
        $this->voucher('R2', 5, 22, '2026-09-10', 9000);   $this->ref('R2', 22, 'against', 9000, null, 'S5');   // paid in full
        // credits held for customers: a credit note with no invoice, an advance, an overpayment that was partly refunded
        $this->voucher('CN1', 6, 22, '2026-10-05', 7000);  $this->ref('CN1', 22, 'advance', 7000);
        $this->voucher('R3', 5, 3, '2026-10-02', 5000, null, 1, 1, ['advance' => ['for' => 'a deposit']]);  $this->ref('R3', 3, 'advance', 5000);
        $this->voucher('R4', 5, 21, '2026-10-03', 4000);   $this->ref('R4', 21, 'advance', 4000);
        $this->voucher('P1', 8, 21, '2026-10-06', 1500);   $this->ref('P1', 21, 'against', 1500, null, 'R4');   // refund
        // payables: Supplier (8), Trade Creditor (10)
        $this->voucher('B1', 4, 8, '2026-10-01', 40000);   $this->ref('B1', 8, 'new', 40000, '2026-10-20');
        $this->voucher('DN1', 7, 8, '2026-10-07', 3000);   $this->ref('DN1', 8, 'advance', 3000);
        $this->voucher('PM1', 8, 10, '2026-10-08', 6000);  $this->ref('PM1', 10, 'advance', 6000);
    }

    private function run_(string $side, array $options = [], ?int $loc = null): array
    {
        $def = $side === 'payables' ? new PayablesAgeingReport() : new ReceivablesAgeingReport();

        return $def->run(Scope::fromInput(['to' => self::AS_OF, 'location_id' => $loc]), $options);
    }

    private function party(array $d, string $name): array
    {
        return collect($d['rows'])->firstWhere('party', $name) ?? $this->fail("no {$name} in the ageing");
    }

    protected function person(array $permissions = ['books.view']): User
    {
        $u = new User();
        $u->id = 900 + crc32(implode(',', $permissions)) % 1000;
        $this->grant($u, $permissions);

        return $u;
    }

    protected function settings(array $values): void
    {
        Schema::dropIfExists('report_settings');
        Schema::dropIfExists('report_settings_log');
        Schema::create('report_settings', function ($t) { $t->string('setting_key', 80)->primary(); $t->text('value'); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); });
        foreach ($values as $k => $v) {
            DB::table('report_settings')->insert(['setting_key' => $k, 'value' => json_encode($v), 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    // ── the bills: parity with the old ageing ──────────────────────────

    public function test_the_bills_and_buckets_match_the_old_ageing(): void
    {
        foreach (['receivables', 'payables'] as $side) {
            $old = app(BooksReportService::class)->ageing($side, self::AS_OF);
            $new = $this->run_($side);
            $this->assertCount(count($old['rows']), array_filter($new['rows'], fn ($r) => $r['bills']), "{$side}: parties with bills");
            $map = ['b0' => 'current', 'b1' => 'd1_30', 'b2' => 'd31_60', 'b3' => 'd61_90', 'b4' => 'd90_plus'];
            foreach ($old['rows'] as $o) {
                $n = $this->party($new, $o['party']);
                $this->assertEquals($o['total'], $n['total'], "{$side} {$o['party']} total");
                foreach ($map as $nk => $ok) {
                    $this->assertEquals($o[$ok], $n['buckets'][$nk], "{$side} {$o['party']} {$ok}");
                }
                $numbers = fn (array $bills) => collect($bills)->pluck('voucher_number')->sort()->values()->all();   // the new one lists the oldest due first
                $this->assertSame($numbers($o['bills']), $numbers($n['bills']), "{$side} {$o['party']} bills");
                $this->assertEquals($o['currencies'], $n['currencies']);
                $this->assertSame($o['has_foreign'], $n['has_foreign']);
            }
            foreach ($map as $nk => $ok) {
                $this->assertEquals($old['totals'][$ok], $new['totals'][$nk], "{$side} totals {$ok}");
            }
            $this->assertEquals($old['totals']['total'], $new['totals']['total']);
        }
    }

    public function test_a_part_paid_and_a_foreign_bill_are_worked_out_as_before(): void
    {
        $d = $this->run_('receivables');
        $a = $this->party($d, 'Customer A');
        $this->assertEquals(50000, $a['buckets']['b0'], 'S1 is not yet due');
        $this->assertEquals(20000, $a['buckets']['b2'], 'S2 less the 10,000 received, 58 days late');
        $b = $this->party($d, 'Customer B');
        $this->assertEquals(13000, $b['buckets']['b1'], '100 dollars in the base currency');
        $this->assertEquals(80000, $b['buckets']['b4']);
        $this->assertEqualsCanonicalizing(['USD 100.00', 'KES 80,000.00'], explode('; ', $b['currencies']));
        $this->assertNotContains('Customer C', array_column(array_filter($d['rows'], fn ($r) => $r['bills']), 'party'), 'a bill paid in full is gone');
    }

    // ── credits and debit notes: the direction (D2, D3) ────────────────

    public function test_a_credit_note_with_no_invoice_is_a_credit_for_the_customer_on_the_receivables_side(): void
    {
        $r = $this->run_('receivables');
        $c = $this->party($r, 'Customer C');
        $this->assertSame(['CN1'], array_column($c['credits'], 'voucher_number'));
        $this->assertSame('note', $c['credits'][0]['nature']);
        $this->assertEquals(7000, $c['credit_total']);
        $this->assertEquals(0, $c['total'], 'it is not an unpaid invoice');
        $this->assertEquals(-7000, $c['net']);
        $p = $this->run_('payables');
        $this->assertNotContains('Customer C', array_column($p['rows'], 'party'), 'and it is not on the payables side');
    }

    public function test_a_debit_note_with_no_invoice_is_a_credit_with_the_supplier_on_the_payables_side(): void
    {
        $p = $this->run_('payables');
        $s = $this->party($p, 'Supplier');
        $this->assertSame(['DN1'], array_column($s['credits'], 'voucher_number'));
        $this->assertEquals(40000, $s['total']);
        $this->assertEquals(37000, $s['net'], '40,000 owed less the 3,000 debit note');
        $this->assertNotContains('Supplier', array_column($this->run_('receivables')['rows'], 'party'));
        $t = $this->party($p, 'Trade Creditor');
        $this->assertSame(['payment'], array_column($t['credits'], 'type'), 'what we prepaid a supplier');
        $this->assertSame('prepayment', $t['credits'][0]['nature']);
    }

    public function test_advances_and_overpayments_are_told_apart_and_a_refund_reduces_the_credit(): void
    {
        $r = $this->run_('receivables');
        $a = $this->party($r, 'Customer A')['credits'][0];
        $this->assertSame(['R3', 'advance', 'a deposit'], [$a['voucher_number'], $a['nature'], $a['for']]);
        $b = $this->party($r, 'Customer B')['credits'][0];
        $this->assertSame(['R4', 'overpayment'], [$b['voucher_number'], $b['nature']]);
        $this->assertEquals(2500, $b['amount'], '4,000 less the 1,500 refunded');
    }

    public function test_the_totals_keep_bills_credits_and_net_apart(): void
    {
        $r = $this->run_('receivables');
        $this->assertEquals(50000 + 20000 + 13000 + 80000, $r['totals']['total']);
        $this->assertEquals(7000 + 5000 + 2500, $r['credit_total']);
        $this->assertEquals($r['totals']['total'] - $r['credit_total'], $r['net']);
        $this->assertEquals(round(array_sum(array_column($r['rows'], 'net')), 2), $r['net']);
    }

    public function test_applying_a_credit_to_a_bill_reduces_both_by_the_same_amount(): void
    {
        $before = $this->run_('receivables');
        // what CreditService does: the advance shrinks, and an "against" row settles part of the bill
        DB::table('voucher_bill_refs')->where('voucher_id', $this->v['R3'])->where('ref_type', 'advance')->update(['amount' => 2000]);
        $this->ref('R3', 3, 'against', 3000, null, 'S1', 'credit-applied');
        $after = $this->run_('receivables');
        $a = $this->party($after, 'Customer A');
        $this->assertEquals(47000, $a['buckets']['b0'], 'the bill is down by what was applied');
        $this->assertEquals(2000, $a['credit_total'], 'and the credit is down by the same');
        $this->assertEquals($before['net'], $after['net'], 'the net never moves, so nothing is counted twice');
    }

    public function test_a_credit_used_up_leaves_the_list(): void
    {
        DB::table('voucher_bill_refs')->where('voucher_id', $this->v['R3'])->where('ref_type', 'advance')->delete();
        $this->ref('R3', 3, 'against', 5000, null, 'S1', 'credit-applied');
        $this->assertSame([], $this->party($this->run_('receivables'), 'Customer A')['credits']);
    }

    // ── the date ───────────────────────────────────────────────────────

    public function test_an_earlier_date_leaves_out_what_came_later(): void
    {
        $d = (new ReceivablesAgeingReport())->run(Scope::fromInput(['to' => '2026-08-31']), []);
        $this->assertNotContains('S1', array_merge(...array_map(fn ($r) => array_column($r['bills'], 'voucher_number'), $d['rows'])), 'S1 was not yet raised');
        $this->assertSame([], $this->party($d, 'Customer A')['credits'], 'nor was the advance');
        $this->assertEquals(30000, $this->party($d, 'Customer A')['total'], 'S2 before R1 settled it');
    }

    // ── buckets and basis from settings (D1, D4) ───────────────────────

    public function test_the_bucket_boundaries_come_from_the_settings(): void
    {
        $this->settings(['ageing_buckets' => [10, 20]]);
        $d = $this->run_('receivables');
        $this->assertSame(['Not yet due', '1–10', '11–20', 'Over 20'], array_column($d['buckets'], 'label'));
        $this->assertEquals(50000, $d['totals']['b0']);
        $this->assertEquals(0, $d['totals']['b1']);
        $this->assertEquals(13000, $d['totals']['b2'], 'S4 is 18 days late: past 10, not past 20');
        $this->assertEquals(20000 + 80000, $d['totals']['b3'], 'S2 and S3 are over 20');
    }

    public function test_the_bill_date_basis_counts_days_since_the_bill(): void
    {
        $due = $this->run_('receivables');
        $bill = $this->run_('receivables', ['basis' => 'bill_date']);
        $this->assertSame(['0–30', '31–60', '61–90', 'Over 90'], array_column($bill['buckets'], 'label'));
        $a = $this->party($bill, 'Customer A');
        $this->assertEquals(50000, $a['buckets']['b0'], 'S1 is 27 days old');
        $this->assertEquals(20000, $a['buckets']['b2'], 'S2, 88 days old');
        $this->assertEquals($due['totals']['total'], $bill['totals']['total'], 'the basis moves bills between buckets, it never changes the total');
        $this->settings(['ageing_basis' => 'bill_date']);
        $this->assertSame('bill_date', $this->run_('receivables')['basis'], 'the setting is the default');
    }

    public function test_buckets_are_built_from_boundaries(): void
    {
        $this->assertSame([[0, 0], [1, 30], [31, 60], [61, 90], [91, null]], array_map(fn ($b) => [$b['from'], $b['to']], AgeingReport::buckets([30, 60, 90], 'due_date')));
        $this->assertSame([[0, 7], [8, null]], array_map(fn ($b) => [$b['from'], $b['to']], AgeingReport::buckets([7], 'bill_date')));
    }

    // ── branches ───────────────────────────────────────────────────────

    public function test_a_branch_picks_its_own_bills_and_a_limited_person_sees_only_theirs(): void
    {
        $two = $this->run_('receivables', [], 2);
        $this->assertSame(['Customer B'], array_column(array_filter($two['rows'], fn ($r) => $r['bills']), 'party'));
        $this->assertEquals(80000, $two['totals']['total']);
        $this->limitedTo = [1];
        $one = $this->run_('receivables');
        $this->assertEquals(50000 + 20000 + 13000, $one['totals']['total'], 'S3 is at branch 2');
        $r = app(ReportEngine::class)->run('receivables-ageing', ['to' => self::AS_OF], $this->person());
        $this->assertTrue($r['banners']['branch_limited']);
    }

    // ── against the ledger ─────────────────────────────────────────────

    public function test_the_net_is_compared_with_the_ledger_balance_of_the_chosen_debtors(): void
    {
        $this->assertNull($this->run_('receivables')['control'], 'not set up in the settings yet');
        $this->settings(['ratio_inputs' => ['debtors' => ['groups' => [5], 'statements' => []]]]);
        $c = $this->run_('receivables')['control'];
        $this->assertEquals(130000, $c['ledger_balance'], 'Customer A holds the 1,000 dollars of V3 in the world');
        $this->assertEquals($this->run_('receivables')['net'], $c['net']);
        $this->assertEquals(round(130000 - $c['net'], 2), $c['difference']);
        $this->assertNull($this->run_('receivables', [], 1)['control'], 'a branch pick has no ledger figure to compare with');
    }

    // ── the file ───────────────────────────────────────────────────────

    public function test_the_file_has_the_bills_and_credits_behind_each_party(): void
    {
        [$table, $name] = app(ReportEngine::class)->exportTable('receivables-ageing', ['to' => self::AS_OF], $this->person());
        $this->assertSame('receivables-ageing', $name);
        $docs = array_column($table['rows'], 'document');
        foreach (['S1', 'S2', 'S3', 'CN1 (Credit note)', 'R3 (Receipt)'] as $d) {
            $this->assertTrue((bool) array_filter($docs, fn ($x) => str_starts_with($x, $d)), "{$d} is in the file");
        }
        $this->assertContains('S4 (USD 100.00)', $docs);
        $this->assertSame(['party' => 'Total'], array_intersect_key($table['totals'], ['party' => 1]));
        $this->assertEquals(14500, $table['totals']['credit']);
    }

    public function test_the_engine_lists_both_and_asks_for_the_basis(): void
    {
        $keys = array_column(app(ReportEngine::class)->catalogue($this->person()), 'key');
        $this->assertContains('receivables-ageing', $keys);
        $this->assertContains('payables-ageing', $keys);
        $r = app(ReportEngine::class)->run('payables-ageing', [], $this->person());
        $this->assertSame('basis', $r['report']['options'][0]['key']);
        $this->assertSame('asof', $r['report']['kind']);
    }
}
