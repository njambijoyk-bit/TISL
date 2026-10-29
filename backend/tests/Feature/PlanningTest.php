<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\BudgetService;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Scope;
use App\Services\Books\ForecastService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Budgets and the 90-day cash forecast (database script 237). */
class PlanningTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private const TABLES = ['budget_lines', 'forecast_items', 'voucher_bill_refs', 'report_settings', 'report_settings_log'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('237_planning.sql');
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
        DB::table('voucher_types')->insert(['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']);
        $now = now();
        $s2 = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'party_ledger_id' => 3, 'voucher_number' => 'S2', 'date' => '2026-10-20', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 30000, 'base_total' => 30000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        $p = DB::table('vouchers')->insertGetId(['voucher_type_id' => 4, 'party_ledger_id' => 8, 'voucher_number' => 'P9', 'date' => '2026-10-01', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 20000, 'base_total' => 20000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('voucher_bill_refs')->insert([
            ['voucher_id' => 1, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 100000, 'due_date' => '2026-02-10', 'created_at' => $now],
            ['voucher_id' => $s2, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 30000, 'due_date' => '2026-11-07', 'created_at' => $now],
            ['voucher_id' => $p, 'ledger_id' => 8, 'ref_type' => 'new', 'amount' => 20000, 'due_date' => '2026-10-20', 'created_at' => $now],
        ]);
    }

    protected function tearDown(): void
    {
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function setting(string $key, $value): void
    {
        DB::table('report_settings')->updateOrInsert(['setting_key' => $key], ['value' => json_encode($value), 'created_at' => now(), 'updated_at' => now()]);
    }

    private function as(array $permissions): void
    {
        $u = new User();
        $u->id = 5;
        $this->grant($u, $permissions);
        Sanctum::actingAs($u, ['*']);
    }

    // ── budgets ────────────────────────────────────────────────────────

    public function test_a_budget_is_set_by_month_and_set_against_what_was_spent(): void
    {
        $svc = app(BudgetService::class);
        $svc->save([['type' => 'group', 'id' => 8, 'months' => ['2026-06' => 20000, '2026-07' => 5000]]], null);
        $r = $svc->against(Scope::dates('2026-01-01', '2026-10-28'), '2026-01-01', '2026-10-28');
        $row = $r['rows'][0];
        $this->assertSame('Indirect Expenses', $row['name']);
        $this->assertEquals(25000, $row['budget']);
        $this->assertEquals(19300, $row['actual'], 'rent 12,000 and 7,000 and bank charges 300; the draft and last year are not counted');
        $this->assertEquals(5700, $row['variance']);
        $this->assertEquals(77.2, $row['used_pct']);
        $jul = collect($row['months'])->firstWhere('month', '2026-07');
        $this->assertEquals([5000, 7000], [$jul['budget'], $jul['actual']], 'July was over');
        $this->assertCount(10, $row['months']);
        $this->assertEquals(0, $r['totals']['over_count'], 'over for the year only when the whole is over');
    }

    public function test_only_expenses_can_be_budgeted_and_a_zero_removes_a_month(): void
    {
        $svc = app(BudgetService::class);
        try {
            $svc->save([['type' => 'group', 'id' => 6, 'months' => ['2026-06' => 100]]], null);   // Sales Accounts: income
            $this->fail('an income group was accepted');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('not an expense', $e->errors()['rows.0'][0]);
        }
        $this->assertSame(0, DB::table('budget_lines')->count(), 'nothing is written unless every row is valid');
        $svc->save([['type' => 'ledger', 'id' => 6, 'months' => ['2026-06' => 500, '2026-07' => 600]]], null);
        $svc->save([['type' => 'ledger', 'id' => 6, 'months' => ['2026-07' => 0, '2026-06' => 700]]], null);
        $this->assertSame([['2026-06', 700.0]], DB::table('budget_lines')->get(['period', 'amount'])->map(fn ($r) => [$r->period, (float) $r->amount])->all());
        $this->assertSame(1, $svc->remove('ledger', 6, '2026-01-01', '2026-12-31'));
        $this->expectException(ValidationException::class);
        $svc->save([['type' => 'ledger', 'id' => 6, 'months' => ['June' => 5]]], null);
    }

    public function test_the_planning_screen_is_seen_with_books_view_and_changed_with_books_planning(): void
    {
        $this->as(['books.view']);
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonPath('budgets_ready', true)->assertJsonCount(12, 'months');
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'id' => 8, 'months' => ['2026-06' => 1]]]])->assertForbidden();
        $this->as(['books.view', 'books.planning']);
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'id' => 8, 'months' => ['2026-06' => 1000]]]])->assertOk();
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertJsonPath('lines.0.months.2026-06', 1000);
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'id' => 6, 'months' => ['2026-06' => 1]]]])->assertStatus(422);
        $this->deleteJson('/api/admin/books/planning/budgets/group/8?from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonPath('removed', 1);
    }

    // ── the forecast ───────────────────────────────────────────────────

    public function test_an_item_happens_as_often_as_it_says_and_a_month_end_stays_the_last_day(): void
    {
        $monthly = ['start_date' => '2026-11-05', 'end_date' => null, 'frequency' => 'monthly'];
        $this->assertSame(['2026-11-05', '2026-12-05', '2027-01-05'], ForecastService::occurrences($monthly, '2026-10-28', '2027-01-26'));
        $this->assertSame(['2027-02-28'], ForecastService::occurrences(['start_date' => '2026-12-31', 'end_date' => null, 'frequency' => 'monthly'], '2027-02-01', '2027-02-28'));
        $this->assertSame(['2026-11-05'], ForecastService::occurrences(['start_date' => '2026-11-05', 'end_date' => '2026-11-30', 'frequency' => 'monthly'], '2026-10-28', '2027-01-26'), 'it stops at its end date');
        $this->assertSame(['2026-11-05'], ForecastService::occurrences(['start_date' => '2026-11-05', 'end_date' => null, 'frequency' => 'once'], '2026-10-28', '2027-01-26'));
        $this->assertSame([], ForecastService::occurrences(['start_date' => '2026-10-01', 'end_date' => null, 'frequency' => 'once'], '2026-10-28', '2027-01-26'), 'a date already gone is not in the future');
        $this->assertCount(13, ForecastService::occurrences(['start_date' => '2026-11-01', 'end_date' => null, 'frequency' => 'weekly'], '2026-10-28', '2027-01-26'));
        $this->assertSame(['2026-11-15', '2027-02-15'], ForecastService::occurrences(['start_date' => '2026-11-15', 'end_date' => null, 'frequency' => 'quarterly'], '2026-10-28', '2027-03-01'));
    }

    public function test_the_forecast_keeps_confirmed_money_apart_from_estimates_and_shows_its_assumptions(): void
    {
        $this->setting('forecast_collection_delay_days', 3);
        $this->setting('forecast_collect_percent', 50);
        $this->setting('forecast_include_tax', false);
        $svc = app(ForecastService::class);
        $svc->saveItem(['label' => 'Payroll', 'kind' => 'payroll', 'direction' => 'out', 'amount' => 40000, 'frequency' => 'monthly', 'start_date' => '2026-11-25', 'certainty' => 'confirmed'], null);
        $svc->saveItem(['label' => 'Rent', 'kind' => 'rent', 'direction' => 'out', 'amount' => 10000, 'frequency' => 'monthly', 'start_date' => '2026-11-01', 'certainty' => 'estimate'], null);
        $svc->saveItem(['label' => 'Switched off', 'kind' => 'other', 'direction' => 'out', 'amount' => 999999, 'frequency' => 'once', 'start_date' => '2026-11-02', 'certainty' => 'confirmed', 'is_active' => false], null);

        $f = $svc->build(Scope::dates(null, null), '2026-10-28', 90);
        $money = array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, '2026-10-28'), app(MoneyFlowReport::class)->moneyLedgerIds()));
        $this->assertEquals(round($money, 2), $f['opening']);
        $flows = collect($f['flows']);
        $bill = $flows->firstWhere('label', 'Customer A: V1');
        $this->assertEquals([50000, '2026-10-29', 'estimate'], [$bill['amount'], $bill['date'], $bill['certainty']], 'an overdue bill, half expected, placed the next day');
        $this->assertEquals([15000, '2026-11-10'], [$flows->firstWhere('label', 'Customer A: S2')['amount'], $flows->firstWhere('label', 'Customer A: S2')['date']], 'due 7 November plus three days, half of 30,000');
        $supplier = $flows->firstWhere('label', 'Supplier: P9');
        $this->assertEquals([20000, '2026-10-29', 'confirmed'], [$supplier['amount'], $supplier['date'], $supplier['certainty']]);
        $this->assertCount(3, $flows->where('label', 'Payroll'));
        $this->assertNull($flows->firstWhere('label', 'Switched off'));
        $s = $f['summary'];
        $this->assertEquals([65000, 0, 140000], [$s['in_estimate'], $s['in_confirmed'], $s['out_confirmed']]);
        $this->assertEquals(round($money - 140000, 2), $s['closing_confirmed_only'], 'with only the confirmed money the cash ends here');
        $this->assertEquals(round($money + 65000 - 140000 - 30000, 2), $s['closing'], 'and with the estimates: customers in, three months of rent out');
        $this->assertCount(13, $f['weeks']);
        $this->assertCount(90, $f['days']);
        $labels = array_column($f['assumptions'], 'key');
        $this->assertSame(['opening', 'customers', 'suppliers', 'items', 'tax', 'late'], $labels);
        $this->assertStringContainsString('3 day(s) after the due date, 50', collect($f['assumptions'])->firstWhere('key', 'customers')['detail']);
        $this->assertStringContainsString('2 active', collect($f['assumptions'])->firstWhere('key', 'items')['value']);
    }

    public function test_the_forecast_finds_the_day_cash_runs_out(): void
    {
        $svc = app(ForecastService::class);
        $this->setting('forecast_include_tax', false);
        $money = array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, '2026-10-28'), app(MoneyFlowReport::class)->moneyLedgerIds()));
        $svc->saveItem(['label' => 'Loan', 'kind' => 'loan', 'direction' => 'out', 'amount' => $money + 200000, 'frequency' => 'once', 'start_date' => '2026-11-20', 'certainty' => 'confirmed'], null);
        $f = $svc->build(Scope::dates(null, null), '2026-10-28', 90);
        $this->assertSame('2026-11-20', $f['summary']['shortfall_from']);
        $this->assertLessThan(0, $f['summary']['lowest']['balance']);
        $this->assertSame('2026-11-20', $f['summary']['lowest_confirmed_only']['date']);
    }

    public function test_an_item_is_checked_before_it_is_kept(): void
    {
        $svc = app(ForecastService::class);
        try {
            $svc->saveItem(['label' => '', 'kind' => 'nope', 'direction' => 'sideways', 'amount' => 0, 'frequency' => 'daily', 'start_date' => '5 Nov', 'certainty' => 'maybe'], null);
            $this->fail('a bad item was kept');
        } catch (ValidationException $e) {
            $this->assertEqualsCanonicalizing(['label', 'kind', 'direction', 'amount', 'frequency', 'certainty', 'start_date'], array_keys($e->errors()));
        }
        $this->assertSame(0, DB::table('forecast_items')->count());
        $this->expectException(ValidationException::class);
        $svc->saveItem(['label' => 'Rent', 'kind' => 'rent', 'direction' => 'out', 'amount' => 100, 'frequency' => 'monthly', 'start_date' => '2026-11-01', 'end_date' => '2026-10-01', 'certainty' => 'confirmed'], null);
    }

    public function test_the_two_charts_come_out_of_the_same_figures(): void
    {
        $this->setting('forecast_include_tax', false);
        $svc = app(\App\Services\Books\VisualsService::class);
        $b = $svc->chart('budget', Scope::dates('2026-01-01', '2026-10-28'))['data'];
        $this->assertFalse($b['ready'], 'no budget yet says so');
        $this->assertStringContainsString('Planning', $b['message']);
        app(BudgetService::class)->save([['type' => 'group', 'id' => 8, 'months' => ['2026-06' => 20000]]], null);
        $this->assertTrue($svc->chart('budget', Scope::dates('2026-01-01', '2026-10-28'))['data']['ready']);
        $f = $svc->chart('cash-forecast', Scope::dates('2026-01-01', '2026-10-28'))['data'];
        $this->assertTrue($f['ready'], $f['message'] ?? '');
        $this->assertSame('2026-10-28', $f['start']);
    }
}
