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
}
