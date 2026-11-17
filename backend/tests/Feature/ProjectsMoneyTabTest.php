<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 4.2 (docs/PROJECTS_STAGE4_SPEC.md): the Money tab, every figure read from posted Books entries on the project's cost centres. */
class ProjectsMoneyTabTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $cc;
    private int $phaseCc;
    private ?array $open = ['owed' => 0.0, 'days_late' => 0];
    private int $next = 100;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        // what Books' receivables ageing says is open is stood in for: this world has none of its tables
        $open = &$this->open;
        $this->app->instance(\App\Services\Projects\ProjectReceivables::class, new class($open) extends \App\Services\Projects\ProjectReceivables {
            public function __construct(private ?array &$open) {}

            public function open(array $voucherIds): ?array
            {
                return $this->open;
            }
        });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable();
            $t->decimal('total_amount', 14, 2)->default(0); $t->decimal('base_total', 14, 2)->nullable(); $t->string('party_name')->nullable(); $t->string('reference_no')->nullable(); $t->date('date')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->decimal('base_amount', 14, 2)->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->string('name'); $t->string('nature'); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales'], ['id' => 2, 'name' => 'Payment', 'base_type' => 'payment'], ['id' => 3, 'name' => 'Credit Note', 'base_type' => 'credit_note'],
            ['id' => 4, 'name' => 'Quotation', 'base_type' => 'quotation'], ['id' => 5, 'name' => 'Sales Order', 'base_type' => 'sales_order']]);
        DB::table('ledger_groups')->insert([['id' => 1, 'name' => 'Sales', 'nature' => 'income'], ['id' => 2, 'name' => 'Direct Expenses', 'nature' => 'expense'], ['id' => 3, 'name' => 'Debtors', 'nature' => 'asset']]);
        DB::table('ledgers')->insert([['id' => 1, 'name' => 'Legal fees', 'group_id' => 1], ['id' => 2, 'name' => 'Filing fees', 'group_id' => 2], ['id' => 3, 'name' => 'Imara Sacco', 'group_id' => 3]]);

        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.money.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Design', 'own_cost_centre' => true])->assertCreated();
        $this->phaseCc = (int) DB::table('project_phases')->where('name', 'Design')->value('cost_centre_id');
    }

    /** A posted voucher with its entries. @param array<int, array{0: int, 1: string, 2: float, 3?: ?int}> $entries ledger, side, amount, line cost centre */
    private function voucher(int $type, ?int $cc, float $total, array $entries = [], string $status = 'posted'): int
    {
        $id = $this->next++;
        DB::table('vouchers')->insert(['id' => $id, 'voucher_type_id' => $type, 'voucher_number' => "V-{$id}", 'status' => $status, 'cost_centre_id' => $cc, 'total_amount' => $total, 'base_total' => $total]);
        foreach ($entries as $e) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $e[0], 'side' => $e[1], 'amount' => $e[2], 'base_amount' => $e[2], 'cost_centre_id' => $e[3] ?? null]);
        }

        return $id;
    }

    private function money(): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/money")->assertOk()->json('money');
    }

    public function test_billed_paid_owed_income_spent_and_profit_come_from_posted_entries_on_its_cost_centres(): void
    {
        $this->voucher(1, $this->cc, 600000, [[3, 'D', 600000], [1, 'C', 600000]]);                     // an invoice on the project
        $this->voucher(1, $this->phaseCc, 300000, [[3, 'D', 300000], [1, 'C', 300000]]);                // and one on a phase: it counts too
        $this->voucher(3, $this->cc, 50000, [[1, 'D', 50000], [3, 'C', 50000]]);                       // a credit note lowers what was billed
        $this->voucher(2, $this->phaseCc, 142000, [[2, 'D', 142000], [3, 'C', 142000]]);                // filing fees on the phase
        $this->voucher(2, 1, 99999, [[2, 'D', 99999], [3, 'C', 99999]]);                               // on another cost centre: not counted
        $this->voucher(1, $this->cc, 70000, [[3, 'D', 70000], [1, 'C', 70000]], 'cancelled');          // cancelled: not counted
        $this->voucher(2, 1, 8000, [[2, 'D', 8000, $this->cc], [3, 'C', 8000]]);                       // a line posted to the project on a voucher that is not: the line counts
        $this->open = ['owed' => 150000.0, 'days_late' => 30];

        $m = $this->money();
        $this->assertSame([850000, 150000, 30, 700000, 850000, 150000, 700000], [$m['billed'], $m['owed'], $m['days_late'], $m['paid'], $m['income'], $m['spent'], $m['profit']]);
        $this->assertSame(['Design'], array_column($m['phases'], 'name'));
        $this->assertSame([142000, 300000], [$m['phases'][0]['spent'], $m['phases'][0]['billed']]);
        $this->assertNull($m['budget'], 'no budgets in these books: shown as none, never as zero');
    }

    public function test_the_agreed_value_is_the_linked_sales_orders_or_else_the_quotations(): void
    {
        $this->assertNull($this->money()['agreed']);
        $q = $this->voucher(4, null, 1500000);
        DB::table('project_links')->insert(['project_id' => $this->project, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $q, 'created_at' => now()]);
        $this->assertSame(['amount' => 1500000, 'from' => 'quotations', 'count' => 1], $this->money()['agreed']);
        $so = $this->voucher(5, null, 1450000);
        DB::table('project_links')->insert(['project_id' => $this->project, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $so, 'created_at' => now()]);
        $this->assertSame(['amount' => 1450000, 'from' => 'sales orders', 'count' => 1], $this->money()['agreed'], 'a sales order made from the quotation is not counted twice');
    }

    public function test_the_budget_is_read_from_each_active_budgets_current_version(): void
    {
        Schema::create('budgets', function ($t) { $t->id(); $t->string('name'); $t->string('budget_type')->default('operating'); $t->string('from_month'); $t->string('to_month'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('budget_versions', function ($t) { $t->id(); $t->unsignedBigInteger('budget_id'); $t->string('name'); $t->string('kind')->default('original'); $t->string('status')->default('draft'); $t->timestamps(); });
        Schema::create('budget_rows', function ($t) { $t->id(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('target_type'); $t->unsignedBigInteger('target_id'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_recovery')->default(false); $t->timestamps(); });
        Schema::create('budget_lines', function ($t) { $t->id(); $t->unsignedBigInteger('row_id')->nullable(); $t->string('period'); $t->decimal('amount', 18, 2); $t->string('target_type')->nullable(); $t->unsignedBigInteger('target_id')->nullable(); $t->timestamps(); });
        if (! \App\Services\Books\BudgetService::ready()) {
            $this->markTestSkipped('Books budgets need more tables in this world than the budget reader uses.');
        }
        DB::table('budgets')->insert(['id' => 1, 'name' => '2026', 'from_month' => '2026-01', 'to_month' => '2026-12']);
        DB::table('budget_versions')->insert([['id' => 1, 'budget_id' => 1, 'name' => 'Original', 'status' => 'approved'], ['id' => 2, 'budget_id' => 1, 'name' => 'Revised 1', 'status' => 'draft']]);
        DB::table('budget_rows')->insert([['id' => 1, 'version_id' => 1, 'target_type' => 'ledger', 'target_id' => 2, 'cost_centre_id' => $this->phaseCc], ['id' => 2, 'version_id' => 2, 'target_type' => 'ledger', 'target_id' => 2, 'cost_centre_id' => $this->phaseCc],
            ['id' => 3, 'version_id' => 1, 'target_type' => 'ledger', 'target_id' => 1, 'cost_centre_id' => $this->cc]]);
        DB::table('budget_lines')->insert([['row_id' => 1, 'period' => '2026-11', 'amount' => 100000], ['row_id' => 1, 'period' => '2026-12', 'amount' => 50000], ['row_id' => 2, 'period' => '2026-11', 'amount' => 999999], ['row_id' => 3, 'period' => '2026-11', 'amount' => 777]]);
        $m = $this->money();
        $this->assertSame([150000, 150000], [$m['budget'], $m['phases'][0]['budget']], 'the approved version, not the draft being worked on; and expense rows only');
    }

    public function test_the_money_tab_needs_the_permission_and_a_project_role_that_sees_money(): void
    {
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk()->assertJsonPath('project.can.money', true);
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.money.view']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        Sanctum::actingAs($njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/money")->assertForbidden();   // a Member's role does not see money
        Sanctum::actingAs($this->staff('Clerk', ['projects.use', 'projects.money.view']), ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/money")->assertNotFound();   // the permission, but not on the work: it does not exist for them
        Sanctum::actingAs($this->staff('Finance', ['projects.use', 'projects.view_all', 'projects.money.view']), ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/money")->assertOk();   // someone who sees all work, with the permission, reads it
    }
}
