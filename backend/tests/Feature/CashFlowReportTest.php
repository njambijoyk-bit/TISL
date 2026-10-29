<?php

namespace Tests\Feature;

use App\Services\Books\CashFlowCategories;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\CashFlowReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The cash flow statement (docs/BOOKS_REPORTS_PLAN.md, step 8): opening cash + net cash flow = closing cash, by both methods, for several periods. */
class CashFlowReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

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

    private function run_(?string $from, string $to, string $method = 'indirect'): array
    {
        return (new CashFlowReport())->run(Scope::dates($from, $to), ['method' => $method]);
    }

    private function periods(): array
    {
        return [[null, '2026-12-31'], ['2026-01-01', '2026-12-31'], ['2026-02-01', '2026-04-30'], ['2026-05-01', '2026-09-30'], ['2026-07-01', '2026-07-31'], ['2025-01-01', '2025-12-31']];
    }

    public function test_opening_cash_plus_net_cash_flow_is_closing_cash_for_several_periods(): void
    {
        foreach ($this->periods() as [$from, $to]) {
            $d = $this->run_($from, $to);
            $why = ($from ?? 'start') . '..' . $to;
            $this->assertEquals($d['closing_cash'], round($d['opening_cash'] + $d['net_change'], 2), $why);
            $sections = $d['totals']['operating'] + $d['totals']['investing'] + $d['totals']['financing'];
            $this->assertEquals($d['net_change'], round($sections, 2), "{$why}: operating + investing + financing is the change in cash");
            $this->assertEquals(0.0, $d['difference'], "{$why}: nothing left over");
        }
    }

    public function test_closing_cash_is_what_the_cash_and_bank_ledgers_hold(): void
    {
        $d = $this->run_('2026-01-01', '2026-12-31');
        $balances = app(LedgerBalances::class);
        $held = $balances->balance(1, '2026-12-31') + $balances->balance(2, '2026-12-31');   // Cash and M-Pesa, in the Bank Accounts group
        $this->assertEquals(round($held, 2), $d['closing_cash']);
        $opening = $balances->balance(1, '2025-12-31') + $balances->balance(2, '2025-12-31');
        $this->assertEquals(round($opening, 2), $d['opening_cash']);
    }

    public function test_the_direct_method_agrees_with_the_indirect_one(): void
    {
        foreach ($this->periods() as [$from, $to]) {
            $in = $this->run_($from, $to);
            $dr = $this->run_($from, $to, 'direct');
            $this->assertTrue($dr['reconciles'], ($from ?? 'start') . '..' . $to);
            $this->assertEquals($in['net_change'], round($dr['totals']['receipts'] + $dr['totals']['payments'], 2));
        }
    }

    public function test_the_sections_come_from_the_statement_lines(): void
    {
        $d = $this->run_('2026-01-01', '2026-12-31');
        $this->assertSame('profit', $d['sections']['operating']['rows'][0]['key']);
        $this->assertSame('operating', (new CashFlowCategories())->of(5), 'trade receivables');
        $this->assertSame('financing', CashFlowCategories::defaultFor('BS.E.CAP'));
        $this->assertSame('investing', CashFlowCategories::defaultFor('BS.A.NC.PPE'));
        $this->assertSame('financing', CashFlowCategories::defaultFor('BS.L.C.BORR'));
        $this->assertSame('operating', CashFlowCategories::defaultFor('BS.L.C.PAY'));
        // a category set on a row beats the default, and a child takes its parent's
        DB::table('statements')->where('id', 6)->update(['cash_flow_category' => 'investing']);
        $this->assertSame('investing', (new CashFlowCategories())->of(6));
    }

    public function test_a_non_cash_category_on_both_sides_still_reconciles(): void
    {
        // rent (Operating expenses line 11) and the other current assets line 6 marked non-cash: both sides of a depreciation-like entry
        DB::table('statements')->whereIn('id', [6, 11])->update(['cash_flow_category' => 'non_cash']);
        $d = $this->run_('2026-01-01', '2026-12-31');
        $this->assertEquals($d['net_change'], round($d['totals']['operating'] + $d['totals']['investing'] + $d['totals']['financing'], 2));
        $this->assertSame('non_cash', $d['sections']['operating']['rows'][1]['key'] ?? null, 'the expense is added back');
    }
}
