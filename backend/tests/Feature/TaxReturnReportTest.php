<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\TaxReturnReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The tax return on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.4). The per-rate figures and the supplies split are the old return's, to the cent;
 * what changes is that the start and the end of the period are worked out on their own dates and for the person's branches (audit E1 to E4), with a
 * proof from one to the other.
 */
class TaxReturnReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RecordsGolden;
    use Concerns\StandsInForAccess;

    private array $v = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['voucher_items', 'voucher_item_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable();
            $t->string('classification')->nullable(); $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable();
            $t->unsignedBigInteger('unit_of_measure_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
        });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->decimal('amount', 15, 2); $t->boolean('is_header')->default(false); $t->text('gift_meta')->nullable(); });
        Schema::create('voucher_item_taxes', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('ledger_id'); $t->decimal('base_amount', 15, 2); });
        DB::table('voucher_types')->insert([['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase'], ['id' => 6, 'code' => 'CN', 'name' => 'Credit note', 'base_type' => 'credit_note']]);
        $now = now();
        foreach ([
            ['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 31, 'parent_id' => 30, 'name' => 'VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'code' => 'VAT', 'application_mode' => 'additive', 'control_ledger_id' => 40, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 32, 'parent_id' => 30, 'name' => 'Withholding tax', 'nature' => 'liability', 'behaviour' => 'tax', 'code' => 'WHT', 'application_mode' => 'withheld', 'payable_ledger_id' => 41, 'receivable_ledger_id' => 42, 'created_at' => $now, 'updated_at' => $now],
        ] as $row) {
            DB::table('ledger_groups')->insert($row);
        }
        foreach ([
            ['id' => 40, 'group_id' => 31, 'name' => 'VAT Account', 'opening_balance' => 1000, 'opening_side' => 'C', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 41, 'group_id' => 32, 'name' => 'Withholding tax Payable', 'opening_balance' => 0, 'opening_side' => 'C', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 42, 'group_id' => 3, 'name' => 'Withholding tax Receivable', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['id' => 43, 'group_id' => 31, 'name' => 'VAT 16%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => 16, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 44, 'group_id' => 31, 'name' => 'VAT 8%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => 8, 'created_at' => $now, 'updated_at' => $now],
            ['id' => 45, 'group_id' => 6, 'name' => 'Exempt sales', 'opening_balance' => 0, 'opening_side' => 'D', 'tax_nature' => 'exempt', 'created_at' => $now, 'updated_at' => $now],
        ] as $row) {
            DB::table('ledgers')->insert($row);
        }
        DB::table('ledgers')->whereIn('id', [4, 5])->update(['tax_nature' => 'taxable']);
        $this->books();
    }

    protected function tearDown(): void
    {
        foreach (['voucher_items', 'voucher_item_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    /** One voucher with its entries [[ledger, side, amount], ...] and its tax items [[item ledger, amount, [tax ledger => base]], ...]. */
    private function book(string $no, int $type, string $date, int $loc, array $entries, array $items = []): void
    {
        $now = now();
        $total = array_sum(array_map(fn ($e) => $e[1] === 'D' ? $e[2] : 0, $entries));
        $id = $this->v[$no] = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'voucher_number' => $no, 'date' => $date, 'status' => 'posted', 'currency_id' => 1, 'total_amount' => $total, 'base_total' => $total,
            'location_id' => $loc, 'created_at' => $now, 'updated_at' => $now]);
        foreach ($entries as $i => [$ledger, $side, $amt]) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $ledger, 'side' => $side, 'amount' => $amt, 'base_amount' => $amt, 'location_id' => $loc, 'line_no' => $i + 1]);
        }
        foreach ($items as [$ledger, $amount, $taxes]) {
            $item = DB::table('voucher_items')->insertGetId(['voucher_id' => $id, 'ledger_id' => $ledger, 'amount' => $amount]);
            foreach ($taxes as $taxLedger => $base) {
                DB::table('voucher_item_taxes')->insert(['item_id' => $item, 'ledger_id' => $taxLedger, 'base_amount' => $base]);
            }
        }
    }

    private function books(): void
    {
        $this->book('T1', 2, '2026-03-10', 1, [[3, 'D', 11600], [4, 'C', 10000], [43, 'C', 1600]], [[4, 10000, [43 => 10000]]]);                       // a sale before the quarter
        $this->book('T7', 2, '2026-03-20', 2, [[3, 'D', 1080], [4, 'C', 1000], [44, 'C', 80]], [[4, 1000, [44 => 1000]]]);                            // a sale at branch 2
        $this->book('T2', 4, '2026-04-05', 1, [[5, 'D', 5000], [43, 'D', 800], [8, 'C', 5800]], [[5, 5000, [43 => 5000]]]);                           // a purchase
        $this->book('W1', 2, '2026-04-10', 1, [[42, 'D', 300], [1, 'D', 2700], [3, 'C', 3000]]);                                                     // customers withheld 300
        $this->book('W2', 4, '2026-04-12', 1, [[8, 'D', 1000], [41, 'C', 100], [1, 'C', 900]]);                                                      // we withheld 100
        $this->book('T3', 2, '2026-05-01', 1, [[3, 'D', 3000], [45, 'C', 3000]], [[45, 3000, []]]);                                                  // an exempt sale
        $this->book('T4', 6, '2026-05-20', 1, [[4, 'D', 1000], [43, 'D', 160], [3, 'C', 1160]], [[4, 1000, [43 => 1000]]]);                           // a credit note
        $this->book('T5', 1, '2026-06-15', 1, [[40, 'D', 1000], [1, 'C', 1000]]);                                                                    // paid to the authority
        $this->book('T6', 2, '2026-09-01', 1, [[3, 'D', 2320], [4, 'C', 2000], [43, 'C', 320]], [[4, 2000, [43 => 2000]]]);                          // a sale after the quarter
    }

    private function run_(string $from, string $to, ?int $loc = null): array
    {
        return (new TaxReturnReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'location_id' => $loc]), []);
    }

    private function type(array $d, string $code): array
    {
        return collect($d['types'])->firstWhere('code', $code) ?? $this->fail("no {$code}");
    }

    protected function person(): User
    {
        $u = new User();
        $u->id = 77;
        $this->grant($u, ['books.view']);

        return $u;
    }

    public function test_the_rates_bases_and_supplies_are_the_old_returns(): void
    {
        foreach ([['2026-04-01', '2026-06-30'], ['2026-01-01', '2026-12-31'], ['2026-09-01', '2026-09-30']] as [$from, $to]) {
            $old = $this->golden('tax_return', json_encode([$from, $to]));
            $new = $this->run_($from, $to);
            $this->assertSame(array_column($old['types'], 'code'), array_column($new['types'], 'code'));
            foreach ($old['types'] as $o) {
                $n = $this->type($new, $o['code']);
                $this->assertEquals($o['rows'], $n['rows'], "{$o['code']} {$from}..{$to}: rows");
            }
            $this->assertEquals($old['totals']['output'], $new['totals']['output']);
            $this->assertEquals($old['totals']['input'], $new['totals']['input']);
            $this->assertEquals($old['totals']['net'], $new['totals']['net']);
            foreach ($new['supplies'] as $s) {
                $key = $s['key'];
                $this->assertEquals($old['supplies']['sales'][$key] ?? 0, $s['sales'], "{$from}..{$to}: sales {$key}");
                $this->assertEquals($old['supplies']['purchases'][$key] ?? 0, $s['purchases'], "{$from}..{$to}: purchases {$key}");
            }
            $oldKeys = array_keys(array_filter(array_merge($old['supplies']['sales'], $old['supplies']['purchases']), fn ($v) => abs($v) >= 0.005) + array_filter($old['supplies']['purchases'], fn ($v) => abs($v) >= 0.005));
            $this->assertEqualsCanonicalizing(array_unique($oldKeys), array_column($new['supplies'], 'key'), 'the same natures are listed');
        }
    }

    public function test_the_closing_is_what_was_owed_on_the_last_day_not_today(): void
    {
        $d = $this->run_('2026-04-01', '2026-06-30');
        $vat = $this->type($d, 'VAT');
        $this->assertEquals(720, $vat['closing_owed'], 'at 30 June: 16% ledger 640 + 8% ledger 80 + the account 0 after the payment');
        $this->assertEquals(1040, $this->type($this->run_('2026-04-01', '2026-12-31'), 'VAT')['closing_owed'], 'and for a period that reaches today, today\'s figure');
    }

    public function test_the_start_is_what_was_owed_the_day_before_and_the_two_ends_are_proved(): void
    {
        $d = $this->run_('2026-04-01', '2026-06-30');
        $vat = $this->type($d, 'VAT');
        $this->assertEquals(1000 + 1600 + 80, $vat['brought_forward'], 'the account (opening) + the two rates on 31 March');
        $this->assertSame('2026-03-31', $d['brought_forward_on']);
        $this->assertEquals(-960, $vat['net_movement'], 'no output in the quarter; 800 and 160 reclaimed');
        $this->assertEquals(1000, $vat['settled'], 'the payment to the authority');
        foreach ($d['types'] as $t) {
            $this->assertEquals($t['closing_owed'], round($t['brought_forward'] + $t['net_movement'] - $t['settled'], 2), "{$t['code']}: start + movement - settled = end");
        }
    }

    public function test_a_return_with_no_start_date_begins_from_nothing(): void
    {
        $d = (new TaxReturnReport())->run(Scope::fromInput(['to' => '2026-06-30']), []);
        $this->assertEquals(0, $this->type($d, 'VAT')['brought_forward'], 'not the whole balance (audit E2)');
        $this->assertNull($d['brought_forward_on']);
    }

    public function test_a_tax_withheld_at_source_has_its_start_and_end_too(): void
    {
        $d = $this->run_('2026-04-01', '2026-06-30');
        $w = $this->type($d, 'WHT');
        $this->assertSame('withheld', $w['mode']);
        $this->assertEquals(0, $w['brought_forward']);
        $this->assertEquals(-200, $w['closing_owed'], 'we withheld 100 and customers withheld 300 from us: the authority owes us 200');
        $this->assertEquals(0, $w['settled']);
        $this->assertEquals([300.0, 100.0], [$w['rows'][0]['output'], $w['rows'][1]['input']]);
    }

    public function test_the_supplies_are_split_by_the_tax_nature_and_notes_reduce_them(): void
    {
        $d = $this->run_('2026-04-01', '2026-06-30');
        $by = collect($d['supplies'])->keyBy('key');
        $this->assertEquals(-1000, $by['taxable']['sales'], 'the credit note');
        $this->assertEquals(5000, $by['taxable']['purchases']);
        $this->assertEquals(3000, $by['exempt']['sales']);
        $this->assertSame('Standard-rated', $by['taxable']['label']);
        $this->assertArrayNotHasKey('zero_rated', $by->all(), 'nothing zero-rated: not listed');
    }

    public function test_a_branch_limited_person_gets_their_branches_and_the_banner(): void
    {
        $this->limitedTo = [1];   // the sale at branch 2 is not theirs
        $vat = $this->type($this->run_('2026-04-01', '2026-06-30'), 'VAT');
        $this->assertEquals(1000 + 1600, $vat['brought_forward'], 'the account\'s opening is the whole business\'s; the 8% ledger\'s sale is at branch 2');
        $this->assertEquals(640, $vat['closing_owed']);
        $r = app(ReportEngine::class)->run('tax-return', ['from' => '2026-04-01', 'to' => '2026-06-30'], $this->person());
        $this->assertTrue($r['banners']['branch_limited']);
    }

    public function test_a_branch_picked_narrows_the_return_to_it(): void
    {
        $vat = $this->type($this->run_('2026-01-01', '2026-06-30', 2), 'VAT');
        $this->assertSame(['VAT 8%'], array_column($vat['rows'], 'label'));
        $this->assertEquals(80, $vat['closing_owed'], 'only branch 2\'s movement; the opening belongs to the whole business');
    }

    public function test_the_file_runs_from_the_start_to_the_end_and_lists_the_supplies(): void
    {
        [$table, $name] = app(ReportEngine::class)->exportTable('tax-return', ['from' => '2026-04-01', 'to' => '2026-06-30'], $this->person());
        $this->assertSame('tax-return', $name);
        $rates = array_column($table['rows'], 'rate');
        $this->assertContains('Owed at the start (2026-03-31)', $rates);
        $this->assertContains('Owed at the end (2026-06-30)', $rates);
        $this->assertContains('Paid to the authority and other entries', $rates);
        $this->assertContains('Standard-rated', $rates);
        $this->assertSame('Total', $table['totals']['rate']);
    }
}
