<?php

namespace Tests\Feature;

use App\Models\Employee;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1 (docs/HR_STAGE1_SPEC.md), build 1.2: fields by tier, pay and identity protected and encrypted, masked with a logged Show. */
class HrTiersTest extends TestCase
{
    use Concerns\CreatesHrWorld;

    private int $amina;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createHrWorld();
        $this->runSqlScripts('271_hr_foundation.sql');
        $u = $this->person('Amina', [], ['job_title' => 'Cashier', 'gender' => 'female', 'date_of_birth' => '1994-03-02']);
        $this->amina = $this->employeeOf($u);
        Employee::find($this->amina)->update(['base_salary' => 85000, 'bank_name' => 'Equity', 'bank_account_number' => '0123456789', 'id_number' => '29912219', 'kra_pin' => 'A001234567Q']);
    }

    private function show(array $perms): array
    {
        Sanctum::actingAs($this->person('Viewer' . count($perms) . md5(json_encode($perms)), $perms), ['*']);

        return $this->getJson("/api/admin/employees/{$this->amina}")->assertOk()->json('employee');
    }

    public function test_pay_and_identity_details_are_left_out_without_the_permission_and_masked_with_it(): void
    {
        $e = $this->show(['hr.view']);
        $this->assertSame(['work', 'personal'], $e['tiers']);
        $this->assertSame('Cashier', $e['job_title']);
        $this->assertSame('female', $e['gender']);
        foreach (['base_salary', 'bank_name', 'bank_account_number', 'id_number', 'kra_pin'] as $f) {
            $this->assertArrayNotHasKey($f, $e, "{$f} is not sent without hr.sensitive");
        }
        $this->assertArrayNotHasKey('base_salary', $this->getJson('/api/admin/employees')->json('data.0'), 'nor in the list');

        $e = $this->show(['hr.view', 'hr.sensitive']);
        $this->assertSame(['work', 'personal', 'sensitive'], $e['tiers']);
        $this->assertEquals(85000, $e['base_salary']);
        $this->assertSame('Equity', $e['bank_name']);
        $this->assertSame('••••6789', $e['bank_account_number']);
        $this->assertSame('••••2219', $e['id_number']);
        $this->assertSame('0123456789', $this->postJson("/api/admin/employees/{$this->amina}/reveal", ['field' => 'bank_account_number'])->assertOk()->json('value'));
        $this->assertSame('bank_account_number', DB::table('employee_changes')->where('action', 'shown')->value('field'));
        $this->postJson("/api/admin/employees/{$this->amina}/reveal", ['field' => 'base_salary'])->assertStatus(422);

        Sanctum::actingAs($this->person('Grace', ['hr.view']), ['*']);
        $this->postJson("/api/admin/employees/{$this->amina}/reveal", ['field' => 'id_number'])->assertForbidden();
    }

    public function test_bank_and_identity_numbers_are_stored_encrypted_and_old_plain_values_still_read(): void
    {
        $raw = DB::table('employees')->where('id', $this->amina)->first();
        $this->assertNotSame('0123456789', $raw->bank_account_number);
        $this->assertSame('0123456789', Crypt::decryptString($raw->bank_account_number));
        $this->assertEquals(85000, $raw->base_salary, 'salary stays readable for payroll (choice 1)');

        DB::table('employees')->where('id', $this->amina)->update(['nssf_number' => 'NS-77', 'nhif_number' => 'NH-88']);   // saved before encryption
        $this->assertSame('NS-77', Employee::find($this->amina)->nssf_number);
        $this->artisan('hr:encrypt-fields')->expectsOutput('2 value(s) on 1 record(s) encrypted.')->assertSuccessful();
        $this->assertSame('NS-77', Crypt::decryptString(DB::table('employees')->where('id', $this->amina)->value('nssf_number')));
        $this->artisan('hr:encrypt-fields')->expectsOutput('0 value(s) on 0 record(s) encrypted.')->assertSuccessful();
    }

    public function test_who_may_change_which_tier(): void
    {
        // hr.manage without hr.sensitive: work and personal yes, pay and identity no; a form sending everything unchanged is fine
        Sanctum::actingAs($this->person('Grace', ['hr.view', 'hr.manage']), ['*']);
        $this->putJson("/api/admin/employees/{$this->amina}", ['job_title' => 'Head cashier', 'marital_status' => 'married'])->assertOk();
        $this->putJson("/api/admin/employees/{$this->amina}", ['base_salary' => 90000])->assertForbidden()->assertJsonPath('message', 'You may not change pay, bank and identity details here.');
        $this->putJson("/api/admin/employees/{$this->amina}", ['job_title' => 'Head cashier', 'base_salary' => '85000.00', 'kra_pin' => ''])->assertForbidden();   // emptying is a change
        $this->putJson("/api/admin/employees/{$this->amina}", ['job_title' => 'Supervisor', 'base_salary' => 85000])->assertOk();   // unchanged salary sent back
        $this->assertSame('Supervisor', DB::table('employees')->where('id', $this->amina)->value('job_title'));

        // with hr.sensitive: a masked number sent back is "unchanged", a new one is saved encrypted
        Sanctum::actingAs($this->person('Owner', ['hr.view', 'hr.manage', 'hr.sensitive']), ['*']);
        $this->putJson("/api/admin/employees/{$this->amina}", ['bank_account_number' => '••••6789', 'base_salary' => 90000])->assertOk();
        $this->assertSame('0123456789', Employee::find($this->amina)->bank_account_number);
        $this->assertEquals(90000, Employee::find($this->amina)->base_salary);

        // a manager with hr.team: sees their line's personal tier, changes work fields only (choice 3)
        $boss = $this->person('Otieno', ['hr.team']);
        DB::table('employees')->where('id', $this->amina)->update(['manager_id' => $this->employeeOf($boss)]);
        Sanctum::actingAs($boss, ['*']);
        $e = $this->getJson("/api/admin/employees/{$this->amina}")->assertOk()->json('employee');
        $this->assertSame(['work', 'personal'], $e['tiers']);
        $this->assertSame(['work'], $e['can']['change']);
        $this->putJson("/api/admin/employees/{$this->amina}", ['job_title' => 'Senior cashier'])->assertOk();
        $this->putJson("/api/admin/employees/{$this->amina}", ['gender' => 'male'])->assertForbidden()->assertJsonPath('message', 'You may not change personal details here.');
    }

    public function test_people_see_their_own_pay_and_identity_details_unless_switched_off(): void
    {
        $me = \App\Models\User::where('name', 'Amina')->first();
        Sanctum::actingAs($me, ['*']);
        $e = $this->getJson('/api/admin/employees/my-record')->assertOk()->json('employee');
        $this->assertSame(['work', 'personal', 'sensitive'], $e['tiers']);
        $this->assertSame('••••6789', $e['bank_account_number']);
        $this->assertSame('29912219', $this->postJson("/api/admin/employees/{$this->amina}/reveal", ['field' => 'id_number'])->assertOk()->json('value'));

        DB::table('hr_settings')->insert(['part' => 'general', 'value' => json_encode(['own_details' => false]), 'version' => 1, 'updated_at' => now()]);
        $e = $this->getJson('/api/admin/employees/my-record')->assertOk()->json('employee');
        $this->assertSame(['work', 'personal'], $e['tiers']);
        $this->assertArrayNotHasKey('bank_account_number', $e);
        $this->postJson("/api/admin/employees/{$this->amina}/reveal", ['field' => 'id_number'])->assertForbidden();
    }
}
