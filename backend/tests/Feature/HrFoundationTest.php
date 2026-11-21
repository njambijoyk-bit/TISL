<?php

namespace Tests\Feature;

use App\Services\Access\Catalog;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1 (docs/HR_STAGE1_SPEC.md), build 1.1: the record is core, hr.view and hr.team work on the server, a manager's line. */
class HrFoundationTest extends TestCase
{
    use Concerns\CreatesHrWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createHrWorld();
    }

    public function test_the_hr_permissions_are_core_and_the_two_new_ones_are_in_the_catalogue(): void
    {
        foreach (['hr.view', 'hr.manage', 'hr.team', 'hr.purge', 'hr.sensitive', 'hr.configure'] as $p) {
            $this->assertArrayHasKey($p, Catalog::PERMISSIONS);
            $this->assertNull(Catalog::PERMISSIONS[$p][0], "{$p} belongs to core");
        }
        $this->assertContains('hr.sensitive', Catalog::OWNER_ONLY, 'pay and identity details, like payroll, are the owner\'s to give');
        $this->assertContains('hr.configure', Catalog::ADDED[Catalog::VERSION]);
    }

    public function test_employee_records_work_without_the_extras_licence_and_hr_view_only_looks(): void
    {
        $hr = $this->person('Grace', ['hr.view']);
        $amina = $this->person('Amina', [], ['job_title' => 'Cashier']);
        Sanctum::actingAs($hr, ['*']);
        $this->assertFalse($this->licensed['extras']);
        $this->assertCount(2, $this->getJson('/api/admin/employees')->assertOk()->json('data'));
        $this->getJson('/api/admin/employees/' . $this->employeeOf($amina))->assertOk()->assertJsonPath('employee.job_title', 'Cashier');
        $this->getJson('/api/admin/employees/statistics')->assertOk()->assertJsonPath('total_employees', 2);
        $this->putJson('/api/admin/employees/' . $this->employeeOf($amina), ['job_title' => 'Head cashier'])->assertForbidden();
        $this->getJson('/api/admin/employees/my-record')->assertOk()->assertJsonPath('employee.user_id', $hr->id);
    }

    public function test_a_manager_with_hr_team_sees_and_changes_their_whole_line_and_nobody_else(): void
    {
        $boss = $this->person('Otieno', ['hr.team']);
        $lead = $this->person('Wanjiru', [], ['manager_id' => $this->employeeOf($boss)]);
        $junior = $this->person('Kamau', [], ['manager_id' => $this->employeeOf($lead)]);
        $other = $this->person('Njeri');
        Sanctum::actingAs($boss, ['*']);

        $names = collect($this->getJson('/api/admin/employees')->assertOk()->json('data'))->pluck('user.name')->sort()->values()->all();
        $this->assertSame(['Kamau', 'Otieno', 'Wanjiru'], $names, 'their reports, their reports\' reports, and themselves');
        $this->assertSame(3, $this->getJson('/api/admin/employees/statistics')->json('total_employees'));
        $this->getJson('/api/admin/employees/' . $this->employeeOf($junior))->assertOk();
        $this->getJson('/api/admin/employees/' . $this->employeeOf($other))->assertForbidden();
        $this->putJson('/api/admin/employees/' . $this->employeeOf($junior), ['job_title' => 'Site clerk'])->assertOk();
        $this->assertSame('Site clerk', DB::table('employees')->where('id', $this->employeeOf($junior))->value('job_title'));
        $this->putJson('/api/admin/employees/' . $this->employeeOf($other), ['job_title' => 'Anything'])->assertForbidden();
        $this->postJson('/api/admin/employees/' . $this->employeeOf($other) . '/add-skill', ['skill' => 'Welding'])->assertForbidden();
        $this->putJson('/api/admin/employees/' . $this->employeeOf($boss), ['job_title' => 'Director'])->assertForbidden();   // not their own record either
    }

    public function test_someone_without_hr_permissions_sees_only_their_own_record_and_cannot_change_it(): void
    {
        $amina = $this->person('Amina');
        $other = $this->person('Njeri');
        Sanctum::actingAs($amina, ['*']);
        $this->getJson('/api/admin/employees')->assertForbidden();
        $this->getJson('/api/admin/employees/my-record')->assertOk()->assertJsonPath('employee.user_id', $amina->id);   // it used to need the delivery permission
        $this->getJson('/api/admin/employees/' . $this->employeeOf($other))->assertForbidden();
        $this->putJson('/api/admin/employees/' . $this->employeeOf($amina), ['base_salary' => 900000])->assertForbidden();
    }
}
