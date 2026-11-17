<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 4.3 (docs/PROJECTS_STAGE4_SPEC.md): ledgers made in Books from a project, through Books' own checks; Books owns them. */
class ProjectsLedgersTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature'); $t->string('behaviour')->nullable(); $t->boolean('is_active')->default(true); $t->boolean('is_system')->default(false); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name')->unique(); $t->string('code')->nullable(); $t->decimal('opening_balance', 14, 2)->default(0); $t->string('opening_side', 1)->default('D');
            $t->boolean('is_active')->default(true); $t->text('notes')->nullable(); $t->string('bank_name')->nullable(); $t->string('account_number')->nullable(); $t->string('account_name')->nullable(); $t->string('branch')->nullable();
            $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('supplier_id')->nullable(); $t->unsignedBigInteger('statement_id')->nullable(); $t->timestamps(); });
        DB::table('ledger_groups')->insert([
            ['id' => 1, 'parent_id' => null, 'name' => 'Direct Expenses', 'nature' => 'expense', 'behaviour' => null], ['id' => 2, 'parent_id' => null, 'name' => 'Current Liabilities', 'nature' => 'liability', 'behaviour' => null],
            ['id' => 3, 'parent_id' => null, 'name' => 'Bank Accounts', 'nature' => 'asset', 'behaviour' => 'bank'], ['id' => 4, 'parent_id' => 3, 'name' => 'Client Bank Accounts', 'nature' => 'asset', 'behaviour' => null],
            ['id' => 5, 'parent_id' => 2, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'behaviour' => null], ['id' => 6, 'parent_id' => null, 'name' => 'Sundry Debtors', 'nature' => 'asset', 'behaviour' => null],
            ['id' => 7, 'parent_id' => null, 'name' => 'Sales Accounts', 'nature' => 'income', 'behaviour' => 'sales'], ['id' => 8, 'parent_id' => null, 'name' => 'Delivery', 'nature' => 'income', 'behaviour' => 'delivery']]);
        DB::table('ledgers')->insert(['id' => 1, 'group_id' => 1, 'name' => 'Filing fees']);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.money.view', 'projects.ledgers.create', 'projects.ledgers.bank']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Mwangi Estate', 'customer_id' => 1])->json('project.id');
    }

    private function make(array $d): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/admin/projects/{$this->project}/ledgers", $d);
    }

    public function test_only_sensible_groups_are_offered_for_an_account_and_for_a_bank_account(): void
    {
        $g = $this->getJson("/api/admin/projects/{$this->project}/ledgers")->assertOk()->json('groups');
        $this->assertSame(['Current Liabilities', 'Direct Expenses', 'Sales Accounts'], array_column($g['general'], 'name'), 'no tax, debtors, delivery or bank groups for an ordinary account');
        $this->assertSame(['Bank Accounts', 'Client Bank Accounts'], array_column($g['bank'], 'name'));
    }

    public function test_a_ledger_is_made_in_books_with_no_opening_balance_and_listed_on_the_project(): void
    {
        $r = $this->make(['name' => 'Court fees, Mwangi Estate', 'group_id' => 1, 'purpose' => 'general', 'note' => 'Disbursements', 'opening_balance' => 50000])->assertCreated()->json();
        $l = DB::table('ledgers')->where('name', 'Court fees, Mwangi Estate')->first();
        $this->assertSame([1, 0.0, 'Made from P-0001 (Mwangi Estate) in Projects.'], [(int) $l->group_id, (float) $l->opening_balance, $l->notes], 'money only enters the books as a voucher');
        $this->assertSame([['Court fees, Mwangi Estate', 'Direct Expenses', 'An account for this work', 'Kamau']], array_map(fn ($x) => [$x['name'], $x['group'], $x['purpose_name'], $x['made_by']], $r['ledgers']));
        $this->assertSame('ledger.made', DB::table('project_log')->orderByDesc('id')->value('action'));

        $this->make(['name' => 'filing FEES', 'group_id' => 1])->assertStatus(422)->assertJson(['message' => 'The books already have a ledger by that name. Choose another, or link to that one.']);
        $this->make(['name' => 'Tax thing', 'group_id' => 5])->assertStatus(422);
        $this->make(['name' => 'Debtor thing', 'group_id' => 6])->assertStatus(422);
        $this->make(['name' => '', 'group_id' => 1])->assertStatus(422);
    }

    public function test_a_bank_ledger_goes_under_the_bank_groups_and_needs_its_own_permission(): void
    {
        $this->make(['name' => 'Client Account, KCB', 'group_id' => 4, 'purpose' => 'bank', 'bank_name' => 'KCB', 'account_number' => '1234567890', 'branch' => 'Moi Avenue'])->assertCreated();
        $l = DB::table('ledgers')->where('name', 'Client Account, KCB')->first();
        $this->assertSame([4, 'KCB', '1234567890'], [(int) $l->group_id, $l->bank_name, $l->account_number]);
        $this->make(['name' => 'Wrong place', 'group_id' => 1, 'purpose' => 'bank'])->assertStatus(422)->assertJson(['message' => 'Choose a bank group from the books.']);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.view', 'projects.ledgers.create']);
        $this->make(['name' => 'Another bank', 'group_id' => 4, 'purpose' => 'bank'])->assertForbidden()->assertJson(['message' => 'Making a bank ledger needs its own permission.']);
        $this->make(['name' => 'Fine', 'group_id' => 1, 'purpose' => 'general'])->assertCreated();
        $this->assertSame(1, DB::table('project_log')->where('result', 'refused')->where('action', 'ledger.make')->count());
    }

    public function test_making_a_ledger_needs_the_permission_and_a_project_role_that_sees_money(): void
    {
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.money.view', 'projects.ledgers.create']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        Sanctum::actingAs($njeri, ['*']);
        $this->make(['name' => 'Hers', 'group_id' => 1])->assertForbidden();   // a Member's role does not see money
        Sanctum::actingAs($this->staff('Clerk', ['projects.use', 'projects.money.view']), ['*']);
        $this->make(['name' => 'His', 'group_id' => 1])->assertForbidden();
        $this->assertSame(1, DB::table('ledgers')->count());
    }
}
