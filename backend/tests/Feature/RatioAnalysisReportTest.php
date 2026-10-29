<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\RatioAnalysisReport;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RatioAnalysisService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Ratio analysis on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.6). Its inputs come from the Reports settings, not from group names; profit and
 * equity come from the engine's own statements. Where the definition is the old one, the figures match the old service to the cent; where an audit
 * finding changed it (G4 equity, G6 receivable days) the test says what it is now.
 */
class RatioAnalysisReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('voucher_bill_refs');
        Schema::dropIfExists('accounting_settings');   // the old service reads the stock ledger from here
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('stock_ledger_id')->nullable(); $t->timestamps(); });
        DB::table('accounting_settings')->insert(['id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('voucher_bill_refs');
        Schema::dropIfExists('accounting_settings');
        Schema::dropIfExists('report_settings');
        Schema::dropIfExists('report_settings_log');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    /** The settings table, with the ratio inputs given as input => [groups, statement codes]. */
    protected function inputs(array $inputs): void
    {
        Schema::dropIfExists('report_settings');
        Schema::dropIfExists('report_settings_log');
        Schema::create('report_settings', function ($t) { $t->string('setting_key', 80)->primary(); $t->text('value'); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); });
        $v = [];
        foreach ($inputs as $key => [$groups, $codes]) {
            $v[$key] = ['groups' => $groups, 'statements' => $codes];
        }
        DB::table('report_settings')->insert(['setting_key' => 'ratio_inputs', 'value' => json_encode($v), 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function chosen(): array
    {
        return [
            'current_assets' => [[3], []], 'current_liabilities' => [[2], []], 'bank' => [[4], []], 'debtors' => [[5], []], 'creditors' => [[10], []], 'capital' => [[1], []],
            'sales' => [[], ['IS.REV']], 'purchases' => [[7], []],
        ];
    }

    private function run_(?string $from = '2026-01-01', ?string $to = '2026-10-28'): array
    {
        return (new RatioAnalysisReport())->run(Scope::fromInput(['from' => $from, 'to' => $to]), []);
    }

    private function figure(array $d, string $key): ?float
    {
        $g = collect($d['groups'])->firstWhere('key', $key);

        return $g['amount'] ?? $g['value'] ?? null;
    }

    private function ratio(array $d, string $key): array
    {
        return collect($d['ratios'])->firstWhere('key', $key);
    }

    protected function person(): User
    {
        $u = new User();
        $u->id = 66;
        $this->grant($u, ['books.view']);

        return $u;
    }

    public function test_a_figure_is_the_sum_of_the_ledgers_the_settings_name(): void
    {
        $this->inputs($this->chosen());
        $d = $this->run_();
        // closing balances on 28 October: bank = Cash 172,500 Dr + M-Pesa 7,000 Cr; debtors = Customer A 130,000; sales = the period's credits on Sales
        $this->assertEquals(172500 - 7000, $this->figure($d, 'bank'));
        $this->assertEquals(130000, $this->figure($d, 'debtors'));
        $this->assertEquals(295000, $this->figure($d, 'sales'));
        $this->assertEquals(45000, $this->figure($d, 'purchases'));
        $this->assertEquals(30000, $d['equity']['capital']);
        $this->assertEquals(5000 + 12000, $this->figure($d, 'creditors') + 12000, 'Trade Creditor 5,000 in the creditors group');
    }

    public function test_it_agrees_with_the_old_service_where_the_definition_is_unchanged(): void
    {
        $this->inputs($this->chosen() + ['stock' => [[999], []]]);   // chosen, with nothing in it: the old service counted no stock as 0
        $new = $this->run_();
        $old = app(RatioAnalysisService::class)->compute('2026-01-01', '2026-10-28');
        foreach (['bank', 'debtors', 'creditors', 'sales', 'purchases', 'net_profit', 'working_capital'] as $k) {
            $o = collect($old['groups'])->firstWhere('key', $k);
            $this->assertEquals($o['amount'], $this->figure($new, $k), "figure {$k}");
        }
        foreach (['current', 'quick', 'gross_pct', 'net_pct', 'op_cost_pct', 'rowc'] as $k) {
            $this->assertEquals(collect($old['ratios'])->firstWhere('key', $k)['value'], $this->ratio($new, $k)['value'], "ratio {$k}");
        }
        $this->assertEquals($old['figures']['gross_profit'], $new['figures']['gross_profit']);
    }

    public function test_equity_is_capital_plus_retained_earnings_so_the_ratios_stop_drifting(): void
    {
        $this->inputs($this->chosen() + ['loans' => [[2], []]]);
        $d = $this->run_();
        $e = $d['equity'];
        $this->assertEquals(-6000, $e['retained_earlier_years'], 'rent opening 1,000 and V5\'s 5,000 in December 2025');
        $this->assertEquals(233500, $e['retained_this_year']);
        $this->assertEquals(30000 - 6000 + 233500, $e['total']);
        $net = $this->figure($d, 'net_profit');
        $this->assertEquals(round($net / $e['total'] * 100, 2), $this->ratio($d, 'roi')['value'], 'return on investment is over capital plus retained earnings');
        $old = app(RatioAnalysisService::class)->compute('2026-01-01', '2026-10-28');
        $this->assertNotEquals(collect($old['ratios'])->firstWhere('key', 'roi')['value'], $this->ratio($d, 'roi')['value'], 'the old one used capital plus this period\'s profit only');
    }

    public function test_receivable_days_use_the_bills_still_open_not_the_whole_debtors_balance(): void
    {
        $this->inputs($this->chosen());
        $now = now();
        $v = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'voucher_number' => 'S9', 'date' => '2026-10-01', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 20000, 'base_total' => 20000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('voucher_bill_refs')->insert(['voucher_id' => $v, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 20000, 'due_date' => '2026-10-10', 'created_at' => $now]);
        $d = $this->run_();
        $days = $d['days'];
        $this->assertEquals(301, $days, '1 January to 28 October');
        $this->assertEquals(round(20000 / 295000 * 301, 2), $this->ratio($d, 'recv_days')['value']);
        $this->assertEquals(20000, collect($d['groups'])->firstWhere('key', 'debtors_due')['amount'], 'overdue bills: due 10 October, today 28th');
    }

    public function test_a_figure_that_is_not_set_up_is_said_so_and_the_ratios_that_need_it_name_it(): void
    {
        $this->inputs(['current_assets' => [[3], []], 'sales' => [[], ['IS.REV']]]);
        $d = $this->run_();
        $this->assertContains('Current liabilities', $d['missing']);
        $this->assertNull($this->figure($d, 'cash'), 'cash was not chosen: not a made-up zero');
        $current = $this->ratio($d, 'current');
        $this->assertNull($current['value']);
        $this->assertSame(['Current liabilities'], $current['waiting_for']);
        $this->assertNotNull($this->ratio($d, 'gross_pct')['value'], 'those with what they need are worked out');
        $this->assertSame([], $this->ratio($d, 'gross_pct')['waiting_for']);
    }

    public function test_nothing_is_found_by_name(): void
    {
        $this->inputs($this->chosen());
        DB::table('ledger_groups')->where('id', 4)->update(['name' => 'Cash and bank holdings']);   // the old service looked for 'Bank Accounts'
        $this->assertEquals(172500 - 7000, $this->figure($this->run_(), 'bank'), 'a renamed group changes nothing');
    }

    public function test_the_period_opens_on_the_financial_year(): void
    {
        $this->inputs($this->chosen());
        $r = app(ReportEngine::class)->run('ratio-analysis', [], $this->person());
        $this->assertSame('2026-01-01', $r['data']['from']);
        $this->assertSame($r['scope']['default_period']['from'], $r['data']['from']);
    }

    public function test_a_branch_limited_person_is_told_and_the_file_lists_every_figure(): void
    {
        $this->inputs($this->chosen());
        $this->limitedTo = [1];
        $r = app(ReportEngine::class)->run('ratio-analysis', ['from' => '2026-01-01', 'to' => '2026-10-28'], $this->person());
        $this->assertTrue($r['banners']['branch_limited']);
        [$table] = app(ReportEngine::class)->exportTable('ratio-analysis', ['from' => '2026-01-01', 'to' => '2026-10-28'], $this->person());
        $this->assertContains('Current ratio', array_column($table['rows'], 'name'));
        $this->assertContains('Not set up', array_column($table['rows'], 'figure'), 'a figure not chosen reads Not set up');
    }
}
