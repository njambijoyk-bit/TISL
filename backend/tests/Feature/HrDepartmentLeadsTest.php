<?php

namespace Tests\Feature;

use App\Models\Department;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1b (docs/HR_STAGE1B_SPEC.md), build D.1: department leads with sensitivity, never orphaned, branches that keep their departments. */
class HrDepartmentLeadsTest extends TestCase
{
    use Concerns\CreatesHrWorld;

    private int $westlands;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createHrWorld();
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); $t->integer('sort_order')->default(0); $t->timestamps(); });
        // scripts 100 and 101 as the owner's database has them (written without ENGINE, so built here)
        Schema::create('cost_centres', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable(); $t->string('name'); $t->string('code')->nullable()->unique();
            $t->string('type')->default('other'); $t->string('purpose')->nullable(); $t->string('description')->nullable(); $t->boolean('is_system')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('cost_centre_settings', function ($t) { $t->string('key')->primary(); $t->string('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('departments', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->string('name'); $t->string('code')->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('manager_employee_id')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('standard_departments', function ($t) { $t->id(); $t->string('name'); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('employee_cost_centres', function ($t) { $t->id(); $t->unsignedBigInteger('employee_id'); $t->unsignedBigInteger('cost_centre_id'); $t->string('kind')->default('home'); $t->decimal('share_percent', 5, 2)->default(100); $t->date('valid_from')->nullable(); $t->date('valid_to')->nullable(); $t->timestamps(); });
        $this->runSqlScripts('271_hr_foundation.sql', '272_departments_link.sql');
        $this->westlands = DB::table('locations')->insertGetId(['name' => 'Westlands', 'code' => 'WL', 'is_active' => 1]);
    }

    private function dept(string $name, \App\Models\User $head): int
    {
        Sanctum::actingAs($this->person('HR' . $name, ['hr.manage']), ['*']);

        return (int) $this->postJson('/api/admin/departments', ['location_id' => $this->westlands, 'name' => $name, 'manager_employee_id' => $this->employeeOf($head)])->assertCreated()->json('data.id');
    }

    public function test_a_department_is_made_with_a_head_who_can_see_pay_and_identity_details(): void
    {
        Sanctum::actingAs($this->person('Grace', ['hr.manage']), ['*']);
        $this->postJson('/api/admin/departments', ['location_id' => $this->westlands, 'name' => 'Sales'])->assertStatus(422)->assertJsonPath('errors.manager_employee_id.0', 'Choose the head: a department is never without a lead who can see pay and identity details.');
        $plain = $this->person('Kamau');
        $this->postJson('/api/admin/departments', ['location_id' => $this->westlands, 'name' => 'Sales', 'manager_employee_id' => $this->employeeOf($plain)])->assertStatus(422)
            ->assertJsonPath('errors.sensitivity.0', 'Kamau does not hold the permission for pay, bank and identity details, so they cannot be given full sensitivity.');
        $this->assertSame(0, DB::table('departments')->count(), 'nothing is made without its head');

        $head = $this->person('Wanjiru', ['hr.sensitive']);
        $id = $this->dept('Sales', $head);
        $this->assertSame([['head', 'full']], DB::table('department_leads')->where('department_id', $id)->get(['role', 'sensitivity'])->map(fn ($r) => [$r->role, $r->sensitivity])->all());
        $this->assertNotNull(DB::table('departments')->where('id', $id)->value('cost_centre_id'), 'and with its own cost centre');
    }

    public function test_leads_are_one_head_and_assistants_never_above_the_head_and_the_department_is_never_orphaned(): void
    {
        $head = $this->person('Wanjiru', ['hr.sensitive']);
        $id = $this->dept('Construction', $head);
        $otieno = $this->person('Otieno');
        $peter = $this->person('Peter', ['hr.sensitive']);
        Sanctum::actingAs($this->person('Grace', ['hr.manage']), ['*']);
        $lead = fn (int $emp, string $role, string $level) => $this->postJson("/api/admin/departments/{$id}/leads", ['employee_id' => $emp, 'role' => $role, 'sensitivity' => $level]);

        $lead($this->employeeOf($otieno), 'assistant', 'personal')->assertOk();
        $lead($this->employeeOf($otieno), 'assistant', 'full')->assertStatus(422);   // Otieno lacks hr.sensitive
        $this->deleteJson("/api/admin/departments/{$id}/leads/{$this->employeeOf($head)}")->assertStatus(422)->assertJsonPath('errors.lead.0', 'Appoint another head first; a department always has one.');

        // Peter becomes head with work: Wanjiru steps down to assistant at work too, Otieno comes down to work, and nobody is left with full: refused
        $lead($this->employeeOf($peter), 'head', 'work')->assertStatus(422)->assertJsonPath('errors.lead.0', 'That would leave Westlands › Construction without a lead who can see pay and identity details. Appoint another first.');
        // Peter as head with full: Wanjiru becomes an assistant keeping full
        $lead($this->employeeOf($peter), 'head', 'full')->assertOk();
        $this->assertSame(['Otieno' => 'assistant/personal', 'Peter' => 'head/full', 'Wanjiru' => 'assistant/full'], collect($this->getJson('/api/admin/departments')->json('data.0.leads'))->mapWithKeys(fn ($l) => [$l['name'] => "{$l['role']}/{$l['sensitivity']}"])->sortKeys()->all());
        $this->deleteJson("/api/admin/departments/{$id}/leads/{$this->employeeOf($head)}")->assertOk();   // Peter still has full

        // the last full lead cannot be ended, suspended, deleted, nor lose the permission
        Sanctum::actingAs($this->person('Owner', ['hr.manage', 'hr.view', 'hr.purge']), ['*']);
        $this->putJson('/api/admin/employees/' . $this->employeeOf($peter), ['status' => 'terminated'])->assertStatus(422);
        $this->postJson('/api/admin/employees/' . $this->employeeOf($peter) . '/update-status', ['status' => 'suspended'])->assertStatus(422);
        $this->deleteJson('/api/admin/employees/' . $this->employeeOf($peter))->assertStatus(422);
        $this->grant($peter, ['admin.access']);   // hr.sensitive taken away some other way: the department now shows it needs a full lead
        app(\App\Services\Hr\DepartmentLeads::class)->forget();
        $this->assertTrue($this->getJson('/api/admin/departments')->json('data.0.needs_full_lead'));
    }

    public function test_a_lead_sees_their_departments_people_up_to_their_sensitivity_and_nothing_else(): void
    {
        $head = $this->person('Wanjiru', ['hr.sensitive']);
        $id = $this->dept('Construction', $head);
        $assistant = $this->person('Otieno', ['hr.sensitive']);   // holds hr.sensitive, but leads at work: sees work only
        Sanctum::actingAs($this->person('Grace', ['hr.manage']), ['*']);
        $this->postJson("/api/admin/departments/{$id}/leads", ['employee_id' => $this->employeeOf($assistant), 'role' => 'assistant', 'sensitivity' => 'work'])->assertOk();
        $amina = $this->person('Amina', [], ['department_id' => $id, 'gender' => 'female', 'base_salary' => 90000]);
        $outside = $this->person('Njeri');
        \App\Models\Employee::find($this->employeeOf($amina))->update(['bank_account_number' => '0123456789']);

        Sanctum::actingAs($assistant, ['*']);
        $this->assertSame(['Amina'], collect($this->getJson('/api/admin/employees')->assertOk()->json('data'))->pluck('user.name')->reject(fn ($n) => $n === 'Otieno')->values()->all());
        $e = $this->getJson('/api/admin/employees/' . $this->employeeOf($amina))->assertOk()->json('employee');
        $this->assertSame(['work'], $e['tiers']);
        $this->assertArrayNotHasKey('gender', $e);
        $this->putJson('/api/admin/employees/' . $this->employeeOf($amina), ['job_title' => 'Foreman'])->assertForbidden();   // an assistant at work only looks
        $this->getJson('/api/admin/employees/' . $this->employeeOf($outside))->assertForbidden();
        $this->assertSame([['department_id' => $id, 'role' => 'assistant', 'sensitivity' => 'work']], app(\App\Services\Access\Authorizer::class)->summary($assistant)['leads'] ?? null);

        Sanctum::actingAs($head, ['*']);
        $e = $this->getJson('/api/admin/employees/' . $this->employeeOf($amina))->assertOk()->json('employee');
        $this->assertSame(['work', 'personal', 'sensitive'], $e['tiers']);
        $this->assertSame('••••6789', $e['bank_account_number']);
        $this->putJson('/api/admin/employees/' . $this->employeeOf($amina), ['job_title' => 'Foreman'])->assertOk();
        $this->putJson('/api/admin/employees/' . $this->employeeOf($amina), ['base_salary' => 1])->assertForbidden();   // pay still needs hr.manage with hr.sensitive
    }

    public function test_a_branch_keeps_its_departments(): void
    {
        $this->dept('Sales', $this->person('Wanjiru', ['hr.sensitive']));
        DB::table('locations')->insert(['name' => 'Mombasa', 'code' => 'MB', 'is_active' => 1, 'is_default' => 1]);
        $ctrl = app(\App\Http\Controllers\Admin\LocationController::class);
        $m = new \ReflectionMethod($ctrl, 'keepsDepartments');
        $this->assertSame('Westlands still has departments: Sales. Move their people and switch the departments off first.', $m->invoke($ctrl, \App\Models\Location::find($this->westlands)));
        Department::query()->update(['is_active' => false]);
        $this->assertNull($m->invoke($ctrl, \App\Models\Location::find($this->westlands)));
    }

    public function test_the_department_page_shows_its_leads_people_and_spend_to_those_who_may_see_them(): void
    {
        $head = $this->person('Wanjiru', ['hr.sensitive']);
        $id = $this->dept('Construction', $head);
        $other = $this->dept('Design', $this->person('Peter', ['hr.sensitive']));
        $amina = $this->person('Amina', [], ['department_id' => $id, 'job_title' => 'Foreman']);
        $kamau = $this->person('Kamau', [], ['department_id' => $other]);
        DB::table('employees')->where('id', $this->employeeOf($head))->update(['department_id' => $id]);

        // the books: one expense this month on a project cost centre under the department, one last year
        $cc = (int) DB::table('departments')->where('id', $id)->value('cost_centre_id');
        $project = DB::table('cost_centres')->insertGetId(['name' => 'BW-0509', 'code' => 'BW-0509', 'parent_id' => $cc]);
        Schema::create('ledger_groups', fn ($t) => [$t->id(), $t->string('nature')]);
        Schema::create('ledgers', fn ($t) => [$t->id(), $t->unsignedBigInteger('group_id')]);
        Schema::create('vouchers', fn ($t) => [$t->id(), $t->string('status'), $t->date('date'), $t->unsignedBigInteger('cost_centre_id')->nullable()]);
        Schema::create('voucher_entries', fn ($t) => [$t->id(), $t->unsignedBigInteger('voucher_id'), $t->unsignedBigInteger('ledger_id'), $t->string('side'), $t->decimal('amount', 14, 2), $t->unsignedBigInteger('cost_centre_id')->nullable()]);
        DB::table('ledger_groups')->insert(['id' => 1, 'nature' => 'expense']);
        DB::table('ledgers')->insert(['id' => 1, 'group_id' => 1]);
        DB::table('vouchers')->insert([['id' => 1, 'status' => 'posted', 'date' => now()->toDateString(), 'cost_centre_id' => $project], ['id' => 2, 'status' => 'posted', 'date' => now()->subYear()->toDateString(), 'cost_centre_id' => $cc]]);
        DB::table('voucher_entries')->insert([['voucher_id' => 1, 'ledger_id' => 1, 'side' => 'D', 'amount' => 12500, 'cost_centre_id' => null], ['voucher_id' => 2, 'ledger_id' => 1, 'side' => 'D', 'amount' => 999, 'cost_centre_id' => null]]);

        Sanctum::actingAs($head, ['*']);
        $page = $this->getJson("/api/admin/departments/{$id}/page")->assertOk()->json();
        $this->assertSame(['Construction', 'Westlands'], [$page['department']['name'], $page['department']['branch']]);
        $this->assertStringEndsWith('Construction', $page['department']['cost_centre']['path']);
        $this->assertSame(['Amina', 'Wanjiru'], array_column($page['people'], 'name'));
        $this->assertSame('head', collect($page['people'])->firstWhere('name', 'Wanjiru')['lead']);
        $this->assertNull($page['spend'], 'no figures without books.view (choice 4)');
        $this->assertTrue($page['can']['move']);

        $this->grant($head, ['admin.access', 'hr.sensitive', 'books.view']);
        $spend = $this->getJson("/api/admin/departments/{$id}/page")->json('spend');
        $this->assertEquals([12500, 12500], [$spend['month']['spent'], $spend['year']['spent']], 'its projects\' costs roll up into the department');

        Sanctum::actingAs($this->person('Njeri'), ['*']);
        $this->getJson("/api/admin/departments/{$id}/page")->assertForbidden();
        Sanctum::actingAs($this->person('Grace', ['hr.view']), ['*']);
        $this->getJson("/api/admin/departments/{$id}/page")->assertOk()->assertJsonPath('can.move', false);
    }

    public function test_hr_or_the_heads_involved_move_people_and_it_is_written_to_their_history(): void
    {
        $wanjiru = $this->person('Wanjiru', ['hr.sensitive']);
        $id = $this->dept('Construction', $wanjiru);
        $peter = $this->person('Peter', ['hr.sensitive']);
        $design = $this->dept('Design', $peter);
        $amina = $this->person('Amina', [], ['department_id' => $design]);
        $loose = $this->person('Kamau');

        Sanctum::actingAs($wanjiru, ['*']);
        $this->postJson("/api/admin/departments/{$id}/people", ['employee_id' => $this->employeeOf($amina), 'to_department_id' => $id])->assertForbidden();   // she is in Design: its head must agree, or HR
        $this->postJson("/api/admin/departments/{$id}/people", ['employee_id' => $this->employeeOf($loose), 'to_department_id' => $id])->assertOk();   // nobody's yet: the head may take them in
        $e = DB::table('employees')->where('id', $this->employeeOf($loose))->first();
        $this->assertSame([$id, $this->westlands, 'Construction'], [(int) $e->department_id, (int) $e->location_id, $e->department]);
        $this->assertSame('Moved on the department page', DB::table('employee_changes')->where('employee_id', $this->employeeOf($loose))->where('field', 'department_id')->value('reason'));

        Sanctum::actingAs($this->person('Grace', ['hr.manage']), ['*']);
        $this->postJson("/api/admin/departments/{$id}/people", ['employee_id' => $this->employeeOf($amina), 'to_department_id' => $id])->assertOk();
        $this->assertSame($id, (int) DB::table('employees')->where('id', $this->employeeOf($amina))->value('department_id'));
    }
}
