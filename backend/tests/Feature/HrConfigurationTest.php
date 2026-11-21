<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1 (docs/HR_STAGE1_SPEC.md), build 1.4: HR configuration (types, numbering, required fields, versions) and the list's filters. */
class HrConfigurationTest extends TestCase
{
    use Concerns\CreatesHrWorld;

    protected function setUp(): void
    {
        parent::setUp();
        \Carbon\Carbon::setTestNow('2026-11-21 10:00:00');
        $this->createHrWorld();
        $this->runSqlScripts('271_hr_foundation.sql');
        Schema::table('employees', fn ($t) => $t->unsignedBigInteger('employment_type_id')->nullable());   // added by a guarded procedure on MySQL
        foreach ([['full_time', 'Permanent', 10], ['contract', 'Contract', 20], ['part_time', 'Casual / part time', 30], ['intern', 'Intern', 40]] as [$k, $n, $o]) {
            DB::table('hr_employment_types')->insert(['key' => $k, 'name' => $n, 'paid_by_payroll' => 1, 'is_active' => 1, 'sort_order' => $o]);
        }
    }

    protected function tearDown(): void
    {
        \Carbon\Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_hr_configuration_is_versioned_and_needs_its_permission(): void
    {
        Sanctum::actingAs($this->person('Grace', ['hr.manage']), ['*']);
        $this->getJson('/api/admin/hr/configuration')->assertForbidden();
        Sanctum::actingAs($this->person('Owner', ['hr.configure']), ['*']);
        $page = $this->getJson('/api/admin/hr/configuration')->assertOk()->json();
        $this->assertSame(['EMP-{YYYY}-', 4, true], [$page['general']['number_prefix'], $page['general']['number_width'], $page['general']['own_details']]);
        $this->assertSame('EMP-2026-0001', $page['next_number']);

        $this->putJson('/api/admin/hr/configuration', ['general' => ['number_prefix' => 'TISL/', 'number_width' => 3, 'required' => ['work_email' => true], 'own_details' => false]])->assertOk()
            ->assertJsonPath('version', 1)->assertJsonPath('general.required.work_email', true)->assertJsonPath('general.required.department', true)->assertJsonPath('next_number', 'TISL/001');
        $this->putJson('/api/admin/hr/configuration', ['general' => ['number_prefix' => 'EMP {bad}']])->assertStatus(422);
        $this->putJson('/api/admin/hr/configuration', ['general' => ['number_width' => 5]])->assertOk()->assertJsonPath('version', 2);
        $this->postJson('/api/admin/hr/configuration/rollback/1')->assertOk()->assertJsonPath('version', 3)->assertJsonPath('general.number_width', 3)->assertJsonPath('versions.0.action', 'rolled_back');

        // employment types: add, rename, switch off; people counted
        $this->postJson('/api/admin/hr/employment-types', ['name' => 'Seasonal', 'paid_by_payroll' => false])->assertCreated();
        $types = collect($this->getJson('/api/admin/hr/configuration')->json('types'));
        $this->assertSame(['key' => 'seasonal', 'paid' => false], ['key' => $types->firstWhere('name', 'Seasonal')['key'], 'paid' => $types->firstWhere('name', 'Seasonal')['paid_by_payroll']]);
        $this->postJson('/api/admin/hr/employment-types', ['name' => 'Seasonal'])->assertStatus(422);
        $intern = $types->firstWhere('key', 'intern')['id'];
        $this->putJson("/api/admin/hr/employment-types/{$intern}", ['is_active' => false])->assertOk();
        $this->assertNotContains('intern', array_column($this->getJson('/api/admin/hr/employment-types')->assertOk()->json('types'), 'key'));
    }

    public function test_a_new_record_follows_the_types_the_required_fields_and_the_numbering(): void
    {
        DB::table('hr_settings')->insert(['part' => 'general', 'value' => json_encode(['number_prefix' => 'TISL/', 'number_width' => 3, 'required' => ['work_email' => true, 'manager' => true]]), 'version' => 1]);
        $boss = $this->person('Otieno', [], ['employee_number' => 'TISL/007']);
        $owner = $this->person('Owner', ['hr.manage', 'hr.view']);
        Sanctum::actingAs($owner, ['*']);
        $new = \App\Models\User::forceCreate(['name' => 'Wanjiru', 'email' => 'wanjiru@example.test']);   // an existing account, so no role is chosen here
        $base = ['user_id' => $new->id, 'job_title' => 'Engineer', 'department' => 'Site'];

        $errors = $this->postJson('/api/admin/employees', $base + ['employment_type' => 'seasonal'])->assertStatus(422)->json('errors');
        $this->assertArrayHasKey('employment_type', $errors, 'only the company\'s types');
        $this->assertSame(['Work email is required.'], $errors['work_email']);
        $this->assertSame(['Choose who they report to.'], $errors['manager_id']);

        $e = $this->postJson('/api/admin/employees', $base + ['employment_type' => 'contract', 'work_email' => 'w@tisl.test', 'manager_id' => $this->employeeOf($boss)])->assertCreated()->json('employee');
        $this->assertSame('TISL/008', $e['employee_number'], 'the next number in the configured format');
        $this->assertSame((int) DB::table('hr_employment_types')->where('key', 'contract')->value('id'), (int) DB::table('employees')->where('id', $e['id'])->value('employment_type_id'));
    }

    public function test_the_list_filters_by_branch_department_and_who_joined_lately(): void
    {
        $hr = $this->person('Grace', ['hr.view'], ['hire_date' => '2019-01-10', 'location_id' => 1, 'department_id' => 5]);
        $this->person('Amina', [], ['hire_date' => '2026-10-01', 'location_id' => 2, 'department_id' => 5]);
        $this->person('Kamau', [], ['hire_date' => '2026-11-15', 'location_id' => 2, 'department_id' => 6]);
        Sanctum::actingAs($hr, ['*']);
        $names = fn (string $q) => collect($this->getJson("/api/admin/employees?{$q}")->assertOk()->json('data'))->pluck('user.name')->sort()->values()->all();
        $this->assertSame(['Amina', 'Kamau'], $names('joined_days=90'));
        $this->assertSame(['Amina', 'Kamau'], $names('location_id=2'));
        $this->assertSame(['Amina', 'Grace'], $names('department_id=5'));
    }
}
