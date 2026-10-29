<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Reports\TrialBalanceReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Profit and loss, balance sheet and the trial balance's group view on the engine (docs/BOOKS_REPORTS_PLAN.md, step 5). The heart of it is parity: the
 * new reports must give the figures the old ones give, to the cent, on the same books. See Concerns\CreatesBooksLedgerWorld.
 */
class StatementReportsTest extends TestCase
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
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings');   // DDL is not rolled back on MySQL
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings_log');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function person(array $permissions = ['books.view']): User
    {
        $u = new User();
        $u->id = 100 + crc32(implode(',', $permissions)) % 100000;
        $this->grant($u, $permissions);

        return $u;
    }

    private function scope(?string $from, ?string $to, ?int $cc = null, ?int $loc = null): Scope
    {
        return Scope::fromInput(['from' => $from, 'to' => $to, 'cost_centre_id' => $cc, 'location_id' => $loc]);
    }

    private function oldPl(?string $from, ?string $to, ?int $cc = null, ?int $loc = null): array
    {
        return $this->golden('profit_loss', json_encode([$from, $to, $cc, $loc, $this->limitedTo]));
    }

    private function newPl(?string $from, ?string $to, ?int $cc = null, ?int $loc = null, array $options = []): array
    {
        return (new ProfitLossReport())->run($this->scope($from, $to, $cc, $loc), $options);
    }

    /** The ledger rows of a statement by ledger id: id => total column. */
    private function ledgerAmounts(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            if ($r['type'] === 'ledger') {
                $out[$r['ledger_id']] = $r['amounts']['total'];
            }
        }

        return $out;
    }

    private function row(array $rows, string $key): array
    {
        foreach ($rows as $r) {
            if ($r['key'] === $key) {
                return $r;
            }
        }
        $this->fail("no row {$key}: " . implode(', ', array_column($rows, 'key')));
    }

    // ── profit and loss: parity with the old report ────────────────────

    public function test_the_profit_and_loss_matches_the_old_report(): void
    {
        foreach ([['2026-01-01', '2026-12-31'], [null, null], ['2026-04-01', '2026-04-30'], ['2026-07-01', '2026-09-30'], ['2025-01-01', '2025-12-31'], ['2027-01-01', '2027-12-31']] as [$from, $to]) {
            $old = $this->oldPl($from, $to);
            $new = $this->newPl($from, $to);
            $why = ($from ?? 'start') . ' to ' . ($to ?? 'end');
            foreach (['direct_income', 'direct_expense', 'gross_profit', 'indirect_income', 'indirect_expense', 'net_profit'] as $k) {
                $this->assertEquals($old['totals'][$k], $new['totals'][$k], "{$why}: {$k}");
            }
            $oldLedgers = [];
            foreach ($old['sections'] as $rows) {
                foreach ($rows as $r) {
                    $oldLedgers[$r['ledger_id']] = $r['amount'];
                }
            }
            $newLedgers = $this->ledgerAmounts($new['rows']);
            ksort($oldLedgers);
            ksort($newLedgers);
            $this->assertEquals($oldLedgers, $newLedgers, "{$why}: every ledger's amount, and no ledger more or less");
        }
    }

    public function test_the_profit_and_loss_matches_with_a_cost_centre_a_branch_or_a_branch_limit(): void
    {
        foreach ([[10, null], [11, null], [null, 1], [null, 2], [10, 1]] as [$cc, $loc]) {
            $this->assertEquals($this->oldPl('2026-01-01', '2026-12-31', $cc, $loc)['totals'], $this->newPl('2026-01-01', '2026-12-31', $cc, $loc)['totals'], "cost centre {$cc}, branch {$loc}");
        }
        $this->limitedTo = [2];
        $this->assertEquals($this->oldPl('2026-01-01', '2026-12-31')['totals'], $this->newPl('2026-01-01', '2026-12-31')['totals'], 'limited to branch 2');
    }

    // ── profit and loss: the statement ─────────────────────────────────

    public function test_the_profit_and_loss_builds_gross_operating_and_net_profit_from_the_lines(): void
    {
        $d = $this->newPl('2026-01-01', '2026-12-31');
        $this->assertTrue($d['ready']);
        $sales = 100000 + 130000 + 65000;   // V1, V3 (dollars), V4 (restated at 130)
        $this->assertEquals($sales, $this->row($d['rows'], 'line:IS.REV')['amounts']['total']);
        $this->assertEquals(40000 + 5000, $this->row($d['rows'], 'line:IS.COGS')['amounts']['total'], 'purchases: V2 and V10');
        $gross = $sales - 45000;
        $this->assertEquals($gross, $this->row($d['rows'], 'subtotal:gross_profit')['amounts']['total']);
        $this->assertEquals(12000 + 7000 + 1000 - 1000, 19000 + 0, 'rent in the year: V7, V8; (the 1,000 opening and V5 are earlier)');   // arithmetic note only
        $opex = $this->row($d['rows'], 'line:IS.OPEX')['amounts']['total'];
        $this->assertEquals(19000, $opex, 'rent V7 12,000 + V8 7,000; the draft, V5 and the opening balance are not in this year');
        $other = 2000 + 800;   // interest income V9 (Other income line) and Misc income V11 (no line: not on a statement line, operating tier)
        $operating = $gross + $other - $opex;
        $fin = $this->row($d['rows'], 'line:IS.FINCOST')['amounts']['total'];
        $this->assertEquals(300, $fin, 'bank charges sit on Finance costs by their own line');
        $row = $this->row($d['rows'], 'subtotal:operating_profit');
        $this->assertEquals($operating, $row['amounts']['total']);
        $this->assertEquals($operating - 300, $this->row($d['rows'], 'subtotal:net_profit')['amounts']['total'], 'no tax lines have anything: net follows finance costs; "profit before tax" is not shown');
        $this->assertSame('total', $this->row($d['rows'], 'subtotal:net_profit')['type']);
        $keys = array_column($d['rows'], 'key');
        $this->assertFalse(in_array('subtotal:profit_before_tax', $keys, true));
        $this->assertTrue(array_search('subtotal:gross_profit', $keys) < array_search('line:IS.OPEX', $keys), 'gross profit comes after the trading lines and before the operating ones');
        $this->assertTrue(array_search('line:IS.OPEX', $keys) < array_search('subtotal:operating_profit', $keys));
        $this->assertTrue(array_search('subtotal:operating_profit', $keys) < array_search('line:IS.FINCOST', $keys));
        $this->assertSame(array_key_last($keys), array_search('subtotal:net_profit', $keys), 'net profit is last');
    }

    public function test_a_ledger_on_no_line_is_still_in_the_profit_and_shown_apart(): void
    {
        $d = $this->newPl('2026-01-01', '2026-12-31');
        $this->assertSame(1, $d['unclassified']);
        $loose = $this->row($d['rows'], 'line:IS.LOOSE.INCOME');
        $this->assertSame('Income not on a statement line', $loose['name']);
        $this->assertEquals(800, $loose['amounts']['total']);
        $this->assertArrayHasKey('ledger:11', array_column($d['rows'], null, 'key'));
        $this->assertEquals($this->oldPl('2026-01-01', '2026-12-31')['totals']['net_profit'], $d['totals']['net_profit'], 'so the profit is the same as the old report\'s');
    }

    public function test_the_margins_are_a_share_of_revenue(): void
    {
        $d = $this->newPl('2026-01-01', '2026-12-31');
        $this->assertEquals(round($d['profit']['gross']['total'] / $d['revenue']['total'] * 100, 2), $d['margins']['gross']['total']);
        $this->assertEquals(round($d['profit']['net']['total'] / $d['revenue']['total'] * 100, 2), $d['margins']['net']['total']);
        $none = $this->newPl('2025-01-01', '2025-01-31');   // nothing sold: no margin to speak of
        $this->assertNull($none['margins']['gross']['total']);
    }

    public function test_month_by_month_adds_up_to_the_period(): void
    {
        $d = $this->newPl('2026-01-01', '2026-10-28', null, null, ['columns' => 'months']);
        $this->assertSame(['total', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], $d['columns']);
        foreach ($d['rows'] as $r) {
            $months = array_sum(array_slice($r['amounts'], 1));
            $this->assertEquals($r['amounts']['total'], round($months, 2), "{$r['key']}: the months add up to the total");
        }
        $this->assertEquals(100000, $this->row($d['rows'], 'line:IS.REV')['amounts']['2026-01'], 'January sales: V1');
        $this->assertEquals(130000, $this->row($d['rows'], 'line:IS.REV')['amounts']['2026-03']);
        $this->assertEquals(65000, $this->row($d['rows'], 'line:IS.REV')['amounts']['2026-04']);
        $this->assertEquals($this->newPl('2026-01-01', '2026-10-28')['totals'], $d['totals'], 'the totals are the same either way');
    }

    public function test_a_line_with_nothing_on_it_is_hidden_unless_zero_balances_are_asked_for(): void
    {
        $keys = array_column($this->newPl('2026-01-01', '2026-12-31')['rows'], 'key');
        $this->assertNotContains('line:IS.TAX', $keys);
        $this->assertNotContains('line:IS.FININC', $keys);

        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings');
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings_log');
        \Illuminate\Support\Facades\Schema::create('report_settings', function ($t) {
            $t->string('setting_key', 80)->primary();
            $t->text('value');
            $t->timestamps();
        });
        \Illuminate\Support\Facades\Schema::create('report_settings_log', function ($t) {
            $t->id();
        });
        DB::table('report_settings')->insert(['setting_key' => 'show_zero_balances', 'value' => 'true', 'created_at' => now(), 'updated_at' => now()]);
        $keys = array_column($this->newPl('2026-01-01', '2026-12-31')['rows'], 'key');
        $this->assertContains('line:IS.TAX', $keys);
    }

    // ── balance sheet: parity with the old report ──────────────────────

    public function test_the_balance_sheet_matches_the_old_report(): void
    {
        foreach ([null, '2025-12-31', '2026-03-31', '2026-06-30', '2026-12-31', '2024-12-31'] as $asOf) {
            $old = $this->golden('balance_sheet', json_encode([$asOf, $this->limitedTo]));
            $new = (new BalanceSheetReport())->run(Scope::dates(null, $asOf), []);
            $why = 'as of ' . ($asOf ?? 'today');
            $this->assertEquals($old['total_assets'], $new['total_assets'], "{$why}: total assets");
            $this->assertEquals($old['total_liabilities'], $new['total_liabilities'], "{$why}: total equity and liabilities");
            $this->assertSame($old['balanced'], $new['balanced'], "{$why}: balanced");
            $this->assertEquals($old['opening_difference'], $new['opening_difference'], "{$why}: opening difference");

            $oldLedgers = [];
            foreach (array_merge($old['assets'], $old['liabilities']) as $r) {
                if ($r['ledger_id']) {
                    $oldLedgers[$r['ledger_id']] = $r['amount'];
                }
            }
            $oldProfit = collect($old['liabilities'])->first(fn ($r) => $r['ledger_id'] === null && in_array($r['group'], ['Capital'], true));
            $newLedgers = $this->ledgerAmounts($new['rows']);
            ksort($oldLedgers);
            ksort($newLedgers);
            $this->assertEquals($oldLedgers, $newLedgers, "{$why}: every ledger's amount, and no ledger more or less");
            $this->assertEquals($oldProfit['amount'] ?? 0.0, round($new['retained']['prior'] + $new['retained']['current'], 2), "{$why}: the two retained lines add up to the old 'Profit & Loss (to date)'");
        }
    }

    public function test_the_balance_sheet_matches_for_a_branch_limited_person(): void
    {
        $this->limitedTo = [1];
        $old = $this->golden('balance_sheet', json_encode(['2026-12-31', $this->limitedTo]));
        $new = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertEquals($old['total_assets'], $new['total_assets']);
        $this->assertEquals($old['total_liabilities'], $new['total_liabilities']);
    }

    // ── balance sheet: the statement ───────────────────────────────────

    public function test_the_balance_sheet_has_assets_equity_and_liabilities_that_balance(): void
    {
        $d = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertTrue($d['ready']);
        $this->assertSame(['BS.A', 'BS.E', 'BS.L'], array_keys($d['headings']));
        $this->assertSame(['heading:BS.A', 'heading:BS.E', 'heading:BS.L'], array_values(array_map(fn ($r) => $r['key'], array_filter($d['rows'], fn ($r) => $r['type'] === 'heading' && $r['depth'] === 0))));
        $this->assertEquals($d['totals']['assets'], $d['headings']['BS.A'], 'the Assets section adds up to the total assets');
        $this->assertEquals($d['totals']['equity'], $d['headings']['BS.E']);
        $this->assertEquals($d['totals']['liabilities'], $d['headings']['BS.L']);
        $this->assertEquals($d['totals']['liabilities_and_equity'], round($d['headings']['BS.E'] + $d['headings']['BS.L'], 2), 'sections add up to the figure the old report gave');
        $this->assertTrue($d['balanced'] || $d['opening_difference'] != 0.0);
        $this->assertEquals(0.0, round($d['total_assets'] - $d['total_liabilities'], 2), 'the books balance once the opening difference is carried');
    }

    // ── step 7: changes in equity and the adjusted trial balance ────────

    public function test_changes_in_equity_close_on_the_balance_sheets_equity_and_the_columns_add_across(): void
    {
        foreach ([[null, '2026-12-31'], ['2026-01-01', '2026-12-31'], ['2026-04-01', '2026-09-30'], ['2026-06-01', '2026-06-30']] as [$from, $to]) {
            $e = (new \App\Services\Books\Engine\Reports\ChangesInEquityReport())->run(Scope::dates($from, $to), []);
            $bs = (new BalanceSheetReport())->run(Scope::dates(null, $to), []);
            $this->assertTrue($e['ready']);
            $this->assertEquals($bs['totals']['equity'], $e['totals']['closing'], "{$from}..{$to}: the closing equity is the balance sheet's");
            foreach ($e['rows'] as $r) {
                $this->assertEquals($r['closing'], round($r['opening'] + $r['profit'] + $r['other'], 2), $r['name'] . ': opening + profit + other = closing');
            }
            $retained = collect($e['rows'])->firstWhere('key', 'retained');
            $this->assertEquals($bs['retained']['prior'] + $bs['retained']['current'], $retained['closing'], 'retained earnings agree');
        }
    }

    public function test_the_adjusted_trial_balance_has_no_income_or_expense_ledgers_and_balances(): void
    {
        $d = (new \App\Services\Books\Engine\Reports\AdjustedTrialBalanceReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertTrue($d['balanced']);
        $this->assertEquals($d['totals']['debit'], $d['totals']['credit']);
        $names = array_column($d['rows'], 'name');
        $this->assertNotContains('Sales', $names);
        $this->assertNotContains('Rent', $names);
        $this->assertContains('Retained earnings (profit and loss of all years)', $names);
        $bs = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $retained = collect($d['rows'])->first(fn ($r) => str_starts_with($r['name'], 'Retained'));
        $this->assertEquals(round($bs['retained']['prior'] + $bs['retained']['current'], 2), round($retained['credit'] - $retained['debit'], 2));
    }

    public function test_retained_earnings_are_split_into_previous_years_and_this_year(): void
    {
        $d = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertSame('2026-01-01', $d['year_start']);
        // before 2026: rent V5 5,000 and the 1,000 opening on Rent, as a loss
        $this->assertEquals(-6000, $d['retained']['prior']);
        $pl = $this->newPl('2026-01-01', '2026-12-31')['totals']['net_profit'];
        $this->assertEquals($pl, $d['retained']['current'], 'this year\'s profit is the profit and loss of the year');
        $this->assertEquals(-6000, $this->row($d['rows'], 'retained:prior')['amounts']['total']);
        $this->assertSame('Retained earnings: previous years', $this->row($d['rows'], 'retained:prior')['name']);
        $before = (new BalanceSheetReport())->run(Scope::dates(null, '2025-12-31'), []);
        $this->assertSame('2025-01-01', $before['year_start'], 'no financial year covers it: its calendar year');
        $this->assertEquals(-6000, $before['retained']['prior'] + $before['retained']['current'], 'all of it in the year it was made');
    }

    public function test_assets_and_liabilities_on_no_line_and_the_opening_difference_are_shown_apart(): void
    {
        $d = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertSame(1, $d['unclassified']);
        $supplier = $this->row($d['rows'], 'line:BS.LOOSE.LIABILITY');
        $this->assertSame('Liabilities not on a statement line', $supplier['name']);
        $this->assertEquals(12000, $supplier['amounts']['total']);
        $this->assertSame('heading:BS.L', $supplier['parent']);
        $this->assertSame('line:BS.LOOSE.LIABILITY', $this->row($d['rows'], 'ledger:8')['parent']);
        // openings: Cash 50,000 Dr, Rent 1,000 Dr, Capital 30,000 Cr: 21,000 heavy on the debit side, carried on the liabilities side
        $this->assertEquals(21000, $d['opening_difference']);
        $placeholder = $this->row($d['rows'], 'placeholder:opening');
        $this->assertTrue($placeholder['placeholder']);
        $this->assertEquals(21000, $placeholder['amounts']['total']);
        $this->assertSame('heading:BS.L', $placeholder['parent']);
    }

    public function test_the_balance_sheet_ignores_a_cost_centre_or_branch(): void
    {
        $plain = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $asked = (new BalanceSheetReport())->run($this->scope(null, '2026-12-31', 10, 1), []);
        $this->assertEquals($plain['totals'], $asked['totals']);
    }

    // ── the engine around them ─────────────────────────────────────────

    public function test_the_engine_compares_a_period_and_a_date(): void
    {
        $engine = app(ReportEngine::class);
        $pl = $engine->run('profit-loss', ['from' => '2026-04-01', 'to' => '2026-04-30', 'compare' => 'previous_period'], $this->person());
        $this->assertSame(['mode' => 'previous_period', 'from' => '2026-03-01', 'to' => '2026-03-31'], array_diff_key($pl['compare'], ['data' => 1]));
        $this->assertEquals(130000, $this->row($pl['compare']['data']['rows'], 'line:IS.REV')['amounts']['total'], 'March sales are the comparison');
        $this->assertEquals(65000, $this->row($pl['data']['rows'], 'line:IS.REV')['amounts']['total']);

        $bs = $engine->run('balance-sheet', ['to' => '2026-06-30', 'compare' => 'previous_year'], $this->person());
        $this->assertSame('2025-06-30', $bs['compare']['to']);
        $this->assertNull($bs['compare']['from']);
        $this->assertSame('2025-06-30', $bs['compare']['data']['as_of']);
        $this->assertSame('2026-06-30', $bs['data']['as_of']);
        $month = $engine->run('balance-sheet', ['to' => '2026-06-30', 'compare' => 'previous_period'], $this->person());
        $this->assertSame('2026-05-31', $month['compare']['to'], 'the end of the month before');
    }

    public function test_the_engine_hands_the_screen_the_options_and_drops_filters_a_report_does_not_offer(): void
    {
        $engine = app(ReportEngine::class);
        $catalogue = collect($engine->catalogue($this->person()))->keyBy('key');
        $this->assertSame('columns', $catalogue['profit-loss']['options'][0]['key']);
        $this->assertSame([], $catalogue['balance-sheet']['options']);
        $this->assertSame([], $catalogue['balance-sheet']['filters']);
        $r = $engine->run('balance-sheet', ['to' => '2026-12-31', 'cost_centre_id' => 10, 'location_id' => 1], $this->person());
        $this->assertFalse($r['banners']['filtered'], 'a filter the report does not offer is not applied, so the banner does not claim it');
        $this->assertNull($r['scope']['cost_centre_id']);
        $this->assertSame('asof', $r['report']['kind']);
    }

    public function test_the_export_tables_have_every_row_of_the_screen(): void
    {
        $engine = app(ReportEngine::class);
        [$pl] = $engine->exportTable('profit-loss', ['from' => '2026-01-01', 'to' => '2026-12-31', 'columns' => 'months'], $this->person());
        $data = $engine->run('profit-loss', ['from' => '2026-01-01', 'to' => '2026-12-31', 'columns' => 'months'], $this->person())['data'];
        $this->assertCount(count($data['rows']), $pl['rows']);
        $this->assertSame(array_merge(['name'], $data['columns']), array_keys($pl['columns']));
        $this->assertSame('Particulars', $pl['columns']['name']);
        [$bs] = $engine->exportTable('balance-sheet', ['to' => '2026-12-31'], $this->person());
        $this->assertSame(['name', 'total'], array_keys($bs['columns']));
        $this->assertStringContainsString('/', $bs['totals']['total']);
        $this->assertStringContainsString('As of 2026-12-31', $bs['subtitle']);
    }

    public function test_before_script_227_the_new_reports_say_what_to_run(): void
    {
        DB::statement('DROP TABLE statements');
        $d = $this->newPl('2026-01-01', '2026-12-31');
        $this->assertFalse($d['ready']);
        $this->assertStringContainsString('227_statements.sql', $d['message']);
        $b = (new BalanceSheetReport())->run(Scope::dates(null, '2026-12-31'), []);
        $this->assertFalse($b['ready']);
    }

    // ── the trial balance by group ─────────────────────────────────────

    public function test_the_trial_balance_adds_up_by_group_and_agrees_with_its_ledgers(): void
    {
        $d = (new TrialBalanceReport())->run($this->scope('2026-01-01', '2026-12-31'), []);
        $groups = collect($d['groups'])->keyBy('group_id');
        $ledgers = collect($d['rows'])->filter(fn ($r) => ! ($r['placeholder'] ?? false));
        $roots = $groups->filter(fn ($g) => $g['parent_id'] === null);
        $this->assertEquals(round($ledgers->sum('closing'), 2), round($roots->sum('closing'), 2), 'the top-level groups add up to every ledger');
        $this->assertEquals(round($ledgers->sum('debit'), 2), round($roots->sum('debit'), 2));
        foreach ($groups as $g) {
            $own = $ledgers->where('group_id', $g['group_id'])->sum('closing');
            $below = $groups->where('parent_id', $g['group_id'])->sum('closing');
            $this->assertEquals(round($own + $below, 2), $g['closing'], "{$g['group']}: its own ledgers plus the groups under it");
        }
        $this->assertSame(1, $groups[4]['depth'] - $groups[3]['depth'], 'Bank Accounts sits under Current Assets');
        $this->assertSame(3, $groups[4]['parent_id']);
        $order = $d['groups'];
        $this->assertTrue(array_search(3, array_column($order, 'group_id')) < array_search(4, array_column($order, 'group_id')), 'a group comes before the groups under it');
    }
}
