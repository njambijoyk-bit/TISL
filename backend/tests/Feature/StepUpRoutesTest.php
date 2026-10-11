<?php

namespace Tests\Feature;

use App\Models\Security\AuthPendingAction;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The sensitive actions of the real system: which doors carry which rule, and the ones that only ask when the request is a sensitive one. */
class StepUpRoutesTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('employee_id')->nullable(); $t->string('bank_name')->nullable(); $t->string('bank_account_number')->nullable(); $t->string('bank_account_name')->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('vendors', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('status')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['daraja.consumer_key' => 'x', 'daraja.consumer_secret' => 'x', 'daraja.shortcode' => '1', 'daraja.passkey' => 'x', 'daraja.callback_url' => 'https://x.test/cb', 'daraja.env' => 'sandbox']);
        Route::middleware(['api', 'auth:sanctum'])->put('/api/_employees/{id}', [\App\Http\Controllers\Api\EmployeeController::class, 'update']);   // (the door without its module switch, which these tests have no database for)
        $this->app->instance(\App\Services\Notify\Notifier::class, new class extends \App\Services\Notify\Notifier {
            public function __construct() {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return $this->send(new \App\Models\User(), $type, $title, $message, $o);
            }
        });
    }

    private function mode(string $rule, string $mode = 'enforce'): void
    {
        config(["security.policy.stepup.{$rule}.mode" => $mode]);
        SecuritySettings::forget();
    }

    private function person(string $role, string $name = 'Someone'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'p'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function as(User $u): self
    {
        $token = app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    // ------------------------------------------------------------ which doors carry which rule

    public function test_the_doors_carry_their_rules(): void
    {
        $expect = [
            'PUT api/admin/security-policy' => 'security_settings',
            'PUT api/admin/payments/settings/{part}' => 'payment_keys',
            'POST api/admin/payments/settings/purge-keys' => 'payment_keys',
            'POST api/admin/payments/settings/{part}/rotate-token' => 'payment_keys',
            'POST api/admin/payments/settings/{part}/reset' => 'payment_keys',
            'POST api/admin/payments/settings/{part}/versions/{id}/rollback' => 'payment_keys',
            'PUT api/admin/access/users/{id}/clearance' => 'access_change',
            'PUT api/admin/access/users/{id}/primary-role' => 'access_change',
            'PUT api/admin/access/users/{id}/default-location' => 'access_change',
            'PUT api/admin/access/levels/{level}' => 'access_change',
            'POST api/admin/access/users/{id}/roles' => 'access_change',
            'DELETE api/admin/access/users/{id}/roles/{roleId}' => 'access_change',
            'POST api/admin/access/users/{id}/grants' => 'access_change',
            'DELETE api/admin/access/users/{id}/grants/{grantId}' => 'access_change',
            'POST api/admin/access/roles' => 'access_change',
            'PUT api/admin/access/roles/{id}' => 'access_change',
            'DELETE api/admin/access/roles/{id}' => 'access_change',
            'PUT api/admin/access/scope-modes' => 'access_change',
            'POST api/admin/payroll/runs/{id}/approve' => 'payroll_run',
            'POST api/admin/payroll/runs/{id}/pay' => 'payroll_run',
            'POST api/admin/backups/restore/upload' => 'backup_restore',
            'POST api/admin/backups/restore/pull' => 'backup_restore',
            'POST api/admin/exchange/export' => 'export_bulk',
            'POST api/admin/logs/export' => 'export_bulk',
            'GET|HEAD api/admin/books/vouchers/export' => 'export_bulk',
            'POST api/admin/books/vouchers/{id}/cancel' => 'voucher_cancel',
        ];
        $found = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $methods = implode('|', array_diff($route->methods(), ['HEAD']));
            foreach ((array) $route->middleware() as $m) {
                if (is_string($m) && str_starts_with($m, 'assurance:')) {
                    $found[($methods === 'GET' ? 'GET|HEAD' : $methods).' '.$route->uri()] = substr($m, 10);
                }
            }
        }
        foreach ($expect as $door => $rule) {
            $this->assertSame($rule, $found[$door] ?? null, $door);
        }
        $this->assertSame([], array_diff_key($found, $expect), 'a door carries a rule this test does not know about');
    }

    public function test_every_rule_in_the_catalogue_is_used_somewhere(): void
    {
        $source = file_get_contents(base_path('routes/api.php')).implode('', array_map('file_get_contents', glob(app_path('Http/Controllers/Api/*.php'))));
        foreach (\App\Services\Security\StepUp\Catalogue::keys() as $rule) {
            $this->assertTrue(str_contains($source, "assurance:{$rule}") || str_contains($source, "'{$rule}'"), "{$rule} protects nothing yet");
        }
    }

    public function test_the_permission_comes_before_the_question_on_every_door(): void
    {
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $middleware = array_values(array_filter((array) $route->middleware(), 'is_string'));
            $assure = null;
            $permission = null;
            foreach ($middleware as $i => $m) {
                $assure ??= str_starts_with($m, 'assurance:') ? $i : null;
                $permission ??= str_starts_with($m, 'permission:') ? $i : null;
            }
            if ($assure !== null) {
                $this->assertNotNull($permission, $route->uri().' asks the question but has no permission check');
                $this->assertLessThan($assure, $permission, $route->uri().': the permission must be checked first');
            }
        }
    }

    // ------------------------------------------------------------ staff accounts: only when the account is staff's

    public function test_changing_a_staff_accounts_status_or_sign_in_is_held_but_a_customers_is_not(): void
    {
        $this->mode('staff_account');
        $this->mode('signin_reset');
        $owner = $this->person('super_admin', 'Owner');
        $staff = $this->person('finance', 'Fiona Finance');
        $customer = $this->person('customer', 'Carol Customer');

        $this->as($owner)->postJson("/api/admin/users/{$staff->id}/update-status", ['status' => 'suspended'])->assertStatus(403)->assertJsonPath('step_up.rule', 'staff_account');
        $this->as($owner)->postJson("/api/admin/users/{$staff->id}/force-password-reset")->assertStatus(403)->assertJsonPath('step_up.rule', 'signin_reset');
        $this->as($owner)->postJson("/api/admin/users/{$staff->id}/reset-password", ['password' => 'Wq7!zXp4kLmN2v9#'])->assertStatus(403)->assertJsonPath('step_up.rule', 'signin_reset');
        $this->as($owner)->deleteJson("/api/admin/users/{$staff->id}")->assertStatus(403)->assertJsonPath('step_up.rule', 'staff_account');
        $this->assertSame('active', $staff->fresh()->status);
        $this->assertFalse((bool) $staff->fresh()->force_password_change);
        $this->assertNull(User::withTrashed()->find($staff->id)->deleted_at);

        $this->as($owner)->postJson("/api/admin/users/{$customer->id}/update-status", ['status' => 'suspended'])->assertOk();
        $gone = $this->person('customer', 'Gone Customer');
        $this->as($owner)->deleteJson("/api/admin/users/{$gone->id}")->assertOk();                  // a customer's account is not a staff account
        $this->as($owner)->postJson("/api/admin/users/{$customer->id}/force-password-reset")->assertOk();
        $this->assertSame('suspended', $customer->fresh()->status);
        $this->assertTrue((bool) $customer->fresh()->force_password_change);
    }

    public function test_making_or_editing_a_staff_account_is_held_and_a_customers_is_not(): void
    {
        $this->mode('staff_account');
        $owner = $this->person('super_admin', 'Owner');
        $staff = $this->person('finance', 'Fiona Finance');
        $customer = $this->person('customer', 'Carol Customer');

        // making one: only when the role is a staff role (nothing is created when held)
        $before = User::count();
        $this->as($owner)->postJson('/api/admin/users', ['name' => 'New Staff', 'email' => 'new@example.com', 'password' => 'Wq7!zXp4kLmN2v9#', 'role' => 'finance'])->assertStatus(403)->assertJsonPath('step_up.rule', 'staff_account');
        $this->assertSame($before, User::count());
        $made = $this->as($owner)->postJson('/api/admin/users', ['name' => 'New Customer', 'email' => 'newc@example.com', 'password' => 'Wq7!zXp4kLmN2v9#', 'role' => 'customer']);
        $this->assertArrayNotHasKey('step_up', $made->json() ?? []);

        // editing one: a staff account, or giving anybody a staff role
        $this->as($owner)->putJson("/api/admin/users/{$staff->id}", ['name' => 'Fiona F.'])->assertStatus(403)->assertJsonPath('step_up.rule', 'staff_account');
        $this->assertSame('Fiona Finance', $staff->fresh()->name);
        $this->as($owner)->putJson("/api/admin/users/{$customer->id}", ['role' => 'finance'])->assertStatus(403)->assertJsonPath('step_up.rule', 'staff_account');
        $this->assertSame('customer', $customer->fresh()->role);
        $plain = $this->as($owner)->putJson("/api/admin/users/{$customer->id}", ['name' => 'Carol C.']);
        $this->assertArrayNotHasKey('step_up', $plain->json() ?? []);
        $same = $this->as($owner)->putJson("/api/admin/users/{$customer->id}", ['role' => 'customer']);   // sending the role back unchanged is not a change
        $this->assertArrayNotHasKey('step_up', $same->json() ?? []);
    }

    public function test_the_screen_says_who_is_affected_and_what_will_happen_in_words(): void
    {
        $this->mode('staff_account');
        $this->mode('signin_reset');
        $this->mode('access_change');
        $owner = $this->person('super_admin', 'Owner');
        $staff = $this->person('finance', 'Fiona Finance');

        $facts = fn ($r) => collect($r->json('step_up.facts'))->pluck('value', 'label');
        $f = $facts($this->as($owner)->postJson("/api/admin/users/{$staff->id}/update-status", ['status' => 'suspended']));
        $this->assertStringContainsString('Fiona Finance', $f['Account']);
        $this->assertStringContainsString($staff->email, $f['Account']);
        $this->assertStringContainsString('finance', $f['Account']);
        $this->assertStringContainsString('suspended', $f['Change']);
        $this->assertStringContainsString('cannot sign in', $f['Change']);

        $f = $facts($this->as($owner)->postJson("/api/admin/users/{$staff->id}/force-password-reset"));
        $this->assertStringContainsString('Fiona Finance', $f['Whose sign-in']);
        $this->assertStringContainsString('every sign-in of theirs ends now', $f['Change']);

        $f = $facts($this->as($owner)->putJson("/api/admin/access/users/{$staff->id}/clearance", ['level' => 5]));
        $this->assertStringContainsString('Fiona Finance', $f['Person']);
        $this->assertStringContainsString('clearance level to 5', $f['Change']);
        $this->assertSame('5', $f['Level']);

        $f = $facts($this->as($owner)->postJson('/api/admin/access/roles', ['name' => 'Night Watch']));
        $this->assertStringContainsString('Create a new role "Night Watch"', $f['Change']);
        $this->assertArrayNotHasKey('Person', $f->all());
    }

    public function test_the_security_settings_screen_reads_in_plain_words(): void
    {
        $this->mode('security_settings');
        $owner = $this->person('super_admin');
        $r = $this->as($owner)->putJson('/api/admin/security-policy', ['mode' => 'enforce', 'enforce_from' => '2026-12-01', 'roles' => ['finance'], 'permissions' => ['payroll.run'], 'owner_roles' => ['super_admin'], 'owner_device_bound' => true]);
        $f = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringContainsString('On:', $f['The passkey rule']);
        $this->assertSame('2026-12-01', $f['Applies from']);
        $this->assertSame('Finance', $f['For these roles']);
        $this->assertStringContainsString('payroll', strtolower($f['And anyone who can']));
        $this->assertSame('Super admin', $f['Needing two passkeys']);
        $this->assertSame('Yes', $f['Their two stay on the device']);
    }

    public function test_the_question_is_not_asked_of_someone_who_may_not_do_it_at_all(): void
    {
        $this->mode('staff_account');
        $this->mode('signin_reset');
        $rep = $this->person('sales_rep');
        $staff = $this->person('finance');
        $before = AuthPendingAction::count();
        $r = $this->as($rep)->postJson("/api/admin/users/{$staff->id}/update-status", ['status' => 'suspended']);
        $this->assertContains($r->status(), [403, 404]);
        $this->assertArrayNotHasKey('step_up', $r->json() ?? []);
        $this->assertSame($before, AuthPendingAction::count());
    }

    public function test_when_the_rules_are_off_the_same_requests_go_straight_through(): void
    {
        $owner = $this->person('super_admin');
        $staff = $this->person('finance');
        $this->as($owner)->postJson("/api/admin/users/{$staff->id}/update-status", ['status' => 'suspended'])->assertOk();
        $this->as($owner)->postJson("/api/admin/users/{$staff->id}/force-password-reset")->assertOk();
        $this->assertSame(0, AuthPendingAction::count());
    }

    // ------------------------------------------------------------ bank details: only when one is being changed

    public function test_changing_an_employees_bank_details_is_held_but_changing_the_rest_is_not(): void
    {
        $this->mode('bank_details');
        \Illuminate\Support\Facades\Gate::before(fn () => true);   // (the HR module's own switch is not what is being tested)
        $owner = $this->person('super_admin');
        $emp = $this->person('finance');
        $id = \DB::table('employees')->insertGetId(['user_id' => $emp->id, 'employee_id' => 'E1', 'bank_name' => 'Equity', 'bank_account_number' => '0123', 'bank_account_name' => 'Fiona Finance', 'created_at' => now(), 'updated_at' => now()]);

        // the same bank details sent back unchanged (the form sends everything): not a change
        $same = $this->as($owner)->putJson("/api/_employees/{$id}", ['bank_name' => 'Equity', 'bank_account_number' => '0123', 'bank_account_name' => 'Fiona Finance']);
        $this->assertArrayNotHasKey('step_up', $same->json() ?? []);
        // somewhere else for the pay to go
        $r = $this->as($owner)->putJson("/api/_employees/{$id}", ['bank_name' => 'Equity', 'bank_account_number' => '9999', 'bank_account_name' => 'Fiona Finance']);
        $r->assertStatus(403)->assertJsonPath('step_up.rule', 'bank_details')->assertJsonPath('step_up.class', 'elevated');
        $this->assertSame('0123', \DB::table('employees')->where('id', $id)->value('bank_account_number'));
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('0123  →  9999', $facts['Bank Account Number']);   // where the pay would go, and where it went before: exactly what the person must read before agreeing
        $this->assertArrayNotHasKey('Bank Name', $facts->all());                                          // what is not changing is not shown
        $this->assertSame($emp->name, $facts['Whose pay']);
    }
}
