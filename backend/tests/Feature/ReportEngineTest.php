<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\User;
use App\Services\Books\Engine\Identifiers;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\TrialBalanceReport;
use App\Services\Books\Engine\Scope;
use App\Services\Books\LedgerService;
use App\Services\Books\StatementLines;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * The report engine (docs/BOOKS_REPORTS_PLAN.md, step 4): the balance service, the engine around a report definition, the transaction identifiers and the
 * statement line on ledgers and groups. The heart of it is parity: the trial balance on the engine must give the figures the old report gives, to the cent,
 * on the same books, with and without filters and branch limits. See Concerns\CreatesBooksLedgerWorld for the books.
 */
class ReportEngineTest extends TestCase
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

    private function person(array $permissions = ['books.view']): User
    {
        $u = new User();
        $u->id = 100 + crc32(implode(',', $permissions)) % 100000;   // a different person for each set of permissions, so two in one test do not share them
        $this->grant($u, $permissions);

        return $u;
    }

    private function engine(): ReportEngine
    {
        return app(ReportEngine::class);
    }

    private function oldTrial(?string $from, ?string $to, ?int $cc = null, ?int $loc = null): array
    {
        return $this->golden('trial_balance', json_encode([$from, $to, $cc, $loc, $this->limitedTo]));
    }

    private function newTrial(?string $from, ?string $to, ?int $cc = null, ?int $loc = null): array
    {
        return (new TrialBalanceReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'cost_centre_id' => $cc, 'location_id' => $loc]), []);
    }

    /** Every figure the old report gives is in the new one, the same. (The new one adds fields: group_id, statement_id.) */
    private function assertSameTrial(array $old, array $new, string $why): void
    {
        $this->assertCount(count($old['rows']), $new['rows'], "{$why}: number of rows");
        foreach ($old['rows'] as $i => $row) {
            foreach ($row as $k => $v) {
                $this->assertEquals($v, $new['rows'][$i][$k], "{$why}: row {$i} ({$row['ledger']}) {$k}");
            }
        }
        foreach (['total_debit', 'total_credit', 'balanced', 'opening_difference', 'opening_balances', 'filtered'] as $k) {
            $this->assertEquals($old[$k], $new[$k], "{$why}: {$k}");
        }
    }

    // ── parity with the old trial balance ───────────────────────────────

    public function test_the_trial_balance_matches_the_old_report_for_the_financial_year(): void
    {
        $old = $this->oldTrial('2026-01-01', '2026-12-31');
        $this->assertNotEmpty($old['rows']);
        $this->assertNotSame(0.0, (float) $old['opening_difference'], 'the books carry an opening difference, so the placeholder line is tested too');
        $this->assertSameTrial($old, $this->newTrial('2026-01-01', '2026-12-31'), 'the year');
    }

    public function test_the_trial_balance_matches_for_other_periods_and_open_ended_ones(): void
    {
        foreach ([[null, null], ['2026-03-01', null], [null, '2026-03-31'], ['2026-04-01', '2026-04-30'], ['2025-12-01', '2025-12-31'], ['2027-01-01', '2027-12-31']] as [$from, $to]) {
            $this->assertSameTrial($this->oldTrial($from, $to), $this->newTrial($from, $to), ($from ?? 'start') . ' to ' . ($to ?? 'end'));
        }
    }

    public function test_the_trial_balance_matches_with_a_cost_centre_or_a_branch_chosen(): void
    {
        foreach ([[10, null], [11, null], [null, 1], [null, 2], [10, 1]] as [$cc, $loc]) {
            $old = $this->oldTrial('2026-01-01', '2026-12-31', $cc, $loc);
            $this->assertTrue($old['filtered']);
            $this->assertSameTrial($old, $this->newTrial('2026-01-01', '2026-12-31', $cc, $loc), "cost centre {$cc}, branch {$loc}");
        }
    }

    public function test_the_trial_balance_matches_for_a_person_limited_to_some_branches(): void
    {
        $this->limitedTo = [1];
        $this->assertSameTrial($this->oldTrial('2026-01-01', '2026-12-31'), $this->newTrial('2026-01-01', '2026-12-31'), 'limited to branch 1');
        $this->limitedTo = [2];
        $this->assertSameTrial($this->oldTrial(null, null), $this->newTrial(null, null), 'limited to branch 2');
    }

    // ── the balance service ────────────────────────────────────────────

    public function test_a_ledgers_balance_agrees_with_the_old_one_when_nobody_is_limited(): void
    {
        $old = app(LedgerService::class);
        $new = app(LedgerBalances::class);
        foreach ([null, '2025-12-31', '2026-03-31', '2026-04-30', '2026-12-31'] as $asOf) {
            $all = $new->balances(Scope::dates(null, null), $asOf);
            foreach (range(1, 8) as $id) {
                $this->assertEquals($old->balance($id, $asOf), $new->balance($id, $asOf), "ledger {$id} as of " . ($asOf ?? 'today'));
                $this->assertEquals($old->balance($id, $asOf), $all[$id], "ledger {$id} in balances() as of " . ($asOf ?? 'today'));
            }
        }
    }

    public function test_a_balance_follows_the_branch_limit_where_the_old_one_did_not(): void
    {
        $this->limitedTo = [2];   // branch 2 only: cash moved by V2 (-40,000) and V11 (+800) on top of the 50,000 opening
        $this->assertEquals(10800.00, app(LedgerBalances::class)->balance(1, '2026-12-31'));
        $this->assertNotEquals(app(LedgerBalances::class)->balance(1, '2026-12-31'), app(LedgerService::class)->balance(1, '2026-12-31'), 'the old function ignored the limit, which is why figures taken from it did not agree with the reports');
    }

    public function test_drafts_are_never_counted_and_a_voucher_made_under_another_base_is_restated(): void
    {
        $m = app(LedgerBalances::class)->movement(Scope::dates('2026-04-01', '2026-04-30'), '2026-04-01', '2026-04-30');
        $this->assertEquals(500 * 130, $m[1]['dr'], 'V4: 500 posted when the base was dollars is 65,000 at today\'s rate');
        $may = app(LedgerBalances::class)->movement(Scope::dates('2026-05-01', '2026-05-31'), '2026-05-01', '2026-05-31');
        $this->assertArrayNotHasKey(6, $may, 'the draft in May moved nothing');
        $march = app(LedgerBalances::class)->movement(Scope::dates('2026-03-01', '2026-03-31'), '2026-03-01', '2026-03-31');
        $this->assertEquals(130000, $march[3]['dr'], 'V3: dollars at about today\'s rate are taken as posted');
    }

    public function test_a_cost_centre_narrows_the_entry_lines_not_the_voucher_header(): void
    {
        // V8 is one voucher whose header is cost centre 10, with rent split 3,000 to cost centre 10 and 4,000 to cost centre 11
        $scope = Scope::fromInput(['from' => '2026-07-01', 'to' => '2026-07-31', 'cost_centre_id' => 11]);
        $this->assertEquals(4000, app(LedgerBalances::class)->movement($scope, '2026-07-01', '2026-07-31')[6]['dr']);
        $scope = Scope::fromInput(['from' => '2026-07-01', 'to' => '2026-07-31', 'cost_centre_id' => 10]);   // 10 and what is under it
        $this->assertEquals(7000, app(LedgerBalances::class)->movement($scope, '2026-07-01', '2026-07-31')[6]['dr'], 'the whole voucher, counted once');
    }

    public function test_a_filtered_view_starts_from_nothing_and_an_unfiltered_one_from_the_opening_balances(): void
    {
        $b = app(LedgerBalances::class);
        $cash = collect($b->ledgers())->firstWhere('id', 1);
        $this->assertEquals(50000.0, $b->opening($cash, Scope::dates(null, null)));
        $this->assertEquals(0.0, $b->opening($cash, Scope::fromInput(['location_id' => 1])));
        $capital = collect($b->ledgers())->firstWhere('id', 7);
        $this->assertEquals(-30000.0, $b->opening($capital, Scope::dates(null, null)), 'a credit opening is negative');
    }

    public function test_the_ledgers_carry_their_statement_line_or_their_groups(): void
    {
        DB::table('ledgers')->where('id', 6)->update(['statement_id' => 12]);   // Rent set to Finance costs
        DB::table('ledgers')->where('id', 8)->update(['statement_id' => null]);   // Supplier: no line of its own, and its group (Current Liabilities) has none
        DB::table('ledgers')->where('id', 3)->update(['statement_id' => null]);   // Customer A: none of its own; its group's line (Trade receivables) applies
        $lines = collect(app(LedgerBalances::class)->ledgers())->pluck('statement_id', 'id')->map(fn ($v) => $v === null ? null : (int) $v);
        $this->assertSame(12, $lines[6]);
        $this->assertSame(5, $lines[3]);
        $this->assertNull($lines[8]);
        $this->assertSame(4, $lines[1]);
    }

    // ── the engine around a report ─────────────────────────────────────

    public function test_a_report_opens_on_the_financial_year_so_far(): void
    {
        $r = $this->engine()->run('trial-balance', [], $this->person());
        $this->assertSame('2026-01-01', $r['scope']['from']);
        $this->assertSame('2026-10-28', $r['scope']['to']);
        $this->assertSame('FY 2026', $r['scope']['default_period']['year']);
        $this->assertSame('trial-balance', $r['report']['key']);
        $this->assertSame(['decimals' => 2, 'units' => 'none', 'negative_format' => 'minus', 'show_zero_balances' => false, 'default_group_depth' => 2, 'report_header' => '', 'report_footer' => '', 'signatories' => []], $r['format'], 'before the Reports settings exist the defaults apply');
    }

    public function test_the_banners_come_from_the_engine(): void
    {
        $plain = $this->engine()->run('trial-balance', [], $this->person());
        $this->assertSame(['branch_limited' => false, 'filtered' => false, 'restated_vouchers' => 1], $plain['banners']);
        $this->limitedTo = [1];
        $cc = $this->engine()->run('trial-balance', ['cost_centre_id' => 10], $this->person());
        $this->assertSame(['branch_limited' => true, 'filtered' => true, 'restated_vouchers' => 1], $cc['banners']);
        $this->assertTrue($cc['data']['filtered']);
    }

    public function test_the_engine_result_is_the_trial_balance_of_the_dates_asked_for(): void
    {
        $r = $this->engine()->run('trial-balance', ['from' => '2026-04-01', 'to' => '2026-04-30'], $this->person());
        $this->assertSameTrial($this->oldTrial('2026-04-01', '2026-04-30'), $r['data'], 'through the engine');
    }

    public function test_a_report_needs_its_own_permission(): void
    {
        $this->expectException(HttpException::class);
        $this->engine()->run('trial-balance', [], $this->person(['stock.view']));
    }

    public function test_the_catalogue_lists_only_what_the_person_may_run(): void
    {
        $this->assertSame(['trial-balance', 'profit-loss', 'balance-sheet', 'changes-in-equity', 'adjusted-trial-balance', 'day-book', 'ledger-statement', 'receivables-ageing', 'payables-ageing', 'tax-return', 'withholding', 'ratio-analysis', 'trade', 'money-flow', 'cash-flow', 'control-accounts', 'books-health', 'profit-loss-by-cost-centre', 'budget-against-actual'], array_column($this->engine()->catalogue($this->person(['books.view'])), 'key'));
        $this->assertSame(['stock-journal', 'stock-summary', 'stock-location-summary', 'stock-query', 'stock-item-monthly', 'stock-item-movements'], array_column($this->engine()->catalogue($this->person(['stock.view'])), 'key'));
    }

    public function test_an_unknown_report_and_a_backwards_period_are_refused(): void
    {
        foreach ([fn () => $this->engine()->run('nonsense', [], $this->person()), fn () => $this->engine()->run('trial-balance', ['from' => '2026-05-01', 'to' => '2026-04-01'], $this->person())] as $call) {
            try {
                $call();
                $this->fail('accepted');
            } catch (HttpException $e) {
                $this->assertContains($e->getStatusCode(), [404, 422]);
            }
        }
    }

    public function test_a_report_that_supports_it_is_run_again_over_the_comparison_period(): void
    {
        $engine = $this->engine();
        $engine->register(new class extends ReportDefinition {
            public function key(): string { return 'echo'; }

            public function title(): string { return 'Echo'; }

            public function supportsComparison(): bool { return true; }

            public function run(\App\Services\Books\Engine\Scope $scope, array $options): array { return ['from' => $scope->from, 'to' => $scope->to]; }

            public function table(array $data, \App\Services\Books\Engine\Scope $scope): array { return ['title' => 'Echo', 'columns' => [], 'rows' => []]; }
        });
        $r = $engine->run('echo', ['from' => '2026-03-01', 'to' => '2026-03-31', 'compare' => 'previous_period'], $this->person());
        $this->assertSame(['from' => '2026-03-01', 'to' => '2026-03-31'], $r['data']);
        $this->assertSame(['mode' => 'previous_period', 'from' => '2026-02-01', 'to' => '2026-02-28', 'data' => ['from' => '2026-02-01', 'to' => '2026-02-28']], $r['compare']);
        $y = $engine->run('echo', ['from' => '2026-03-01', 'to' => '2026-03-31', 'compare' => 'previous_year'], $this->person());
        $this->assertSame('2025-03-31', $y['compare']['to']);
        $this->assertNull($engine->run('echo', ['from' => '2026-03-01', 'to' => '2026-03-31'], $this->person())['compare']);
    }

    public function test_a_report_that_cannot_be_compared_says_so(): void
    {
        $this->expectException(HttpException::class);
        $this->engine()->run('trial-balance', ['compare' => 'previous_year'], $this->person());
    }

    public function test_an_as_of_report_has_one_date_and_no_start(): void
    {
        $engine = $this->engine();
        $engine->register(new class extends ReportDefinition {
            public function key(): string { return 'as-of'; }

            public function title(): string { return 'As of'; }

            public function kind(): string { return 'asof'; }

            public function run(\App\Services\Books\Engine\Scope $scope, array $options): array { return ['from' => $scope->from, 'to' => $scope->to]; }

            public function table(array $data, \App\Services\Books\Engine\Scope $scope): array { return ['title' => 'As of', 'subtitle' => $this->period($scope), 'columns' => [], 'rows' => []]; }
        });
        $this->assertSame(['from' => null, 'to' => '2026-10-28'], $engine->run('as-of', [], $this->person())['data'], 'today when no date is given');
        $this->assertSame(['from' => null, 'to' => '2026-03-31'], $engine->run('as-of', ['from' => '2026-01-01', 'to' => '2026-03-31'], $this->person())['data'], 'a start date means nothing to an as-of report');
        [$table] = $engine->exportTable('as-of', ['to' => '2026-03-31'], $this->person());
        $this->assertSame('As of 2026-03-31', $table['subtitle']);
    }

    public function test_the_export_table_has_the_rows_and_totals_of_the_screen(): void
    {
        [$table, $name] = $this->engine()->exportTable('trial-balance', ['from' => '2026-01-01', 'to' => '2026-12-31'], $this->person());
        $data = $this->engine()->run('trial-balance', ['from' => '2026-01-01', 'to' => '2026-12-31'], $this->person())['data'];
        $this->assertSame('trial-balance', $name);
        $this->assertSame(['group', 'ledger', 'opening', 'debit', 'credit', 'closing'], array_keys($table['columns']));
        $this->assertCount(count($data['rows']), $table['rows']);
        $this->assertSame('2026-01-01 to 2026-12-31', $table['subtitle']);
        $this->assertSame('Dr ' . number_format($data['total_debit'], 2), $table['totals']['debit']);
        $this->assertSame(['group', 'ledger', 'opening', 'debit', 'credit', 'closing'], array_keys($table['rows'][0]));
    }

    // ── transaction identifiers ────────────────────────────────────────

    public function test_identifiers_gather_every_number_that_names_a_transaction(): void
    {
        DB::table('vouchers')->where('voucher_number', 'V1')->update(['reference_no' => 'PO-77', 'supplier_invoice_no' => 'INV-9']);
        DB::table('voucher_instruments')->insert(['voucher_id' => 1, 'ledger_id' => 1, 'type' => 'cheque', 'number' => '004512', 'instrument_date' => '2026-01-09', 'bank_name' => 'KCB', 'reference' => null, 'status' => 'cleared', 'deposited_on' => '2026-01-11', 'cleared_on' => '2026-01-14']);
        DB::table('voucher_instruments')->insert(['voucher_id' => 1, 'ledger_id' => 1, 'type' => 'transfer', 'reference' => 'FT26010XYZ']);
        DB::table('payment_methods')->insert(['id' => 1, 'name' => 'M-Pesa Till', 'kind' => 'mobile_money', 'ledger_id' => 2]);
        DB::table('voucher_tenders')->insert(['voucher_id' => 1, 'payment_method_id' => 1, 'amount' => 600, 'reference' => 'QGH1A2B3C4']);
        DB::table('payment_attempts')->insert(['voucher_id' => 1, 'status' => 'confirmed', 'receipt_number' => 'QGH1A2B3C4']);
        DB::table('payment_attempts')->insert(['voucher_id' => 1, 'status' => 'failed', 'receipt_number' => 'NOTCONFIRMED']);

        $ids = (new Identifiers())->forVouchers([1, 2, 999]);
        $this->assertSame([1, 2], array_keys($ids), 'a voucher that does not exist is left out');
        $v = $ids[1];
        $this->assertSame('V1', $v['voucher_number']);
        $this->assertSame('PO-77', $v['reference_no']);
        $this->assertSame(['type' => 'cheque', 'number' => '004512', 'instrument_date' => '2026-01-09', 'bank_name' => 'KCB', 'reference' => null, 'status' => 'cleared', 'deposited_on' => '2026-01-11', 'cleared_on' => '2026-01-14', 'ledger_id' => 1], $v['instruments'][0]);
        $this->assertSame([['method' => 'M-Pesa Till', 'kind' => 'mobile_money', 'reference' => 'QGH1A2B3C4']], $v['tenders']);
        $this->assertSame(['QGH1A2B3C4'], $v['receipts'], 'only a confirmed receipt');
        $this->assertEqualsCanonicalizing(['V1', 'PO-77', 'INV-9', '004512', 'FT26010XYZ', 'QGH1A2B3C4'], $v['codes']);
        $this->assertSame(['V2'], $ids[2]['codes']);
        $this->assertSame([], (new Identifiers())->forVouchers([]));
    }

    // ── the statement line on ledgers and groups ───────────────────────

    public function test_a_new_ledger_reports_under_its_groups_line_and_a_new_subgroup_under_its_parents(): void
    {
        $this->assertSame(4, (int) Ledger::create(['group_id' => 4, 'name' => 'Equity Bank'])->statement_id, 'Bank Accounts reports under Cash and bank');
        $this->assertNull(Ledger::create(['group_id' => 2, 'name' => 'Accrued costs'])->statement_id, 'its group has no line');
        $g = LedgerGroup::create(['parent_id' => 3, 'name' => 'Petty accounts', 'nature' => 'asset']);
        $this->assertSame(6, (int) $g->statement_id, 'the group above reports under Other current assets');
        $this->assertSame(11, (int) Ledger::create(['group_id' => 8, 'name' => 'Utilities', 'statement_id' => 11])->statement_id);
        $this->assertSame(12, (int) Ledger::create(['group_id' => 8, 'name' => 'Bank fees', 'statement_id' => 12])->statement_id, 'a line given on creation is kept');
    }

    public function test_choosing_another_line_needs_the_permission_and_a_line_that_fits(): void
    {
        $svc = app(StatementLines::class);
        $can = $this->person(['books.statements']);
        $cannot = $this->person([]);
        $this->assertSame(4, $svc->forNewLedger(null, 4, $cannot), 'following the group needs no permission');
        $this->assertSame(4, $svc->forNewLedger(4, 4, $cannot), 'nor does choosing the same line');
        $this->assertSame(6, $svc->forNewLedger(6, 4, $can), 'another asset line, with the permission');

        $fails = function (callable $f, string $needle) {
            try {
                $f();
                $this->fail("accepted: {$needle}");
            } catch (ValidationException $e) {
                $this->assertStringContainsString($needle, $e->errors()['statement_id'][0]);
            }
        };
        $fails(fn () => $svc->forNewLedger(6, 4, $cannot), 'permission');
        $fails(fn () => $svc->forNewLedger(9, 4, $can), 'cannot hold a asset');   // Revenue is for income accounts
        $fails(fn () => $svc->forNewLedger(3, 4, $can), 'is a section');           // Current assets is a heading
        DB::table('statements')->where('id', 6)->update(['is_active' => 0]);
        $fails(fn () => $svc->forNewLedger(6, 4, $can), 'hidden');
        $fails(fn () => $svc->forNewLedger(404, 4, $can), 'does not exist');
    }

    public function test_putting_an_own_line_back_to_the_groups_needs_the_permission_too(): void
    {
        $svc = app(StatementLines::class);
        $ledger = Ledger::find(1);   // on Cash and bank, like its group
        $ledger->statement_id = 6;   // given a line of its own
        $ledger->save();
        $cannot = $this->person([]);
        $this->assertSame(6, $svc->forExistingLedger($ledger->fresh(), false, null, null, $cannot), 'saving other things leaves its own line alone');
        try {
            $svc->forExistingLedger($ledger->fresh(), true, null, null, $cannot);   // the form sent "follow the group"
            $this->fail('a person without the permission put it back');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(4, $svc->forExistingLedger($ledger->fresh(), true, null, null, $this->person(['books.statements'])));
    }

    public function test_a_ledger_without_a_line_gets_its_groups_when_saved_without_anyone_choosing(): void
    {
        DB::table('ledgers')->where('id', 1)->update(['statement_id' => null]);   // a ledger made by a raw script
        $this->assertSame(4, app(StatementLines::class)->forExistingLedger(Ledger::find(1), true, null, null, $this->person([])), 'filling in a missing line needs no permission');
    }

    public function test_a_ledger_moved_to_another_group_follows_that_groups_line_unless_it_has_its_own(): void
    {
        $svc = app(StatementLines::class);
        $following = Ledger::find(1);   // Cash: on its group's line (Cash and bank)
        $this->assertSame(5, $svc->forExistingLedger($following, false, null, 5, $this->person([])), 'moved to Sundry Debtors: now Trade receivables');
        DB::table('ledgers')->where('id', 2)->update(['statement_id' => 6]);   // M-Pesa: its own line
        $own = Ledger::find(2);
        $this->assertSame(6, $svc->forExistingLedger($own, false, null, 5, $this->person([])), 'an own line that still fits is kept');
        DB::table('ledgers')->where('id', 3)->update(['statement_id' => 9]);   // wrongly on an income line, moved into an asset group
        $this->assertSame(4, $svc->forExistingLedger(Ledger::find(3), false, null, 4, $this->person([])), 'a line that does not fit the new group\'s nature gives way to the group\'s');
    }

    public function test_changing_a_groups_line_can_move_the_ledgers_that_were_on_the_old_one(): void
    {
        $svc = app(StatementLines::class);
        $group = LedgerGroup::find(3);   // Current Assets (line 6) with Bank Accounts (4) and Sundry Debtors (5) under it
        $child = LedgerGroup::create(['parent_id' => 3, 'name' => 'Imprest', 'nature' => 'asset']);   // takes 6
        $a = Ledger::create(['group_id' => 3, 'name' => 'Deposit A']);   // on 6, follows
        $b = Ledger::create(['group_id' => 3, 'name' => 'Deposit B']);
        DB::table('ledgers')->where('id', $b->id)->update(['statement_id' => 5]);   // on its own line: must stay
        $r = $svc->changeGroup($group, 4, true, $this->person(['books.statements']));
        $this->assertSame(['statement_id' => 4, 'moved_groups' => 1, 'moved_ledgers' => 1], $r);
        $this->assertSame(4, (int) $group->fresh()->statement_id);
        $this->assertSame(4, (int) $child->fresh()->statement_id);
        $this->assertSame(4, (int) $a->fresh()->statement_id);
        $this->assertSame(5, (int) $b->fresh()->statement_id, 'a ledger with its own line is left');
        $this->assertSame(5, (int) LedgerGroup::find(5)->statement_id, 'a subgroup with its own line is left');

        $again = $svc->changeGroup(LedgerGroup::find(5), 5, true, $this->person([]));   // no change asked for: no permission needed
        $this->assertSame(['statement_id' => 5, 'moved_groups' => 0, 'moved_ledgers' => 0], $again);
        try {
            $svc->changeGroup(LedgerGroup::find(5), 6, false, $this->person([]));
            $this->fail('a person without the permission changed a group');
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
        $svc->changeGroup($group->fresh(), 6, false, $this->person(['books.statements']));
        $this->assertSame(4, (int) $a->fresh()->statement_id, 'not asked to move its ledgers: they stay');
    }
}
