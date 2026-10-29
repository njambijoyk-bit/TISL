<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\ComplianceReportService;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\WithholdingReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The withholding certificate register on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.5): the old register's rows and totals, plus currency codes
 * with base amounts (F4), the payment identifiers (F3), and "awaiting certificate" counting everything outstanding (F2, decision 20).
 */
class WithholdingReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    private array $v = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('withholding_certificates');
        Schema::create('withholding_certificates', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->string('certificate_number')->nullable(); $t->string('direction'); $t->unsignedBigInteger('party_ledger_id')->nullable(); $t->unsignedBigInteger('tax_rate_id')->nullable();
            $t->decimal('gross_amount', 15, 2); $t->decimal('withheld_amount', 15, 2); $t->decimal('net_amount', 15, 2)->default(0); $t->string('status')->default('pending'); $t->string('credit_status')->nullable(); $t->decimal('cleared_amount', 15, 2)->default(0);
        });
        DB::table('voucher_types')->insert([['id' => 5, 'code' => 'RC', 'name' => 'Receipt', 'base_type' => 'receipt'], ['id' => 8, 'code' => 'PV', 'name' => 'Payment', 'base_type' => 'payment']]);
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->insert(['id' => 43, 'group_id' => 30, 'name' => 'WHT 5%', 'opening_balance' => 0, 'opening_side' => 'C', 'created_at' => $now, 'updated_at' => $now]);
        $this->books();
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('withholding_certificates');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function voucher(string $no, int $type, string $date, int $loc = 1, int $cur = 1, float $total = 0): int
    {
        $now = now();

        return $this->v[$no] = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'voucher_number' => $no, 'date' => $date, 'status' => 'posted', 'currency_id' => $cur, 'exchange_rate' => $cur === 2 ? 130 : 1,
            'total_amount' => $total, 'base_total' => $total, 'location_id' => $loc, 'created_at' => $now, 'updated_at' => $now]);
    }

    private function cert(string $no, string $number, string $direction, int $party, float $gross, float $withheld, string $status = 'pending', ?string $credit = null): void
    {
        DB::table('withholding_certificates')->insert(['voucher_id' => $this->v[$no], 'certificate_number' => $number, 'direction' => $direction, 'party_ledger_id' => $party, 'tax_rate_id' => 43,
            'gross_amount' => $gross, 'withheld_amount' => $withheld, 'net_amount' => $gross - $withheld, 'status' => $status, 'credit_status' => $credit]);
    }

    private function books(): void
    {
        $this->voucher('R1', 5, '2026-02-10');                    $this->cert('R1', 'C-001', 'receivable', 3, 100000, 5000, 'received', 'open');
        $this->voucher('R2', 5, '2026-04-12');                    $this->cert('R2', '', 'receivable', 3, 40000, 2000, 'pending');
        $this->voucher('R3', 5, '2026-05-02', 2, 2, 1000);        $this->cert('R3', 'C-003', 'receivable', 3, 1000, 50, 'received', 'open');   // 1,000 dollars withheld 50
        $this->voucher('P1', 8, '2026-04-20');                    $this->cert('P1', 'P-001', 'payable', 8, 20000, 1000, 'issued');
        $this->voucher('P2', 8, '2026-09-02');                    $this->cert('P2', '', 'payable', 8, 10000, 500, 'pending');
        $this->voucher('R4', 5, '2026-05-15', 2);                 $this->cert('R4', 'C-004', 'receivable', 3, 8000, 400, 'received', 'cleared');   // at branch 2
        $this->voucher('R5', 5, '2026-05-16');                    $this->cert('R5', 'X', 'receivable', 3, 1, 1, 'void');
    }

    private function run_(?string $from, ?string $to, array $options = [], ?int $loc = null): array
    {
        return (new WithholdingReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'location_id' => $loc]), $options);
    }

    protected function person(): User
    {
        $u = new User();
        $u->id = 55;
        $this->grant($u, ['books.view']);

        return $u;
    }

    public function test_the_rows_and_totals_are_the_old_registers(): void
    {
        foreach ([[null, null], ['2026-04-01', '2026-06-30'], ['2026-01-01', '2026-12-31']] as [$from, $to]) {
            $old = app(ComplianceReportService::class)->withholdingRegister($from, $to);
            $new = $this->run_($from, $to);
            $this->assertSame(array_column($old['rows'], 'certificate_number'), array_column($new['rows'], 'certificate_number'), "{$from}..{$to}: certificates");
            foreach ($old['rows'] as $i => $o) {
                $n = $new['rows'][$i];
                $this->assertEquals($o['withheld_base'], $n['withheld_base'], "{$o['certificate_number']} base");
                $this->assertSame($o['direction'], $n['direction']);
                $this->assertSame($o['party'], $n['party']);
                $this->assertSame($o['status'], $n['status']);
                $this->assertEquals($o['gross_amount'], $n['gross_amount']);
            }
            $this->assertEquals($old['totals']['receivable'], $new['totals']['receivable'], "{$from}..{$to}: receivable");
            $this->assertEquals($old['totals']['payable'], $new['totals']['payable'], "{$from}..{$to}: payable");
        }
    }

    public function test_a_void_certificate_is_left_out(): void
    {
        $this->assertNotContains('X', array_column($this->run_(null, null)['rows'], 'certificate_number'));
    }

    public function test_every_row_has_its_currency_and_a_base_amount_that_adds_up(): void
    {
        $d = $this->run_('2026-01-01', '2026-12-31');
        $usd = collect($d['rows'])->firstWhere('certificate_number', 'C-003');
        $this->assertSame(['USD', true], [$usd['currency'], $usd['foreign']]);
        $this->assertEquals(50, $usd['withheld_amount'], 'in its own currency');
        $this->assertEquals(6500, $usd['withheld_base'], '50 dollars at 130');
        $this->assertSame(['KES', false], [collect($d['rows'])->firstWhere('certificate_number', 'C-001')['currency'], collect($d['rows'])->firstWhere('certificate_number', 'C-001')['foreign']]);
        $received = array_sum(array_map(fn ($r) => $r['direction'] === 'receivable' ? $r['withheld_base'] : 0, $d['rows']));
        $this->assertEquals($d['totals']['receivable'], round($received, 2), 'the base column adds up to the total under it');
        $this->assertEquals(5000 + 2000 + 6500 + 400, $d['totals']['receivable']);
        $this->assertEquals(1000 + 500, $d['totals']['payable']);
    }

    public function test_awaiting_certificate_counts_everything_outstanding_with_the_periods_apart(): void
    {
        $d = $this->run_('2026-04-01', '2026-06-30');
        $this->assertSame(2, $d['totals']['awaiting_certificate'], 'R2 and P2, whenever they were raised');
        $this->assertSame(1, $d['totals']['awaiting_in_period'], 'only R2 is in the quarter');
        $this->assertEquals(2000 + 500, $d['totals']['awaiting_amount']);
        $this->assertSame(2, $this->run_('2026-01-01', '2026-01-31')['totals']['awaiting_certificate'], 'a month with none of its own still shows what is outstanding');
    }

    public function test_the_payment_identifiers_are_on_the_row(): void
    {
        DB::table('voucher_instruments')->insert(['voucher_id' => $this->v['P1'], 'ledger_id' => 1, 'direction' => 'out', 'type' => 'cheque', 'number' => '000777', 'instrument_date' => '2026-04-21', 'amount' => 19000, 'status' => 'cleared']);
        DB::table('voucher_tenders')->insert(['voucher_id' => $this->v['R1'], 'amount' => 95000, 'reference' => 'QWE123XYZ']);
        $rows = collect($this->run_(null, null)['rows']);
        $this->assertSame(['Cheque 000777 (2026-04-21)'], $rows->firstWhere('certificate_number', 'P-001')['identifiers']);
        $this->assertSame(['Payment ref QWE123XYZ'], $rows->firstWhere('certificate_number', 'C-001')['identifiers']);
    }

    public function test_a_branch_limited_person_and_a_branch_pick_see_their_own_certificates(): void
    {
        $this->limitedTo = [1];
        $d = $this->run_(null, null);
        $this->assertNotContains('C-004', array_column($d['rows'], 'certificate_number'), 'branch 2\'s');
        $this->assertTrue(app(ReportEngine::class)->run('withholding', [], $this->person())['banners']['branch_limited']);
        $this->limitedTo = null;
        $two = $this->run_(null, null, [], 2);
        $this->assertSame(['C-003', 'C-004'], array_column($two['rows'], 'certificate_number'));
        $this->assertSame(0, $two['totals']['awaiting_certificate'], 'the outstanding ones are at branch 1');
    }

    public function test_it_comes_a_page_at_a_time_and_a_file_holds_every_row(): void
    {
        $now = now();
        for ($i = 0; $i < 230; $i++) {
            $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => sprintf('Z%03d', $i), 'date' => '2026-11-10', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 0, 'base_total' => 0, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('withholding_certificates')->insert(['voucher_id' => $id, 'certificate_number' => sprintf('Z%03d', $i), 'direction' => 'receivable', 'party_ledger_id' => 3, 'gross_amount' => 10, 'withheld_amount' => 1, 'net_amount' => 9, 'status' => 'received']);
        }
        $one = $this->run_(null, null);
        $this->assertSame(WithholdingReport::PER_PAGE, count($one['rows']));
        $this->assertSame(2, $one['paging']['pages']);
        $two = $this->run_(null, null, ['page' => 2]);
        $this->assertSame($one['paging']['total'] - WithholdingReport::PER_PAGE, count($two['rows']));
        $this->assertEquals($one['totals']['receivable'], $two['totals']['receivable'], 'the total is of everything');
        [$table] = app(ReportEngine::class)->exportTable('withholding', ['from' => '2020-01-01', 'to' => '2030-12-31'], $this->person());
        $this->assertCount($one['paging']['total'], $table['rows']);
    }

    public function test_the_file_names_the_currency_and_the_base_amount(): void
    {
        [$table] = app(ReportEngine::class)->exportTable('withholding', ['from' => '2026-01-01', 'to' => '2026-12-31'], $this->person());
        $this->assertArrayHasKey('currency', $table['columns']);
        $this->assertArrayHasKey('withheld_base', $table['columns']);
        $usd = collect($table['rows'])->firstWhere('certificate_number', 'C-003');
        $this->assertSame(['USD', 6500.0], [$usd['currency'], (float) $usd['withheld_base']]);
        $this->assertStringContainsString('Receivable 13,900.00', $table['totals']['direction']);
    }
}
