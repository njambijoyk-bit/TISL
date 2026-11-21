<?php

namespace Tests\Feature\Concerns;

use App\Models\User;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The HR hub's tables (docs/HR_STAGE1_SPEC.md) as the owner's database has them: users, employees with every column of the record, the leave log,
 * plus licences decided by the test (Extras off unless said) and permissions decided by the test (StandsInForAccess).
 */
trait CreatesHrWorld
{
    use RunsSqlScripts;
    use StandsInForAccess;

    protected array $licensed = ['extras' => false, 'careers' => false, 'projects' => false];

    protected function createHrWorld(): void
    {
        config(['app.key' => 'base64:' . base64_encode(str_repeat('h', 32))]);
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone')->nullable(); $t->string('password')->nullable(); $t->string('role')->nullable();
            $t->string('status')->default('active'); $t->string('employee_id')->nullable(); $t->string('department')->nullable(); $t->boolean('force_password_change')->default(false); $t->softDeletes(); $t->timestamps(); });
        Schema::create('employees', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('employee_number')->nullable(); $t->string('employee_id')->nullable(); $t->string('job_title')->nullable(); $t->string('department')->nullable();
            $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('department_id')->nullable(); $t->string('employment_type')->nullable(); $t->date('hire_date')->nullable(); $t->date('termination_date')->nullable();
            $t->unsignedBigInteger('manager_id')->nullable(); $t->string('work_location')->nullable(); $t->string('work_phone')->nullable(); $t->string('work_email')->nullable();
            $t->string('emergency_contact_name')->nullable(); $t->string('emergency_contact_phone')->nullable(); $t->string('emergency_contact_relationship')->nullable();
            $t->string('bank_name')->nullable(); $t->string('bank_account_number')->nullable(); $t->string('bank_account_name')->nullable(); $t->string('salary_grade')->nullable(); $t->decimal('base_salary', 12, 2)->nullable();
            $t->string('currency')->nullable(); $t->integer('annual_leave_days')->nullable(); $t->decimal('leave_balance', 6, 2)->nullable(); $t->string('id_number')->nullable(); $t->string('kra_pin')->nullable();
            $t->string('nssf_number')->nullable(); $t->string('nhif_number')->nullable(); $t->date('date_of_birth')->nullable(); $t->string('gender')->nullable(); $t->string('marital_status')->nullable();
            $t->string('education_level')->nullable(); $t->json('skills')->nullable(); $t->json('certifications')->nullable(); $t->string('status')->default('active'); $t->text('notes')->nullable();
            $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('leave_logs', function ($t) { $t->id(); $t->unsignedBigInteger('employee_id'); $t->string('action'); $t->decimal('days', 6, 1); $t->string('reason')->nullable(); $t->decimal('balance_before', 6, 1)->nullable();
            $t->decimal('balance_after', 6, 1)->nullable(); $t->unsignedBigInteger('actioned_by')->nullable(); $t->timestamps(); });
        Schema::create('customers', function ($t) { $t->id(); $t->unsignedBigInteger('assigned_sales_rep')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('personal_access_tokens', function ($t) { $t->id(); $t->morphs('tokenable'); $t->string('name'); $t->string('token', 64)->unique(); $t->text('abilities')->nullable(); $t->timestamp('last_used_at')->nullable(); $t->timestamp('expires_at')->nullable(); $t->timestamps(); });
        $licensed = &$this->licensed;
        $this->app->instance(LicenseManager::class, new class($licensed) extends LicenseManager {
            public function __construct(private array &$licensed) {}

            public function isLicensed(string $moduleKey): bool
            {
                return $moduleKey === 'core' || ($this->licensed[explode('.', $moduleKey)[0]] ?? false);
            }

            public function isActive(string $moduleKey): bool
            {
                return $this->isLicensed($moduleKey);
            }
        });
    }

    protected function person(string $name, array $permissions = [], array $employee = []): User
    {
        $u = User::forceCreate(['name' => $name, 'email' => strtolower($name) . '@example.test', 'role' => 'staff']);
        $this->grant($u, array_values(array_unique(array_merge(['admin.access'], $permissions))));
        if ($employee !== false) {
            DB::table('employees')->insert($employee + ['user_id' => $u->id, 'employee_number' => 'EMP-' . str_pad((string) $u->id, 4, '0', STR_PAD_LEFT), 'job_title' => 'Staff', 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        }

        return $u;
    }

    protected function employeeOf(User $u): int
    {
        return (int) DB::table('employees')->where('user_id', $u->id)->value('id');
    }
}
