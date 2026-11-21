<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Services\Hr\EmployeeHistory;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1 (docs/HR_STAGE1_SPEC.md), build 1.3: every change to a record is kept, and each viewer reads the tiers they may see. */
class HrHistoryTest extends TestCase
{
    use Concerns\CreatesHrWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createHrWorld();
        $this->runSqlScripts('271_hr_foundation.sql');
    }

    public function test_every_save_of_a_record_is_kept_whichever_code_makes_it(): void
    {
        $owner = $this->person('Owner', ['hr.view', 'hr.manage', 'hr.sensitive']);
        $amina = $this->person('Amina', [], ['job_title' => 'Cashier', 'base_salary' => 85000]);
        $id = $this->employeeOf($amina);
        Sanctum::actingAs($owner, ['*']);

        $this->putJson("/api/admin/employees/{$id}", ['job_title' => 'Head cashier', 'base_salary' => 90000, 'bank_account_number' => '0123456789', 'reason' => 'Promoted'])->assertOk();
        $this->postJson("/api/admin/employees/{$id}/add-skill", ['skill' => 'Stock counts'])->assertOk();
        $this->postJson("/api/admin/employees/{$id}/add-leave-days", ['days' => 2, 'reason' => 'Worked a holiday'])->assertOk();
        $this->putJson("/api/admin/employees/{$id}", ['status' => 'on_leave'])->assertOk();
        Employee::find($id)->update(['work_location' => 'Westlands']);   // any other code that saves the record

        $rows = DB::table('employee_changes')->orderBy('id')->get();
        $this->assertSame([['job_title', 'changed', 'work'], ['bank_account_number', 'changed', 'sensitive'], ['base_salary', 'changed', 'sensitive'], ['skills', 'changed', 'work'],
            ['leave_balance', 'changed', 'work'], ['status', 'status', 'work'], ['work_location', 'changed', 'work']],
            $rows->map(fn ($r) => [$r->field, $r->action, $r->tier])->all());
        $this->assertSame(['Promoted', 'Worked a holiday', $owner->id], [$rows[0]->reason, $rows[4]->reason, (int) $rows[0]->by_user]);
        $this->assertStringNotContainsString('90000', (string) $rows[2]->new_value, 'sensitive values are kept encrypted');
        $this->assertSame('Cashier', $rows[0]->old_value);

        // deleting and restoring; deleting for good keeps the history with the name
        $this->deleteJson("/api/admin/employees/{$id}")->assertOk();
        $this->postJson("/api/admin/employees/{$id}/restore")->assertOk();
        $this->assertSame(['deleted', 'restored'], DB::table('employee_changes')->whereNull('field')->orderBy('id')->pluck('action')->all());
        EmployeeHistory::as('bulk', $owner, 'Year-end clean up', fn () => Employee::find($id)->update(['notes' => 'Checked']));
        $this->assertSame(['bulk', 'Year-end clean up'], [DB::table('employee_changes')->orderByDesc('id')->value('action'), DB::table('employee_changes')->orderByDesc('id')->value('reason')]);
    }

    public function test_each_viewer_reads_the_tiers_they_may_see(): void
    {
        $boss = $this->person('Otieno', ['hr.team']);
        $amina = $this->person('Amina', [], ['manager_id' => null]);
        $id = $this->employeeOf($amina);
        DB::table('employees')->where('id', $id)->update(['manager_id' => $this->employeeOf($boss)]);
        $owner = $this->person('Owner', ['hr.view', 'hr.manage', 'hr.sensitive']);
        Sanctum::actingAs($owner, ['*']);
        $this->putJson("/api/admin/employees/{$id}", ['job_title' => 'Supervisor', 'gender' => 'female', 'bank_name' => 'KCB'])->assertOk();
        $this->putJson("/api/admin/employees/{$id}", ['bank_name' => 'Equity'])->assertOk();

        $all = $this->getJson("/api/admin/employees/{$id}/history")->assertOk()->json('history');
        $this->assertSame(['bank_name', 'gender', 'bank_name', 'job_title'], array_column($all, 'field'));
        $this->assertSame(['KCB', 'Equity'], [$all[0]['old'], $all[0]['new']], 'with the permission, a wrong bank change can be traced (choice 4)');
        $this->assertSame('Owner', $all[0]['by']);
        $this->assertSame(['job_title'], array_column($this->getJson("/api/admin/employees/{$id}/history?tier=work")->json('history'), 'field'));

        Sanctum::actingAs($this->person('Grace', ['hr.view']), ['*']);
        $this->assertSame(['gender', 'job_title'], array_column($this->getJson("/api/admin/employees/{$id}/history")->assertOk()->json('history'), 'field'), 'no pay and identity rows without hr.sensitive');

        Sanctum::actingAs($boss, ['*']);
        $this->assertSame(['job_title'], array_column($this->getJson("/api/admin/employees/{$id}/history")->assertOk()->json('history'), 'field'), 'a manager reads the work history of their line');

        Sanctum::actingAs($amina, ['*']);
        $mine = $this->getJson("/api/admin/employees/{$id}/history")->assertOk()->json('history');
        $this->assertSame('Equity', $mine[0]['new'], 'the person reads their own, pay details included');

        Sanctum::actingAs($this->person('Njeri'), ['*']);
        $this->getJson("/api/admin/employees/{$id}/history")->assertForbidden();
    }
}
