<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BudgetControl;
use App\Services\Books\BudgetMethods;
use App\Services\Books\Engine\Reports\BudgetAgainstActualReport;
use App\Services\Books\BudgetService;
use App\Services\Books\BudgetTemplateService;
use App\Services\Books\BudgetTransferService;
use App\Services\Books\Engine\Reports\MasterBudgetReport;
use App\Services\Books\MasterBudgetService;
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

    private const TABLES = ['locations', 'budget_lines', 'budget_rows', 'budget_initiatives', 'budgets', 'budget_versions', 'budget_approvals', 'budget_templates', 'budget_template_lines', 'budget_control_rules', 'budget_overrides', 'budget_transfers', 'users', 'forecast_items', 'voucher_bill_refs', 'report_settings', 'report_settings_log'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('237_planning.sql', '239_budgeting.sql', '240_budget_versions.sql', '241_budget_templates.sql', '242_budget_controls.sql', '243_budget_transfers.sql');
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

    // ── templates ──────────────────────────────────────────────────────

    public function test_the_ways_of_filling_months_add_up_and_wait_for_what_they_need(): void
    {
        $months = ['2027-01', '2027-02', '2027-03'];
        $this->assertSame(['2027-01' => 333.33, '2027-02' => 333.33, '2027-03' => 333.34], BudgetMethods::fill('annual', ['total' => 1000], $months), 'the odd cent goes on the last month');
        $this->assertSame(['2027-01' => 50.0, '2027-02' => 50.0, '2027-03' => 50.0], BudgetMethods::fill('fixed', ['amount' => 50], $months));
        $this->assertSame(['2027-01' => 200000.0, '2027-02' => 200000.0, '2027-03' => 200000.0], BudgetMethods::fill('quantity', ['quantity' => 5, 'rate' => 40000], $months));
        $this->assertEquals([100, 300, 600], array_values(BudgetMethods::fill('seasonal', ['total' => 1000, 'shares' => ['01' => 10, '02' => 30, '03' => 60]], $months)));
        $this->assertEquals([5, 10, 0], array_values(BudgetMethods::fill('percent', ['percent' => 5], $months, ['2027-01' => 100, '2027-02' => 200])));
        $this->assertEquals([110, 0, 0], array_values(BudgetMethods::fill('history', ['growth' => 10], $months, null, ['2027-01' => 100])));
        $this->assertNull(BudgetMethods::fill('percent', ['percent' => 5], $months), 'a percent of a row that is not there');
        $this->assertNull(BudgetMethods::fill('history', [], $months));
        $this->assertNull(BudgetMethods::fill('manual', null, $months));
    }

    private function sourceVersion(): int
    {
        $svc = app(BudgetService::class);
        $this->setting('second_approver_budget', false);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], $this->user(1));
        $v = $svc->currentVersion($b);
        $ids = $svc->save([
            ['type' => 'group', 'target_id' => 6, 'months' => ['2026-01' => 100000], 'method' => 'fixed', 'method_params' => ['amount' => 100000]],
            ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-01' => 1], 'method' => 'history', 'method_params' => ['growth' => 10], 'note' => 'Office rent'],
            ['type' => 'ledger', 'target_id' => 9, 'months' => ['2026-01' => 1], 'method' => 'manual'],
        ], $this->user(1), $v);
        $svc->save([['type' => 'ledger', 'target_id' => 20, 'months' => ['2026-01' => 1], 'method' => 'percent', 'method_params' => ['percent' => 5, 'of' => "r{$ids[0]}"]]], $this->user(1), $v);

        return $v;
    }

    public function test_a_version_is_saved_as_a_template_that_keeps_how_the_months_were_filled_but_not_the_amounts(): void
    {
        $this->setting('second_approver_budget', false);
        DB::table('ledgers')->insert(['id' => 20, 'group_id' => 8, 'name' => 'Travel', 'opening_balance' => 0, 'opening_side' => 'D']);
        $t = app(BudgetTemplateService::class);
        $tid = $t->saveFromVersion($this->sourceVersion(), ['name' => 'Retail operating', 'description' => 'Every year'], $this->user(1));
        $lines = $t->lines($tid);
        $this->assertSame(['fixed', 'history', 'manual', 'percent'], array_column($lines, 'method'));
        $this->assertSame(['Office rent'], array_values(array_filter(array_column($lines, 'note'))));
        $this->assertSame(['Admin'], $lines[1]['dimensions']);
        $this->assertNull($lines[2]['method_params'], 'a hand-typed row keeps no amounts');
        $this->assertSame($lines[0]['id'], $lines[3]['method_params']['of_line'], 'the row a percent is of became the template line');
        $this->assertSame([['id' => $tid, 'name' => 'Retail operating', 'description' => 'Every year', 'type' => 'operating', 'lines' => 4]], $t->templates());
        $t->removeLine($tid, $lines[2]['id']);
        $this->assertCount(3, $t->lines($tid));
        $t->update($tid, ['name' => 'Retail 2', 'description' => '']);
        $this->assertSame('Retail 2', $t->templates()[0]['name']);
        $t->delete($tid);
        $this->assertSame([], $t->templates());
        $this->assertSame(0, DB::table('budget_template_lines')->count());
        $this->expectException(ValidationException::class);
        $t->saveFromVersion($this->sourceVersion(), ['name' => ''], null);
    }

    public function test_a_budget_made_from_a_template_works_out_its_own_months(): void
    {
        DB::table('ledgers')->insert(['id' => 20, 'group_id' => 8, 'name' => 'Travel', 'opening_balance' => 0, 'opening_side' => 'D']);
        $t = app(BudgetTemplateService::class);
        $svc = app(BudgetService::class);
        $tid = $t->saveFromVersion($this->sourceVersion(), ['name' => 'Retail'], $this->user(1));
        $b = $t->createBudget($tid, ['name' => '2027 operating', 'from_month' => '2027-01', 'to_month' => '2027-12'], $this->user(1));
        $v = $svc->currentVersion($b);
        $this->assertSame('draft', DB::table('budget_versions')->where('id', $v)->value('status'));
        $this->assertSame('From the template Retail', DB::table('budgets')->where('id', $b)->value('note'));
        $rows = collect($svc->lines('2027-01-01', '2027-12-31', $v))->keyBy(fn ($r) => $r['name'] . ($r['cost_centre_id'] ? '@' . $r['cost_centre_id'] : ''));
        $this->assertCount(4, $rows);
        $sales = $rows['Sales Accounts'];
        $this->assertCount(12, $sales['months'], 'a fixed amount in every month of the new budget');
        $this->assertEquals(100000, $sales['months']['2027-05']);
        $rent = $rows['Rent@11'];
        $this->assertEquals(4000 * 1.1, $rent['months']['2027-07'], "last year's July rent on Admin plus 10%, read for the new year");
        $this->assertArrayNotHasKey('2027-06', $rent['months'], "June's rent was not booked to Admin, and a month of nothing is no budget");
        $this->assertSame('Office rent', $rent['note']);
        $this->assertEquals(5000, $rows['Travel']['months']['2027-03'], '5% of the 100,000 sales');
        $this->assertSame("r{$sales['id']}", $rows['Travel']['method_params']['of'], 'a percent points at its row in the new budget');
        $this->assertSame([], $rows[array_keys($rows->all())[2]]['months'], 'a hand-typed line starts empty');
        $this->assertSame(['created'], array_column($svc->approvalLog($v), 'action'));
    }

    public function test_the_template_routes_need_the_planning_permission(): void
    {
        $this->setting('second_approver_budget', false);
        $v = $this->sourceVersionAs();
        $this->as(['books.view']);
        $this->postJson('/api/admin/books/planning/templates', ['version_id' => $v, 'name' => 'T'])->assertForbidden();
        $this->as(['books.view', 'books.planning']);
        $id = $this->postJson('/api/admin/books/planning/templates', ['version_id' => $v, 'name' => 'T'])->assertOk()->json('id');
        $this->postJson('/api/admin/books/planning/templates', ['version_id' => $v, 'name' => ''])->assertStatus(422);
        $this->getJson("/api/admin/books/planning/templates/{$id}")->assertOk()->assertJsonCount(1, 'lines');
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertJsonPath('templates.0.name', 'T')->assertJsonPath('templates_ready', true);
        $b = $this->postJson("/api/admin/books/planning/templates/{$id}/budget", ['name' => 'N', 'from_month' => '2027-01', 'to_month' => '2027-06'])->assertOk()->json();
        $this->assertNotNull($b['version_id']);
        $this->putJson("/api/admin/books/planning/templates/{$id}", ['name' => 'T2'])->assertOk();
        $this->deleteJson("/api/admin/books/planning/templates/{$id}/lines/" . DB::table('budget_template_lines')->value('id'))->assertOk();
        $this->deleteJson("/api/admin/books/planning/templates/{$id}")->assertOk();
    }

    private function sourceVersionAs(): int
    {
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => 'Src', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $v = $svc->currentVersion($b);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-01' => 5], 'method' => 'fixed', 'method_params' => ['amount' => 5]]], null, $v);

        return $v;
    }

    // ── controls ───────────────────────────────────────────────────────

    /** An approved budget of 1,000 a month for Rent on Admin; Rent on Admin already has 4,000 booked in July. */
    private function controlWorld(string $mode = 'warn'): void
    {
        $this->setting('budget_control_mode', $mode);
        $this->setting('second_approver_budget', false);
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $v = $svc->currentVersion($b);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => array_combine(array_map(fn ($m) => sprintf('2026-%02d', $m), range(1, 12)), array_fill(0, 12, 1000))]], null, $v);
        $svc->transition($v, 'submit', $this->user(1));
        $svc->transition($v, 'approve', $this->user(2));
    }

    private function purchase(float $amount, string $date = '2026-08-15', int $ledger = 6, ?int $cc = 11): array
    {
        $plan = ['date' => Carbon::parse($date), 'location_id' => 1, 'rate' => 1, 'entries' => [
            ['ledger_id' => $ledger, 'side' => 'D', 'amount' => $amount, 'base_amount' => $amount, 'cost_centre_id' => $cc],
            ['ledger_id' => 8, 'side' => 'C', 'amount' => $amount, 'base_amount' => $amount, 'is_party' => true],
        ]];

        return [$plan, new VoucherType(['base_type' => 'purchase']), []];
    }

    private function check(float $amount, ?User $user = null, string $date = '2026-08-15', int $ledger = 6, ?int $cc = 11): array
    {
        [$plan, $type, $data] = $this->purchase($amount, $date, $ledger, $cc);

        return app(BudgetControl::class)->assess($plan, $type, $data, $user ?? $this->user(7));
    }

    public function test_nothing_is_checked_when_controls_are_off_or_there_is_no_budget_or_the_voucher_is_not_a_purchase(): void
    {
        $this->assertSame('none', $this->check(999999)['action'], 'no budget at all');
        $this->controlWorld('off');
        $this->assertSame('none', $this->check(999999)['action'], 'controls are off');
        $this->controlWorld('block');
        [$plan, , $data] = $this->purchase(999999);
        $this->assertSame('none', app(BudgetControl::class)->assess($plan, new VoucherType(['base_type' => 'sales']), $data, $this->user(7))['action'], 'a sale is never held up');
    }

    public function test_a_voucher_inside_its_budget_year_to_date_passes_and_one_over_it_is_caught(): void
    {
        $this->controlWorld('warn');
        $this->assertSame('none', $this->check(2000)['action'], '4,000 + 2,000 is 75% of the 8,000 budgeted January to August: well inside');
        $this->assertSame('warn', $this->check(3000)['action'], '87.5% is over the 80% line');
        $this->assertSame('near', $this->check(3000)['breaches'][0]['level']);
        $this->assertSame('warn', $this->check(5000)['action']);
        $this->assertSame('over', $this->check(5000)['breaches'][0]['level']);
    }

    public function test_the_choice_decides_what_follows_an_overspend_and_a_person_who_may_exceed_is_never_stopped(): void
    {
        $this->controlWorld('warn');
        $c = $this->check(5000);   // 4,000 + 5,000 = 9,000 against 8,000
        $this->assertSame('warn', $c['action']);
        $this->assertSame('over', $c['breaches'][0]['level']);
        $this->assertEquals([8000, 4000, 5000, 9000, 1000, 112.5], [$c['breaches'][0]['budget'], $c['breaches'][0]['spent_before'], $c['breaches'][0]['amount'], $c['breaches'][0]['after'], $c['breaches'][0]['over_by'], $c['breaches'][0]['used_pct']]);
        $this->assertSame('Rent, Admin', $c['breaches'][0]['line']);
        $this->setting('budget_control_mode', 'approval');
        $this->assertSame('approval', $this->check(5000)['action']);
        $this->setting('budget_control_mode', 'block');
        $blocked = $this->check(5000);
        $this->assertSame('block', $blocked['action']);
        $this->assertStringContainsString('It is blocked', app(BudgetControl::class)->message($blocked));
        $boss = $this->user(9);
        $this->grant($boss, ['books.budget.exceed']);
        $allowed = $this->check(5000, $boss);
        $this->assertSame('allowed', $allowed['action']);
        $this->assertTrue($allowed['can_exceed']);
        $this->assertSame('over', $allowed['breaches'][0]['level'], 'they are still told');
    }

    public function test_a_line_close_to_its_budget_gets_a_gentle_warning_and_the_alert_can_be_turned_off(): void
    {
        $this->controlWorld('block');
        $near = $this->check(2500);   // 6,500 of 8,000 is 81.3%
        $this->assertSame('warn', $near['action'], 'near is only ever a warning, even when blocking');
        $this->assertSame('near', $near['breaches'][0]['level']);
        $this->assertEquals(81.3, $near['breaches'][0]['used_pct']);
        $this->setting('budget_alert_percent', 0);
        $this->assertSame('none', $this->check(2500)['action']);
        $this->assertSame('none', $this->check(1000)['action']);
    }

    public function test_the_basis_changes_the_budget_a_voucher_is_checked_against(): void
    {
        $this->controlWorld('warn');
        $this->setting('budget_control_basis', 'month');
        $this->assertSame('warn', $this->check(1500)['action'], 'August has 1,000');
        $this->assertEquals(1000, $this->check(1500)['breaches'][0]['budget']);
        $this->setting('budget_control_basis', 'year');
        $this->assertSame('none', $this->check(5000, null, '2026-08-15')['action'], '4,000 + 5,000 against 12,000 for the year');
        $this->assertEquals(12000, $this->check(8100)['breaches'][0]['budget']);
    }

    public function test_the_cost_centre_and_branch_of_the_voucher_decide_which_budget_line_it_counts_against(): void
    {
        $this->controlWorld('block');
        $this->assertSame('none', $this->check(999999, null, '2026-08-15', 6, 10)['action'], 'Head office has no rent budget row of its own: nothing to be over');
        $this->assertSame('none', $this->check(999999, null, '2026-08-15', 9, 11)['action'], 'another account entirely');
        $row = DB::table('budget_rows')->first();
        DB::table('budget_rows')->where('id', $row->id)->update(['location_id' => 2, 'dim_key' => '11-0-2-0-0']);
        $this->assertSame('none', $this->check(999999)['action'], 'the row is for Mombasa; this voucher is for branch 1');
    }

    public function test_an_exception_for_an_account_or_department_beats_the_company_wide_choice(): void
    {
        $this->controlWorld('block');
        $c = app(BudgetControl::class);
        $c->saveRule(['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'warn'], null);
        $this->assertSame('warn', $this->check(5000)['action'], 'rent only warns, whatever the default says');
        $c->saveRule(['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'off'], null);
        $this->assertSame('none', $this->check(5000)['action'], 'and can be left out altogether');
        $this->assertCount(1, $c->rules());
        $this->assertSame('Rent', $c->rules()[0]['name']);
        $this->setting('budget_control_mode', 'off');
        $c->saveRule(['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'block'], null);
        $this->assertSame('block', $this->check(5000)['action'], 'an exception can switch a control on when the company default is off');
        $c->removeRule($c->rules()[0]['id']);
        $this->assertSame([], $c->rules());
        $this->expectException(ValidationException::class);
        $c->saveRule(['scope_type' => 'ledger', 'scope_id' => 99999, 'mode' => 'nope'], null);
    }

    public function test_an_overspend_is_recorded_waits_for_a_second_person_and_goes_when_the_voucher_is_cancelled(): void
    {
        $this->controlWorld('approval');
        $c = app(BudgetControl::class);
        $voucher = new Voucher(); $voucher->id = 41;
        $c->record($voucher, $this->check(5000, $this->user(7)), $this->user(7));
        $o = $c->overrides();
        $this->assertCount(1, $o);
        $this->assertSame(['pending', 'Rent, Admin', 1000.0], [$o[0]['status'], $o[0]['line_label'], (float) $o[0]['over_by']]);
        $this->setting('second_approver_budget', true);
        try {
            $c->decide((int) $o[0]['id'], 'approve', $this->user(7), null);
            $this->fail('the person who posted it approved it');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('second person', $e->errors()['status'][0]);
        }
        try {
            $c->decide((int) $o[0]['id'], 'reject', $this->user(8), '');
            $this->fail('turned down without a reason');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('note', $e->errors());
        }
        $this->assertSame('approved', $c->decide((int) $o[0]['id'], 'approve', $this->user(8), 'Fine'));
        try {
            $c->decide((int) $o[0]['id'], 'approve', $this->user(8), null);
            $this->fail('decided twice');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }
        $voucher2 = new Voucher(); $voucher2->id = 42;
        $c->record($voucher2, $this->check(5000, $this->user(7)), $this->user(7));
        $this->assertSame('pending', $c->overrides('pending')[0]['status']);
        $c->withdraw(42);
        $this->assertSame([], $c->overrides('pending'), 'a cancelled voucher needs no approval');
        $c->record($voucher2, $this->check(2500, $this->user(7)), $this->user(7));
        $this->assertCount(1, $c->overrides(), 'a voucher only near its budget records nothing, and the approved one stays');
    }

    public function test_the_controls_screen_and_its_routes_need_the_right_permissions(): void
    {
        $this->controlWorld('approval');
        $c = app(BudgetControl::class);
        $v = new Voucher(); $v->id = 50;
        $c->record($v, $this->check(5000), $this->user(7));
        $id = $c->overrides()[0]['id'];
        $this->as(['books.view']);
        $this->getJson('/api/admin/books/planning?from=2026-01-01&to=2026-12-31')->assertOk()->assertJsonPath('controls.ready', true)->assertJsonPath('controls.overrides.0.status', 'pending')->assertJsonPath('controls.settings.mode', 'approval');
        $this->postJson('/api/admin/books/planning/control-rules', ['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'warn'])->assertForbidden();
        $this->as(['books.view', 'books.planning']);
        $rule = $this->postJson('/api/admin/books/planning/control-rules', ['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'warn'])->assertOk()->json('id');
        $this->postJson('/api/admin/books/planning/control-rules', ['scope_type' => 'ledger', 'scope_id' => 6, 'mode' => 'x'])->assertStatus(422);
        $this->postJson("/api/admin/books/planning/overrides/{$id}/approve")->assertForbidden();
        $this->deleteJson("/api/admin/books/planning/control-rules/{$rule}")->assertOk();
        $this->as(['books.view', 'books.budget.approve']);
        $this->postJson("/api/admin/books/planning/overrides/{$id}/reject", [])->assertStatus(422);
        $this->postJson("/api/admin/books/planning/overrides/{$id}/reject", ['note' => 'No'])->assertOk()->assertJsonPath('status', 'rejected');
    }

    // ── transfers, carry-forward and scenarios ─────────────────────────

    /** An approved version with Rent on Admin and Rent on Head office, 1,000 a month each, in 2026. @return array{0: int, 1: int, 2: int} version, Admin row, Head office row */
    private function transferWorld(bool $approve = true): array
    {
        $this->setting('second_approver_budget', true);
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $v = $svc->currentVersion($b);
        $months = array_combine(array_map(fn ($m) => sprintf('2026-%02d', $m), range(1, 12)), array_fill(0, 12, 1000));
        $ids = $svc->save([['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => $months], ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 10, 'months' => $months]], $this->user(1), $v);
        if ($approve) {
            $svc->transition($v, 'submit', $this->user(1));
            $svc->transition($v, 'approve', $this->user(2));
        }

        return [$v, $ids[0], $ids[1]];
    }

    public function test_budget_moves_between_lines_of_an_approved_version_with_a_reason_and_a_second_persons_approval(): void
    {
        [$v, $admin, $head] = $this->transferWorld(false);
        $t = app(BudgetTransferService::class);
        $svc = app(BudgetService::class);
        try {
            $t->request(['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 100], $this->user(1));
            $this->fail('a draft was given a transfer');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('draft can simply be edited', $e->errors()['version'][0]);
        }
        $svc->transition($v, 'submit', $this->user(1));
        $svc->transition($v, 'approve', $this->user(2));
        foreach ([
            [['from_row_id' => $admin, 'to_row_id' => $admin, 'period' => '2026-08', 'amount' => 100], 'to_row_id'],
            [['from_row_id' => $admin, 'to_row_id' => $head, 'period' => 'Aug', 'amount' => 100], 'period'],
            [['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 0], 'amount'],
            [['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 1500], 'amount'],
            [['from_row_id' => 99999, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 5], 'from_row_id'],
        ] as [$in, $key]) {
            try {
                $t->request($in, $this->user(1));
                $this->fail("{$key} was accepted");
            } catch (ValidationException $e) {
                $this->assertArrayHasKey($key, $e->errors());
            }
        }
        $id = $t->request(['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 400, 'note' => 'Head office is moving'], $this->user(1));
        $this->assertEquals(1000, collect($svc->lines('2026-01-01', '2026-12-31', $v, true))->firstWhere('id', $admin)['months']['2026-08'], 'a waiting transfer changes nothing');
        try {
            $t->request(['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 700], $this->user(1));
            $this->fail('more than was left after the one waiting');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('only 600.00 left', $e->errors()['amount'][0]);
        }
        try {
            $t->decide($id, 'approve', $this->user(1), null);
            $this->fail('the person who asked accepted it');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('second person', $e->errors()['status'][0]);
        }
        $this->assertSame('approved', $t->decide($id, 'approve', $this->user(2), 'Agreed'));
        $eff = collect($svc->lines('2026-01-01', '2026-12-31', $v, true))->keyBy('id');
        $this->assertEquals([600, 1400], [$eff[$admin]['months']['2026-08'], $eff[$head]['months']['2026-08']]);
        $base = collect($svc->lines('2026-01-01', '2026-12-31', $v))->keyBy('id');
        $this->assertEquals([1000, 1000], [$base[$admin]['months']['2026-08'], $base[$head]['months']['2026-08']], 'the approved version itself is untouched');
        $r = $svc->against(Scope::dates('2026-08-01', '2026-08-31'), '2026-08-01', '2026-08-31', null, $v);
        $this->assertEquals(2000, array_sum(array_column($r['rows'], 'budget')), 'what moves is neither made nor lost');
        $adminRow = collect($r['rows'])->firstWhere('dimensions', ['Admin']);
        $this->assertEquals([600, 1400], [$adminRow['budget'], collect($r['rows'])->firstWhere('dimensions', ['Head office'])['budget']], 'the report reads the plan with the approved transfer in it');
        $log = $t->forVersion($v);
        $this->assertSame(['approved', 'Rent, Head office', 'Rent, Admin', 400.0], [$log[0]['status'], $log[0]['to'], $log[0]['from'], $log[0]['amount']]);
        $second = $t->request(['from_row_id' => $head, 'to_row_id' => $admin, 'period' => '2026-09', 'amount' => 50], $this->user(1));
        $this->assertSame('pending', $t->forVersion($v)[0]['status'], 'the ones waiting come first');
        try {
            $t->withdraw($second, $this->user(3));
            $this->fail('someone else took it back');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }
        $t->withdraw($second, $this->user(1));
        $this->assertCount(1, $t->forVersion($v));
        $third = $t->request(['from_row_id' => $head, 'to_row_id' => $admin, 'period' => '2026-09', 'amount' => 50], $this->user(1));
        try {
            $t->decide($third, 'reject', $this->user(2), '');
            $this->fail('turned down without a reason');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('note', $e->errors());
        }
        $this->assertSame('rejected', $t->decide($third, 'reject', $this->user(2), 'No need'));
        $svc->transition($v, 'lock', $this->user(2));
        $this->expectException(ValidationException::class);
        $t->request(['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-10', 'amount' => 5], $this->user(1));
    }

    public function test_unused_expense_budget_expires_by_default_and_rolls_forward_when_the_company_says_so(): void
    {
        [$v] = $this->transferWorld();
        $svc = app(BudgetService::class);
        $this->assertFalse($svc->carriesForward());
        $rows = fn () => collect($svc->against(Scope::dates('2026-01-01', '2026-08-31'), '2026-01-01', '2026-08-31', null, $v)['rows'])->firstWhere('dimensions', ['Admin'])['months'];
        $this->assertEquals(0, $rows()[6]['carried_in'], 'nothing carries unless asked');
        $this->assertEquals(1000, $rows()[6]['available']);
        $this->setting('budget_carry_forward', 'carry');
        $m = $rows();
        $this->assertEquals([0, 1000], [$m[0]['carried_in'], $m[0]['available']]);
        $this->assertEquals(6000, $m[6]['carried_in'], 'six unspent months of 1,000 roll into July');
        $this->assertEquals(7000, $m[6]['available']);
        $this->assertEquals(3000, $m[7]['carried_in'], 'July had 7,000 room and 4,000 spent');
        $this->assertEquals(1000, $m[6]['budget'], 'the budget itself does not change, only the room');
        $budget = ['2026-01' => 1000, '2026-02' => 1000, '2026-03' => 1000];
        $this->assertEquals(1000.0, BudgetService::carriedInto($budget, ['2026-01' => 500, '2026-02' => 3000, '2026-03' => 0]), 'January leaves 500, February is overspent down to nothing (it does not owe March), March adds 1,000');
        $this->assertEquals(0.0, BudgetService::carriedInto($budget, ['2026-01' => 5000, '2026-02' => 5000, '2026-03' => 5000]));
    }

    public function test_the_month_check_uses_last_months_leftover_when_unused_budget_carries_forward(): void
    {
        $this->controlWorld('warn');
        $this->setting('budget_control_basis', 'month');
        $this->assertSame('warn', $this->check(1500)['action'], 'August has 1,000 and the rest expired');
        $this->setting('budget_carry_forward', 'carry');
        $c = $this->check(3500);
        $this->assertEquals(4000, $c['breaches'][0]['budget'], 'August 1,000 plus 3,000 left over from July');
        $this->assertSame('warn', $c['action'], '3,500 of 4,000 is close');
        $this->assertSame('near', $c['breaches'][0]['level']);
        $this->assertSame('none', $this->check(1500)['action'], '1,500 of 4,000 is comfortable');
        $this->assertSame('over', $this->check(4500)['breaches'][0]['level']);
    }

    public function test_a_scenario_is_a_copy_with_percent_changes_and_the_versions_can_be_set_side_by_side(): void
    {
        $this->setting('second_approver_budget', false);
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $orig = $svc->currentVersion($b);
        $svc->save([['type' => 'group', 'target_id' => 6, 'months' => ['2026-01' => 100000, '2026-02' => 100000]], ['type' => 'ledger', 'target_id' => 6, 'months' => ['2026-01' => 10000]], ['type' => 'group', 'target_id' => 8, 'months' => ['2026-01' => 20000]]], $this->user(1), $orig);
        $svc->transition($orig, 'submit', $this->user(1));
        $svc->transition($orig, 'approve', $this->user(1));
        $worst = $svc->createVersion($b, ['kind' => 'scenario', 'name' => 'Worst case', 'drivers' => [['scope' => 'income', 'percent' => -15], ['scope' => 'ledger', 'id' => 6, 'percent' => 10]]], $this->user(1));
        $lines = collect($svc->lines('2026-01-01', '2026-12-31', $worst))->keyBy(fn ($l) => $l['type'] . $l['target_id']);
        $this->assertEquals([85000, 85000], array_values($lines['group6']['months']), 'sales down 15%');
        $this->assertEquals(11000, $lines['ledger6']['months']['2026-01'], 'rent up 10%');
        $this->assertEquals(20000, $lines['group8']['months']['2026-01'], 'what no driver touches stays');
        $this->assertSame('Drivers: All income -15%; Rent +10%', DB::table('budget_versions')->where('id', $worst)->value('note'));
        $this->assertEquals(100000, collect($svc->lines('2026-01-01', '2026-12-31', $orig))->firstWhere('type', 'group')['months']['2026-01'], 'the approved original is as it was');
        $log = array_column($svc->approvalLog($worst), 'note');
        $this->assertStringContainsString('Drivers: All income -15%', $log[0]);
        $cmp = collect($svc->compareVersions($b))->keyBy('name');
        $this->assertEquals([200000, 30000, 170000], [$cmp['Original']['income'], $cmp['Original']['expense'], $cmp['Original']['result']]);
        $this->assertEquals([170000, 31000, 139000], [$cmp['Worst case']['income'], $cmp['Worst case']['expense'], $cmp['Worst case']['result']]);
        $this->assertEquals([-30000, 1000, -31000], [$cmp['Worst case']['income_change'], $cmp['Worst case']['expense_change'], $cmp['Worst case']['result_change']]);
        $this->assertNull($cmp['Original']['result_change']);
        foreach ([[['scope' => 'sky', 'percent' => 5], 'drivers.0.scope'], [['scope' => 'income', 'percent' => -150], 'drivers.0.percent'], [['scope' => 'ledger', 'id' => 99999, 'percent' => 5], 'drivers.0.id']] as [$d, $key]) {
            try {
                $svc->createVersion($b, ['kind' => 'scenario', 'drivers' => [$d]], null);
                $this->fail("{$key} was accepted");
            } catch (ValidationException $e) {
                $this->assertArrayHasKey($key, $e->errors());
            }
        }
        $this->expectException(ValidationException::class);
        $svc->createVersion($b, ['kind' => 'revision', 'drivers' => [['scope' => 'all', 'percent' => 5]]], null);
    }

    public function test_the_transfer_and_compare_routes_need_the_right_permissions(): void
    {
        [$v, $admin, $head] = $this->transferWorld();
        $this->as(['books.view']);
        $this->postJson('/api/admin/books/planning/transfers', ['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 10])->assertForbidden();
        $b = DB::table('budget_versions')->where('id', $v)->value('budget_id');
        $this->getJson("/api/admin/books/planning/budget-sets/{$b}/compare")->assertOk()->assertJsonCount(1, 'versions');
        $this->as(['books.view', 'books.planning']);
        $id = $this->postJson('/api/admin/books/planning/transfers', ['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 10, 'note' => 'x'])->assertOk()->json('id');
        $this->postJson('/api/admin/books/planning/transfers', ['from_row_id' => $admin, 'to_row_id' => $head, 'period' => '2026-08', 'amount' => 99999])->assertStatus(422);
        $this->postJson("/api/admin/books/planning/transfers/{$id}/approve")->assertForbidden();
        $this->getJson("/api/admin/books/planning?from=2026-01-01&to=2026-12-31&version_id={$v}")->assertOk()->assertJsonPath('transfers.0.status', 'pending')->assertJsonPath('transfers_ready', true);
        $this->as(['books.view', 'books.budget.approve']);
        $this->setting('second_approver_budget', false);
        $this->postJson("/api/admin/books/planning/transfers/{$id}/approve")->assertOk()->assertJsonPath('status', 'approved');
        $this->as(['books.view', 'books.planning']);
        $again = $this->postJson('/api/admin/books/planning/transfers', ['from_row_id' => $head, 'to_row_id' => $admin, 'period' => '2026-08', 'amount' => 10])->assertOk()->json('id');
        $this->deleteJson("/api/admin/books/planning/transfers/{$again}")->assertOk();
        $this->postJson('/api/admin/books/planning/budget-sets/' . $b . '/versions', ['kind' => 'scenario', 'drivers' => [['scope' => 'all', 'percent' => -10]]])->assertOk();
    }

    // ── master budget and cash ─────────────────────────────────────────

    private function cashNow(): float
    {
        return round(array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, '2026-10-28'), app(MoneyFlowReport::class)->moneyLedgerIds())), 2);
    }

    /** A 2027 budget for January to March, approved: sales 100,000 and rent 30,000 a month, 20,000 of equipment in January, 50,000 of capital in February, 5,000 of equipment sold in March. */
    private function cashWorld(array $extra = [], bool $approve = true): int
    {
        $this->setting('second_approver_budget', false);
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => '2027 plan', 'from_month' => '2027-01', 'to_month' => '2027-03'], $this->user(1));
        $v = $svc->currentVersion($b);
        $three = fn (int $x) => ['2027-01' => $x, '2027-02' => $x, '2027-03' => $x];
        $svc->save(array_merge([
            ['type' => 'group', 'target_id' => 6, 'months' => $three(100000)],
            ['type' => 'ledger', 'target_id' => 6, 'months' => $three(30000)],
            ['type' => 'ledger', 'target_id' => 3, 'months' => ['2027-01' => 20000]],
            ['type' => 'ledger', 'target_id' => 7, 'months' => ['2027-02' => 50000]],
            ['type' => 'ledger', 'target_id' => 3, 'is_recovery' => true, 'months' => ['2027-03' => 5000]],
        ], $extra), $this->user(1), $v);
        if ($approve) {
            $svc->transition($v, 'submit', $this->user(1));
            $svc->transition($v, 'approve', $this->user(1));
        }

        return $b;
    }

    public function test_the_master_budget_adds_up_the_plan_and_the_cash_budget_follows_the_cash(): void
    {
        $this->cashWorld();
        $r = app(MasterBudgetService::class)->build('2027-01', '2027-03');
        $open = $this->cashNow();
        $this->assertEquals([300000, 90000, 210000], [$r['totals']['income'], $r['totals']['expense'], $r['totals']['result']]);
        $this->assertEquals($open, $r['cash']['opening'], 'a budget that starts in the future begins from today\'s cash');
        $this->assertStringContainsString('future', $r['cash']['opening_note']);
        $m = collect($r['months'])->keyBy('month');
        $this->assertEquals([50000, 120000, 75000], [$m['2027-01']['net_cash'], $m['2027-02']['net_cash'], $m['2027-03']['net_cash']], 'income less rent, less equipment bought, plus capital raised, plus equipment sold');
        $this->assertEquals([20000, 0, -5000], [$m['2027-01']['assets'], $m['2027-02']['assets'], $m['2027-03']['assets']], 'a reduction on an asset line brings cash in');
        $this->assertEquals($open + 245000, $r['cash']['closing']);
        $this->assertTrue($r['cash']['can_finance']);
        $this->assertSame(['2027-01'], [$r['cash']['lowest']['month']]);
        $this->assertSame('Sales Accounts', $r['income_lines'][0]['name']);
        $this->assertEquals(300000, $r['income_lines'][0]['total']);
        $this->assertSame(['2027 plan'], array_column($r['budgets'], 'name'));
        $this->assertFalse($r['not_approved']);
    }

    public function test_customers_who_pay_late_and_only_in_part_leave_the_business_short_of_cash(): void
    {
        $this->cashWorld();
        $this->setting('forecast_collection_delay_days', 30);
        $this->setting('forecast_collect_percent', 50);
        $open = $this->cashNow();
        $r = app(MasterBudgetService::class)->build('2027-01', '2027-03');
        $m = collect($r['months'])->keyBy('month');
        $this->assertEquals([0, 50000, 50000], [$m['2027-01']['receipts'], $m['2027-02']['receipts'], $m['2027-03']['receipts']], 'one month late, half of it');
        $this->assertEquals(50000, $r['cash']['after_budget']['receipts'], "March's sales arrive after the budget ends");
        $this->assertEquals($open - 50000, $m['2027-01']['closing'], 'January pays rent and equipment with nothing yet coming in');
        $svc = app(BudgetService::class);
        $v = $svc->currentVersion((int) DB::table('budgets')->value('id'));
        $rev = $svc->createVersion((int) DB::table('budgets')->value('id'), ['kind' => 'revision'], $this->user(1));
        $svc->save([['type' => 'ledger', 'target_id' => 3, 'months' => ['2027-01' => $open + 1000]]], $this->user(1), $rev);
        $svc->transition($rev, 'submit', $this->user(1));
        $svc->transition($rev, 'approve', $this->user(1));
        $r = app(MasterBudgetService::class)->build('2027-01', '2027-03');
        $this->assertFalse($r['cash']['can_finance'], 'equipment costing more than all the cash');
        $this->assertSame('2027-01', $r['cash']['short_months'][0]);
        $this->assertLessThan(0, $r['cash']['lowest']['balance']);
        $this->assertNotSame($v, $svc->currentVersion((int) DB::table('budgets')->value('id')), 'the newest approved version is the one planned from');
    }

    public function test_an_expense_that_is_not_cash_and_a_budget_that_is_not_approved_are_handled(): void
    {
        $this->setting('budget_noncash_groups', [7]);
        $this->cashWorld([['type' => 'ledger', 'target_id' => 5, 'months' => ['2027-01' => 10000]]], false);
        $r = app(MasterBudgetService::class)->build('2027-01', '2027-03');
        $m = collect($r['months'])->keyBy('month');
        $this->assertEquals(40000, $m['2027-01']['expense'], 'rent and the 10,000 (depreciation-like) both count in the result');
        $this->assertEquals(30000, $m['2027-01']['payments'], 'but only the rent uses cash');
        $this->assertTrue($r['not_approved'], 'a draft is planned from, and flagged');
        $this->assertStringContainsString('Left out', collect($r['assumptions'])->firstWhere('label', 'Not cash')['value']);
    }

    public function test_every_budget_that_covers_the_months_is_in_the_master_budget_and_one_can_be_chosen(): void
    {
        $b1 = $this->cashWorld();
        $svc = app(BudgetService::class);
        $b2 = $svc->createBudget(['name' => 'Capital', 'budget_type' => 'capex', 'from_month' => '2027-02', 'to_month' => '2027-06'], null);
        $svc->save([['type' => 'ledger', 'target_id' => 3, 'months' => ['2027-02' => 8000]]], null, $svc->currentVersion($b2));
        $all = app(MasterBudgetService::class)->build('2027-01', '2027-03');
        $this->assertEqualsCanonicalizing(['2027 plan', 'Capital'], array_column($all['budgets'], 'name'));
        $this->assertEquals(8000, collect($all['months'])->firstWhere('month', '2027-02')['assets'], 'February: only the capital budget buys equipment');
        $only = app(MasterBudgetService::class)->build('2027-01', '2027-03', $b1);
        $this->assertSame(['2027 plan'], array_column($only['budgets'], 'name'));
        $this->assertEquals(0, collect($only['months'])->firstWhere('month', '2027-02')['assets']);
    }

    public function test_the_report_runs_on_the_engine_exports_and_asks_for_a_budget_when_there_is_none(): void
    {
        $rep = new MasterBudgetReport();
        $r = $rep->run(Scope::dates('2027-01-01', '2027-03-31'), []);
        $this->assertFalse($r['ready']);
        $this->assertStringContainsString('Budgeting', $r['message']);
        $this->cashWorld();
        $r = $rep->run(Scope::dates('2027-01-01', '2027-03-31'), ['budget' => '0']);
        $this->assertTrue($r['ready']);
        $t = $rep->table($r, Scope::dates('2027-01-01', '2027-03-31'));
        $this->assertCount(3, $t['rows']);
        $this->assertSame('Whole period', $t['totals']['month']);
        $this->assertFalse($rep->run(Scope::dates('2027-01-01', '2031-12-31'), [])['ready'], 'three years at most');
        $this->assertArrayHasKey((string) DB::table('budgets')->value('id'), array_column($rep->options(), 'choices', 'key')['budget']);
        $this->as(['books.view']);
        $this->getJson('/api/admin/reports')->assertOk()->assertJsonFragment(['key' => 'master-budget']);
    }

    // ── the report ─────────────────────────────────────────────────────

    private function reportWorld(): int
    {
        $svc = app(BudgetService::class);
        $b = $svc->createBudget(['name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $v = $svc->currentVersion($b);
        $svc->save([
            ['type' => 'group', 'target_id' => 6, 'months' => ['2026-01' => 80000]],                                     // Sales: 100,000 came in
            ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 11, 'months' => ['2026-07' => 5000]],           // Rent on Admin: 4,000 spent
            ['type' => 'ledger', 'target_id' => 6, 'cost_centre_id' => 10, 'months' => ['2026-07' => 6000]],           // Rent on Head office and under it: 7,000 spent
            ['type' => 'group', 'target_id' => 8, 'months' => ['2026-06' => 20000]],                                    // every indirect expense: rent 12,000
        ], null, $v);

        return $v;
    }

    public function test_the_report_sets_each_line_against_the_books_with_the_gap_read_as_good_or_bad_news(): void
    {
        $v = $this->reportWorld();
        $r = (new BudgetAgainstActualReport())->run(Scope::dates('2026-01-01', '2026-12-31'), ['version' => (string) $v, 'by' => 'account']);
        $this->assertTrue($r['ready']);
        $by = collect($r['groups'])->keyBy(fn ($g) => $g['section'] . ':' . $g['name']);
        $sales = $by['income:Sales Accounts'];
        $this->assertEquals([80000, 295000], [$sales['budget'], $sales['actual']], 'a full year of sales: January 100,000, March 130,000 and April 65,000 restated');
        $this->assertEquals(215000, $sales['variance'], 'earning more than planned is good news');
        $this->assertEquals(268.8, $sales['variance_pct']);
        $this->assertEquals(368.8, $sales['used_pct']);
        $rent = $by['expense:Rent'];
        $this->assertEquals([11000, 11000], [$rent['budget'], $rent['actual']], 'two cost centres, one account');
        $this->assertCount(2, $rent['children']);
        $this->assertEqualsCanonicalizing(['Admin', 'Head office'], array_column($rent['children'], 'name'));
        $group = $by['expense:Indirect Expenses'];
        $this->assertEquals(700, $group['variance'], 'spending 19,300 against 20,000 is good news');
        $this->assertSame('Rent', $group['children'][0]['ledgers'][0]['name'], 'a group is followed down to its ledgers, the biggest first');
        $this->assertEquals(19000, $group['children'][0]['ledgers'][0]['actual'], 'rent 12,000 and 7,000');
        $this->assertSame(['income', 'expense'], array_values(array_unique(array_column($r['groups'], 'section'))), 'income before expenses');
        $this->assertEquals(295000 - 30300, $r['totals']['result']['actual']);
        $this->assertEquals(80000 - 31000, $r['totals']['result']['budget']);
        $this->assertFalse($r['pending']);
    }

    public function test_the_report_can_be_grouped_by_a_dimension_and_says_not_set_for_rows_without_one(): void
    {
        $v = $this->reportWorld();
        $r = (new BudgetAgainstActualReport())->run(Scope::dates('2026-01-01', '2026-12-31'), ['version' => (string) $v, 'by' => 'cost_centre']);
        $by = collect($r['groups'])->keyBy(fn ($g) => $g['section'] . ':' . $g['name']);
        $this->assertEquals([5000, 4000], [$by['expense:Admin']['budget'], $by['expense:Admin']['actual']]);
        $this->assertEquals([6000, 7000], [$by['expense:Head office']['budget'], $by['expense:Head office']['actual']]);
        $this->assertEquals(20000, $by['expense:Not set']['budget'], 'the indirect-expenses row has no cost centre');
        $this->assertSame('Cost centre', $r['by_label']);
        $table = (new BudgetAgainstActualReport())->table($r, Scope::dates('2026-01-01', '2026-12-31'));
        $this->assertSame(['name', 'budget', 'actual', 'variance', 'variance_pct', 'used_pct', 'remaining'], array_keys($table['columns']));
        $this->assertSame('Planned result (income less expenses)', $table['totals']['name']);
    }

    public function test_the_report_asks_for_a_budget_when_there_is_none_and_marks_initiatives_as_waiting_for_actuals(): void
    {
        $rep = new BudgetAgainstActualReport();
        $r = $rep->run(Scope::dates('2026-01-01', '2026-12-31'), []);
        $this->assertFalse($r['ready']);
        $this->assertStringContainsString('Budgeting', $r['message']);
        $svc = app(BudgetService::class);
        $ini = $svc->saveInitiative(['name' => 'Cash sales'], null);
        $svc->save([['type' => 'ledger', 'target_id' => 6, 'initiative_id' => $ini, 'months' => ['2026-07' => 1000]]], null);
        $r = $rep->run(Scope::dates('2026-01-01', '2026-12-31'), ['by' => 'initiative']);
        $this->assertTrue($r['pending']);
        $this->assertSame('Cash sales', $r['groups'][0]['name']);
        $this->assertEquals(0, $r['groups'][0]['actual']);
        $choices = array_column($rep->options(), 'choices', 'key');
        $this->assertArrayHasKey('0', $choices['version']);
        $this->assertCount(2, $choices['version']);
    }

    public function test_the_report_is_in_the_catalogue_for_anyone_who_can_see_the_books(): void
    {
        $this->as(['books.view']);
        $this->getJson('/api/admin/reports')->assertOk()->assertJsonFragment(['key' => 'budget-against-actual']);
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
