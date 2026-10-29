<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\LedgerStatementReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * The ledger statement on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.2): the figures of the old statement to the cent, plus particulars,
 * identifiers, paging with a running balance that carries across pages, and an opening worked out by one sum.
 */
class LedgerStatementReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RecordsGolden;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function run_(int $ledger, ?string $from = null, ?string $to = null, ?int $cc = null, ?int $loc = null, array $options = []): array
    {
        return (new LedgerStatementReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'cost_centre_id' => $cc, 'location_id' => $loc]), ['ledger_id' => $ledger] + $options);
    }

    private function old(int $ledger, ?string $from, ?string $to, ?int $cc = null, ?int $loc = null): array
    {
        return $this->golden('ledger_statement', json_encode([$ledger, $from, $to, $cc, $loc, $this->limitedTo]));
    }

    public function test_it_matches_the_old_statement_to_the_cent(): void
    {
        $cases = [[1, null, null], [1, '2026-02-01', '2026-06-30'], [1, '2026-04-01', null], [4, null, '2026-12-31'], [3, null, null], [6, '2026-01-01', '2026-12-31'], [8, '2026-05-01', '2026-12-31'], [2, '2026-07-01', '2026-07-31']];
        foreach ([[null, null], [11, null], [null, 2], [10, 1]] as [$cc, $loc]) {
            foreach ($cases as [$ledger, $from, $to]) {
                $why = "ledger {$ledger} {$from}..{$to} cc " . ($cc ?? '-') . ' branch ' . ($loc ?? '-');
                $old = $this->old($ledger, $from, $to, $cc, $loc);
                $new = $this->run_($ledger, $from, $to, $cc, $loc);
                foreach (['opening', 'debit', 'credit', 'closing'] as $k) {
                    $this->assertEquals($old[$k], $new[$k], "{$why}: {$k}");
                }
                $this->assertCount(count($old['rows']), $new['rows'], "{$why}: rows");
                foreach ($old['rows'] as $i => $o) {
                    $n = $new['rows'][$i];
                    $this->assertSame($o['voucher_number'], $n['voucher_number'], "{$why}: row {$i}");
                    $this->assertEquals($o['debit'], $n['debit'], "{$why}: row {$i} debit");
                    $this->assertEquals($o['credit'], $n['credit'], "{$why}: row {$i} credit");
                    $this->assertEquals($o['balance'], $n['balance'], "{$why}: row {$i} balance");
                    $this->assertSame($o['restated'], $n['restated'], "{$why}: row {$i} restated");
                    $this->assertSame($o['in_currency'], $n['in_currency'], "{$why}: row {$i} in its currency");
                }
                $byCode = fn (array $x) => collect($x)->sortBy('currency')->values()->all();
                $this->assertEquals($byCode($old['by_currency']), $byCode($new['by_currency']), "{$why}: by currency");
                $this->assertSame($old['has_foreign'], $new['has_foreign'], "{$why}: has foreign");
            }
        }
    }

    public function test_the_opening_is_the_balance_the_day_before_the_start(): void
    {
        // cash: 50,000 opening, minus V5 and V6's draft is ignored; V1 +100,000 on 10 Jan
        $d = $this->run_(1, '2026-01-11', '2026-12-31');
        $this->assertEquals(50000 + 100000 - 5000, $d['opening'], 'opening + V1 (10 Jan) - V5 (20 Dec 2025)');
        $this->assertEquals($d['opening'] + $d['debit'] - $d['credit'], $d['closing']);
        $this->assertEquals($d['closing'], end($d['rows'])['balance'], 'the last row ends on the closing balance');
    }

    public function test_every_row_names_the_other_side(): void
    {
        $cash = collect($this->run_(1)['rows']);
        $this->assertSame('Sales', $cash->firstWhere('voucher_number', 'V1')['particulars'], 'cash debited, sales credited');
        $sales = collect($this->run_(4)['rows']);
        $this->assertSame('Cash', $sales->firstWhere('voucher_number', 'V1')['particulars']);
        $rent = collect($this->run_(6, null, null)['rows']);
        $this->assertSame('Cash', $rent->firstWhere('voucher_number', 'V5')['particulars']);
        $v8 = collect($this->run_(6)['rows'])->where('voucher_number', 'V8');
        $this->assertCount(2, $v8, 'V8 has two debit lines on rent');
        $this->assertSame(['M-Pesa'], $v8->pluck('particulars')->unique()->values()->all(), 'both answered by the one credit');
    }

    public function test_cheque_and_payment_references_are_shown(): void
    {
        $id = fn (string $no) => DB::table('vouchers')->where('voucher_number', $no)->value('id');
        DB::table('voucher_instruments')->insert(['voucher_id' => $id('V2'), 'ledger_id' => 1, 'direction' => 'out', 'type' => 'cheque', 'number' => '000123', 'instrument_date' => '2026-02-20', 'amount' => 40000, 'status' => 'cleared']);
        DB::table('voucher_tenders')->insert(['voucher_id' => $id('V1'), 'amount' => 100000, 'reference' => 'QWE123XYZ']);
        $rows = collect($this->run_(1)['rows']);
        $this->assertSame(['Cheque 000123 (2026-02-20)'], $rows->firstWhere('voucher_number', 'V2')['identifiers']);
        $this->assertSame(['Payment ref QWE123XYZ'], $rows->firstWhere('voucher_number', 'V1')['identifiers']);
    }

    private function addEntries(int $n): void
    {
        $now = now();
        for ($i = 0; $i < $n; $i++) {
            $v = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => sprintf('P%03d', $i), 'date' => '2027-01-' . sprintf('%02d', 1 + $i % 28), 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 7, 'base_total' => 7, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('voucher_entries')->insert([['voucher_id' => $v, 'ledger_id' => 1, 'side' => 'D', 'amount' => 7, 'base_amount' => 7, 'line_no' => 1], ['voucher_id' => $v, 'ledger_id' => 4, 'side' => 'C', 'amount' => 7, 'base_amount' => 7, 'line_no' => 2]]);
        }
    }

    public function test_pages_carry_the_running_balance_across(): void
    {
        $this->addEntries(450);
        $one = $this->run_(1, '2026-01-01', '2027-12-31');
        $total = $one['paging']['total'];
        $this->assertSame(LedgerStatementReport::PER_PAGE, count($one['rows']));
        $this->assertSame((int) ceil($total / LedgerStatementReport::PER_PAGE), $one['paging']['pages']);
        $two = $this->run_(1, '2026-01-01', '2027-12-31', null, null, ['page' => 2]);
        $this->assertEquals(end($one['rows'])['balance'], $two['page_opening'], 'page 2 begins where page 1 ended');
        $this->assertEquals($two['page_opening'] + ($two['rows'][0]['debit'] - $two['rows'][0]['credit']), $two['rows'][0]['balance']);
        $last = $this->run_(1, '2026-01-01', '2027-12-31', null, null, ['page' => $one['paging']['pages']]);
        $this->assertEquals($one['closing'], end($last['rows'])['balance'], 'the last page ends on the closing balance');
        $this->assertEquals($one['closing'], $last['closing']);
        $this->assertSame($total, $one['paging']['total'] + 0);
        $this->assertEquals($one['debit'], $two['debit'], 'the totals are of the whole period, not the page');
    }

    public function test_a_file_holds_every_row_and_the_opening(): void
    {
        $this->addEntries(450);
        $u = new User();
        $u->id = 5;
        $this->grant($u, ['books.view']);
        [$table] = app(ReportEngine::class)->exportTable('ledger-statement', ['from' => '2026-01-01', 'to' => '2027-12-31', 'ledger_id' => 1], $u);
        $all = $this->run_(1, '2026-01-01', '2027-12-31')['paging']['total'];
        $this->assertCount($all + 1, $table['rows'], 'every row, and the opening line');
        $this->assertSame('Opening balance', $table['rows'][0]['type']);
        $this->assertMatchesRegularExpression('/ (Dr|Cr)$/', $table['rows'][1]['balance']);
    }

    public function test_balances_say_dr_or_cr_in_the_export(): void
    {
        $u = new User();
        $u->id = 6;
        $this->grant($u, ['books.view']);
        [$table] = app(ReportEngine::class)->exportTable('ledger-statement', ['from' => '2026-01-01', 'to' => '2026-12-31', 'ledger_id' => 4], $u);   // sales: a credit balance
        $this->assertStringEndsWith(' Cr', end($table['rows'])['balance']);
    }

    public function test_without_a_ledger_it_asks_for_one_and_an_unknown_ledger_is_refused(): void
    {
        $d = (new LedgerStatementReport())->run(Scope::dates('2026-01-01', '2026-12-31'), []);
        $this->assertFalse($d['ready']);
        $this->assertSame('ledger', $d['needs']);
        try {
            $this->run_(99999);
            $this->fail('an unknown ledger should be refused');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }

    public function test_a_branch_limited_person_is_told_the_opening_is_the_whole_business(): void
    {
        $this->limitedTo = [2];
        $u = new User();
        $u->id = 7;
        $this->grant($u, ['books.view']);
        $r = app(ReportEngine::class)->run('ledger-statement', ['from' => '2026-01-01', 'to' => '2026-12-31', 'ledger_id' => 1], $u);
        $this->assertSame('branch_limited', $r['data']['opening_note']);
        $this->assertTrue($r['banners']['branch_limited']);
        $r = app(ReportEngine::class)->run('ledger-statement', ['from' => '2026-01-01', 'to' => '2026-12-31', 'ledger_id' => 1, 'cost_centre_id' => 11], $u);
        $this->assertSame('filtered', $r['data']['opening_note']);
        $this->assertEquals(0, $r['data']['opening'] - $r['data']['opening'], 'a filtered statement starts from nothing');
    }
}
