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

    private const TABLES = ['locations', 'budget_lines', 'budget_rows', 'budget_initiatives', 'budgets', 'budget_versions', 'budget_approvals', 'users', 'forecast_items', 'voucher_bill_refs', 'report_settings', 'report_settings_log'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('237_planning.sql', '239_budgeting.sql', '240_budget_versions.sql');
        // script 239 replaces budget_lines' old (period, target) key with (row_id, period); SQLite here cannot drop an inline key, so the table is rebuilt as the script leaves it
        Schema::dropIfExists('budget_lines');
        Schema::create('budget_lines', function ($t) {
            $t->id(); $t->unsignedBigInteger('row_id')->nullable(); $t->string('period', 7); $t->string('target_type', 10); $t->unsignedBigInteger('target_id'); $t->decimal('amount', 18, 2)->default(0); $t->string('note', 160)->nullable();
            $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); $t->unique(['row_id', 'period']);
        });
        Schema::dropIfExists('budget_rows');
        Schema::create('budget_rows', function ($t) {
            $t->id(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('target_type', 10); $t->unsignedBigInteger('target_id'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('department_id')->nullable();
            $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('initiative_id')->nullable(); $t->boolean('is_recovery')->default(false); $t->string('method', 20)->default('manual'); $t->text('method_params')->nullable();
            $t->string('dim_key', 60)->default('0-0-0-0-0'); $t->string('note', 160)->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); $t->unique(['version_id', 'target_type', 'target_id', 'dim_key']);
        });
        Schema::dropIfExists('users');
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        Schema::dropIfExists('locations');
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->timestamps(); });
        DB::table('locations')->insert([['id' => 1, 'name' => 'Nairobi'], ['id' => 2, 'name' => 'Mombasa']]);
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
        $svc->save([['type' => 'group', 'target_id' => 8, 'months' => ['2026-06' => 20000, '2026-07' => 5000]]], null);
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

    public function test_a_row_is_checked_and_a_zero_removes_a_month_and_a_row_goes_with_its_months(): void
    {
        $svc = app(BudgetService::class);
        foreach ([
            ['type' => 'ledger', 'target_id' => 6, 'is_recovery' => true, 'months' => ['2026-06' => 1]] + [],   // Rent: an expense, a recovery is fine
        ] as $ok) {
            $this->assertCount(1, $svc->save([$ok], null));
        }
        $this->assertSame(1, DB::table('budget_rows')->where('is_recovery', 1)->count());
        foreach ([
            [['type' => 'group', 'target_id' => 6, 'is_recovery' => true, 'months' => ['2026-06' => 100]], 'rows.0.is_recovery'],   // Sales Accounts: income cannot be a recovery
            [['type' => 'group', 'target_id' => 99999, 'months' => ['2026-06' => 100]], 'rows.0'],
            [['type' => 'ledger', 'target_id' => 6, 'method' => 'magic', 'months' => []], 'rows.0.method'],
            [['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => -5]], 'rows.0.months.2026-06'],
            [['type' => 'ledger', 'target_id' => 6, 'months' => ['June' => 5]], 'rows.0.months'],
            [['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 4040, 'months' => ['2026-06' => 5]], 'rows.0.cost_centre_id'],
        ] as [$row, $key]) {
            try {
                $svc->save([$row], null);
                $this->fail("{$key} was accepted");
            } catch (ValidationException $e) {
                $this->assertArrayHasKey($key, $e->errors());
            }
        }
        DB::table('budget_rows')->delete();
        DB::table('budget_lines')->delete();
        $ids = $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 500, '2026-07' => 600]]], null);
        $svc->save([['row_id' => $ids[0], 'type' => 'ledger', 'target_id' => 6, 'months' => ['2026-07' => 0, '2026-06' => 700]]], null);
        $this->assertSame([['2026-06', 700.0]], DB::table('budget_lines')->get(['period', 'amount'])->map(fn ($r) => [$r->period, (float) $r->amount])->all());
        $this->assertSame(1, DB::table('budget_rows')->count(), 'the same row was updated, not a second one made');
        $this->assertSame(1, $svc->remove($ids[0]));
        $this->assertSame(0, DB::table('budget_rows')->count());
    }

    public function test_income_and_balance_sheet_lines_can_be_planned_too_and_stay_out_of_the_expense_chart(): void
    {
        $svc = app(BudgetService::class);
        $svc->save([['type' => 'group', 'target_id' => 6, 'months' => ['2026-01' => 100000]], ['type' => 'group', 'target_id' => 8, 'months' => ['2026-01' => 10]]], null);
        $all = $svc->against(Scope::dates('2026-01-01', '2026-01-31'), '2026-01-01', '2026-01-31');
        $this->assertEqualsCanonicalizing(['income', 'expense'], array_column($all['rows'], 'section'));
        $income = collect($all['rows'])->firstWhere('section', 'income');
        $this->assertEquals(100000, $income['actual'], 'earnings are credits less debits: the January sale');
        $this->assertFalse($income['over']);
        $exp = $svc->against(Scope::dates('2026-01-01', '2026-01-31'), '2026-01-01', '2026-01-31', ['expense']);
        $this->assertSame(['expense'], array_column($exp['rows'], 'section'));
    }

    public function test_a_row_can_be_for_one_cost_centre_and_is_read_from_that_cost_centres_entries(): void
    {
        $svc = app(BudgetService::class);
        $svc->save([
            ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-07' => 5000]],
            ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 10, 'months' => ['2026-07' => 5000]],
        ], null);
        $r = $svc->against(Scope::dates('2026-07-01', '2026-07-31'), '2026-07-01', '2026-07-31');
        $by = collect($r['rows'])->keyBy(fn ($x) => implode(',', $x['dimensions']));
        $this->assertEquals(4000, $by['Admin']['actual'], 'the split voucher put 4,000 of July rent on Admin');
        $this->assertEquals(7000, $by['Head office']['actual'], 'Head office includes the cost centres under it');
        $this->assertCount(2, DB::table('budget_rows')->get(), 'the same account with two cost centres is two rows');
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-08' => 1]]], null);
        $this->assertCount(2, DB::table('budget_rows')->get(), 'the same combination again is the same row, with another month');
        $this->assertSame(2, DB::table('budget_lines')->where('row_id', DB::table('budget_rows')->where('cost_centre_id', 11)->value('id'))->count());
    }

    public function test_a_recovery_lowers_the_net_spend_on_its_account(): void
    {
        $svc = app(BudgetService::class);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-07' => 10000]], ['type' => 'ledger', 'target_id' => 6, 'is_recovery' => true, 'months' => ['2026-07' => 4000]]], null);
        $r = $svc->against(Scope::dates('2026-07-01', '2026-07-31'), '2026-07-01', '2026-07-31');
        $this->assertCount(1, $r['rows'], 'an expense and its recovery are one line');
        $this->assertEquals(6000, $r['rows'][0]['budget']);
        $this->assertTrue($r['rows'][0]['has_recovery']);
        $this->assertEquals(7000, $r['rows'][0]['actual']);
    }

    public function test_an_initiative_nests_cannot_sit_under_itself_and_is_switched_off_when_it_is_in_use(): void
    {
        $svc = app(BudgetService::class);
        $cash = $svc->saveInitiative(['name' => 'Cash sales'], null);
        $travel = $svc->saveInitiative(['name' => 'Travel', 'parent_id' => $cash], null);
        $this->assertSame(['Cash sales', 'Cash sales › Travel'], array_column($svc->initiatives(), 'path'));
        $this->assertEqualsCanonicalizing([$cash, $travel], $svc->initiativeWithDescendants($cash));
        try {
            $svc->saveInitiative(['name' => 'Cash sales', 'parent_id' => $travel], null, $cash);
            $this->fail('a loop was accepted');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('parent_id', $e->errors());
        }
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'initiative_id' => $travel, 'months' => ['2026-07' => 1000]]], null);
        $r = $svc->against(Scope::dates('2026-07-01', '2026-07-31'), '2026-07-01', '2026-07-31');
        $this->assertTrue($r['rows'][0]['actual_pending'], 'the books do not carry an initiative yet, so there is no actual to show');
        $this->assertSame(['Travel'], $r['rows'][0]['dimensions']);
        try {
            $svc->removeInitiative($cash);
            $this->fail('an initiative with children was removed');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('id', $e->errors());
        }
        $this->assertSame('switched_off', $svc->removeInitiative($travel));
        $this->assertFalse(collect($svc->initiatives())->firstWhere('id', $travel)['is_active']);
        $other = $svc->saveInitiative(['name' => 'Spare'], null);
        $this->assertSame('removed', $svc->removeInitiative($other));
    }

    public function test_last_years_actuals_are_offered_month_by_month_for_the_year_being_planned(): void
    {
        $h = app(BudgetService::class)->history(['type' => 'ledger', 'target_id' => 6], 2026 + 1 - 1 + 1);   // 2027 plans from 2026
        $this->assertSame('2027-06', array_keys($h)[5]);
        $this->assertEquals(12000, $h['2027-06'], 'June 2026 rent');
        $this->assertEquals(7000, $h['2027-07']);
        $this->assertEquals(0, $h['2027-01']);
    }

    public function test_the_budgeting_screen_is_seen_with_books_view_and_changed_with_books_planning(): void
    {
        $this->as(['books.view']);
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonPath('budgets_ready', true)->assertJsonCount(12, 'months')->assertJsonPath('choices.initiatives', []);
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'target_id' => 8, 'months' => ['2026-06' => 1]]]])->assertForbidden();
        $this->postJson('/api/admin/books/planning/initiatives', ['name' => 'X'])->assertForbidden();
        $this->as(['books.view', 'books.planning']);
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'target_id' => 8, 'months' => ['2026-06' => 1000], 'method' => 'fixed', 'method_params' => ['amount' => 1000]]]])->assertOk()->assertJsonCount(1, 'ids');
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertJsonPath('lines.0.months.2026-06', 1000)->assertJsonPath('lines.0.method', 'fixed')->assertJsonPath('lines.0.method_params.amount', 1000);
        $this->putJson('/api/admin/books/planning/budgets', ['rows' => [['type' => 'group', 'target_id' => 6, 'is_recovery' => true, 'months' => ['2026-06' => 1]]]])->assertStatus(422);
        $this->getJson('/api/admin/books/planning/budgets/history?type=ledger&target_id=6&year=2027')->assertOk()->assertJsonPath('months.2027-06', 12000);
        $id = $this->postJson('/api/admin/books/planning/initiatives', ['name' => 'Website redesign'])->assertOk()->json('id');
        $this->putJson("/api/admin/books/planning/initiatives/{$id}", ['name' => 'Website', 'note' => 'IT'])->assertOk();
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertJsonPath('choices.initiatives.0.name', 'Website');
        $this->deleteJson("/api/admin/books/planning/initiatives/{$id}")->assertOk()->assertJsonPath('result', 'removed');
        $rowId = DB::table('budget_rows')->value('id');
        $this->deleteJson("/api/admin/books/planning/budgets/{$rowId}")->assertOk()->assertJsonPath('removed', 1);
    }

    // ── versions and approval ──────────────────────────────────────────

    private function user(int $id): User
    {
        $u = new User();
        $u->id = $id;

        return $u;
    }

    public function test_a_first_budget_and_version_are_made_when_rows_are_saved_with_none(): void
    {
        $svc = app(BudgetService::class);
        $this->assertSame([], $svc->budgets());
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 1]]], null);
        $b = $svc->budgets();
        $this->assertCount(1, $b);
        $this->assertSame(['Original'], array_column($b[0]['versions'], 'name'));
        $this->assertSame('draft', $b[0]['versions'][0]['status']);
    }

    public function test_a_version_goes_draft_submitted_approved_locked_and_is_only_editable_as_a_draft(): void
    {
        $svc = app(BudgetService::class);
        $this->setting('second_approver_budget', true);
        $b = $svc->createBudget(['name' => '2026 operating', 'from_month' => '2026-01', 'to_month' => '2026-12'], $this->user(1));
        $v = $svc->currentVersion($b);
        try {
            $svc->transition($v, 'submit', $this->user(1));
            $this->fail('an empty version was submitted');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('nothing in this version', $e->errors()['status'][0]);
        }
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 500]]], $this->user(1), $v);
        $this->assertSame('submitted', $svc->transition($v, 'submit', $this->user(1)));
        try {
            $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 999]]], $this->user(1), $v);
            $this->fail('a submitted version was edited');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('submitted and cannot be changed', $e->errors()['version'][0]);
        }
        try {
            $svc->transition($v, 'approve', $this->user(1));
            $this->fail('the person who submitted approved it');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('second person', $e->errors()['status'][0]);
        }
        try {
            $svc->transition($v, 'reject', $this->user(2));
            $this->fail('rejected without a reason');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('note', $e->errors());
        }
        $this->assertSame('draft', $svc->transition($v, 'reject', $this->user(2), 'Rent is too low'));
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 800]]], $this->user(1), $v);
        $svc->transition($v, 'submit', $this->user(1));
        $this->assertSame('approved', $svc->transition($v, 'approve', $this->user(2), 'Fine'));
        $this->assertSame(2, (int) DB::table('budget_versions')->where('id', $v)->value('approved_by'));
        try {
            $svc->remove((int) DB::table('budget_rows')->where('version_id', $v)->value('id'));
            $this->fail('an approved row was removed');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('Make a revision', $e->errors()['version'][0]);
        }
        $this->assertSame('locked', $svc->transition($v, 'lock', $this->user(2)));
        $this->assertSame('approved', $svc->transition($v, 'reopen', $this->user(2)));
        $this->assertSame(['created', 'submitted', 'rejected', 'submitted', 'approved', 'locked', 'reopened'], array_column($svc->approvalLog($v), 'action'));
        $this->assertSame('Rent is too low', $svc->approvalLog($v)[2]['note']);
        try {
            $svc->transition($v, 'submit', $this->user(1));
            $this->fail('an approved version was submitted');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }
    }

    public function test_the_second_approver_rule_can_be_switched_off(): void
    {
        $svc = app(BudgetService::class);
        $this->setting('second_approver_budget', false);
        $b = $svc->createBudget(['name' => 'Solo', 'from_month' => '2026-01', 'to_month' => '2026-12'], $this->user(1));
        $v = $svc->currentVersion($b);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-06' => 1]]], $this->user(1), $v);
        $svc->transition($v, 'submit', $this->user(1));
        $this->assertSame('approved', $svc->transition($v, 'approve', $this->user(1)));
    }

    public function test_a_revision_is_a_copy_so_the_approved_original_stays_as_it_was(): void
    {
        $svc = app(BudgetService::class);
        $this->setting('second_approver_budget', false);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], $this->user(1));
        $orig = $svc->currentVersion($b);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-06' => 1000, '2026-07' => 2000], 'method' => 'fixed', 'method_params' => ['amount' => 1000]]], $this->user(1), $orig);
        $svc->transition($orig, 'submit', $this->user(1));
        $svc->transition($orig, 'approve', $this->user(1));
        $rev = $svc->createVersion($b, ['kind' => 'revision'], $this->user(1));
        $this->assertSame('Revision 1', DB::table('budget_versions')->where('id', $rev)->value('name'));
        $this->assertSame($orig, (int) DB::table('budget_versions')->where('id', $rev)->value('copied_from_id'));
        $this->assertSame('draft', DB::table('budget_versions')->where('id', $rev)->value('status'));
        $copy = $svc->lines('2026-01-01', '2026-12-31', $rev);
        $this->assertCount(1, $copy);
        $this->assertSame([1000.0, 2000.0], array_values($copy[0]['months']));
        $this->assertSame(11, $copy[0]['cost_centre_id']);
        $this->assertSame('fixed', $copy[0]['method']);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-06' => 5000]]], $this->user(1), $rev);
        $this->assertEquals(1000, $svc->lines('2026-01-01', '2026-12-31', $orig)[0]['months']['2026-06'], 'the approved original did not change');
        $this->assertEquals(5000, $svc->lines('2026-01-01', '2026-12-31', $rev)[0]['months']['2026-06']);
        $this->assertSame($orig, $svc->currentVersion($b), 'the approved version stays the current one until the revision is approved');
        $svc->transition($rev, 'submit', $this->user(1));
        $svc->transition($rev, 'approve', $this->user(1));
        $this->assertSame($rev, $svc->currentVersion($b), 'once approved, the newest approved version is the current one');
        $r = $svc->against(Scope::dates('2026-06-01', '2026-06-30'), '2026-06-01', '2026-06-30');
        $this->assertEquals(5000, $r['rows'][0]['budget'], 'the chart reads the current version');
        $this->assertCount(1, DB::table('budget_rows')->where('version_id', $orig)->get());
        $this->assertCount(2, $svc->budgets()[0]['versions']);
    }

    public function test_a_budget_is_checked_and_a_new_version_must_copy_a_version_of_its_own_budget(): void
    {
        $svc = app(BudgetService::class);
        try {
            $svc->createBudget(['name' => '', 'from_month' => '2026-13', 'to_month' => '2025-01', 'budget_type' => 'nope'], null);
            $this->fail('a bad budget was made');
        } catch (ValidationException $e) {
            $this->assertEqualsCanonicalizing(['name', 'from_month', 'budget_type'], array_keys($e->errors()));
        }
        $a = $svc->createBudget(['name' => 'A', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $b = $svc->createBudget(['name' => 'B', 'from_month' => '2026-01', 'to_month' => '2026-12', 'budget_type' => 'capex'], null);
        $this->expectException(ValidationException::class);
        $svc->createVersion($a, ['kind' => 'revision', 'from_version_id' => $svc->currentVersion($b)], null);
    }

    public function test_the_versions_routes_need_the_right_permission(): void
    {
        $this->as(['books.view', 'books.planning']);
        $b = $this->postJson('/api/admin/books/planning/budget-sets', ['name' => '2027', 'from_month' => '2027-01', 'to_month' => '2027-12'])->assertOk()->json();
        $v = $b['version_id'];
        $this->putJson('/api/admin/books/planning/budgets', ['version_id' => $v, 'rows' => [['type' => 'ledger', 'target_id' => 6, 'months' => ['2027-01' => 10]]]])->assertOk();
        $this->postJson("/api/admin/books/planning/versions/{$v}/submit")->assertOk()->assertJsonPath('status', 'submitted');
        $this->postJson("/api/admin/books/planning/versions/{$v}/approve")->assertForbidden();
        $this->putJson('/api/admin/books/planning/budgets', ['version_id' => $v, 'rows' => [['type' => 'ledger', 'target_id' => 6, 'months' => ['2027-01' => 99]]]])->assertStatus(422);
        $this->as(['books.view', 'books.planning', 'books.budget.approve']);
        $this->postJson("/api/admin/books/planning/versions/{$v}/reject", ['note' => 'again'])->assertOk()->assertJsonPath('status', 'draft');
        $this->postJson("/api/admin/books/planning/versions/{$v}/submit")->assertOk();
        $this->setting('second_approver_budget', false);
        $this->postJson("/api/admin/books/planning/versions/{$v}/approve")->assertOk()->assertJsonPath('status', 'approved');
        $this->postJson("/api/admin/books/planning/budget-sets/{$b['id']}/versions", ['kind' => 'scenario', 'name' => 'Worst case'])->assertOk();
        $show = $this->getJson("/api/admin/books/planning?from=2027-01-01&to=2027-12-31&version_id={$v}")->assertOk();
        $show->assertJsonPath('budgets.0.versions.1.name', 'Worst case')->assertJsonPath('version_id', $v)->assertJsonCount(5, 'approvals')->assertJsonPath('lines.0.months.2027-01', 10);
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
        $this->assertStringContainsString('Budgeting', $b['message']);
        app(BudgetService::class)->save([['type' => 'group', 'id' => 8, 'months' => ['2026-06' => 20000]]], null);
        $this->assertTrue($svc->chart('budget', Scope::dates('2026-01-01', '2026-10-28'))['data']['ready']);
        $f = $svc->chart('cash-forecast', Scope::dates('2026-01-01', '2026-10-28'))['data'];
        $this->assertTrue($f['ready'], $f['message'] ?? '');
        $this->assertSame('2026-10-28', $f['start']);
    }
}
