<?php

namespace Tests\Feature;

use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Security\PasskeyPolicy;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** What each role needs of its passkeys: how many, and whether they must stay on the device (not copied to a Google or Apple account). */
class PasskeyRoleStrengthTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]],
            'security.policy.kill_switch' => false, 'security.policy.passkeys.mode' => 'enforce', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString(),
            'security.policy.passkeys.roles' => ['admin', 'finance', 'super_admin'], 'security.policy.passkeys.owner_roles' => ['super_admin'], 'security.policy.passkeys.owner_device_bound' => true, 'security.policy.passkeys.device_bound_roles' => []]);
        SecuritySettings::forget();
        Route::middleware(['api', 'auth:sanctum'])->get('/api/_probe', fn () => response()->json(['ok' => true]));
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

    private function set(array $more): void
    {
        foreach ($more as $k => $v) {
            config(["security.policy.passkeys.{$k}" => $v]);
        }
        SecuritySettings::forget();
    }

    private function person(string $role): User
    {
        static $n = 0;

        return User::forceCreate(['name' => ucfirst($role).(++$n), 'email' => $role.$n.'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function openSession(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /** A passkey from a device that keeps it (`$synced` false) or that copies it to a cloud account. */
    private function passkey(string $token, bool $synced): FakeAuthenticator
    {
        $d = new FakeAuthenticator();
        $d->backupEligible = $synced;
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => $synced ? 'Cloud phone' : 'Security key'])->assertStatus(201);

        return $d;
    }

    private function report(User $u): array
    {
        return app(PasskeyPolicy::class)->report($u, null);
    }

    private function gateOf(User $u): ?string
    {
        return $this->report($u)['would_gate'];
    }

    private function row(User $u): array
    {
        return collect(app(PasskeyPolicy::class)->roster()['people'])->firstWhere('id', $u->id);
    }

    // ------------------------------------------------------------ one role must keep its passkeys on the device, another need not

    public function test_a_role_can_ask_for_passkeys_that_stay_on_the_device_without_asking_for_two(): void
    {
        $this->set(['device_bound_roles' => ['finance']]);
        $finance = $this->person('finance');
        $admin = $this->person('admin');
        $tf = $this->openSession($finance);
        $ta = $this->openSession($admin);

        $this->passkey($tf, true);                                                                // copied to a cloud account
        $this->passkey($ta, true);
        $this->assertSame('device_bound_missing', $this->gateOf($finance));                       // finance asked for one that stays on the device
        $this->assertSame('passkey_needed', $this->gateOf($admin));                               // admin's one passkey is enough (it only needs to be used in this sign-in)
        $this->as($tf)->getJson('/api/_probe')->assertStatus(403)->assertJsonPath('restricted.reason', 'device_bound_missing');

        $this->passkey($tf, false);                                                               // one that stays on the device
        $this->assertSame('passkey_needed', $this->gateOf($finance));
        $this->assertSame(1, $this->report($finance)['needs']);
    }

    public function test_the_staff_list_says_who_must_keep_their_passkeys_on_the_device(): void
    {
        $this->set(['device_bound_roles' => ['finance', 'sales_rep']]);                           // (a role the rule is not for may be listed: it still asks nothing of them)
        $finance = $this->person('finance');
        $admin = $this->person('admin');
        $owner = $this->person('super_admin');
        $rep = $this->person('sales_rep');
        $this->assertTrue($this->row($finance)['device_bound']);
        $this->assertSame(1, $this->row($finance)['needs']);
        $this->assertFalse($this->row($admin)['device_bound']);
        $this->assertTrue($this->row($owner)['device_bound']);                                    // (the owner's two, while the all-in-one switch is on)
        $this->assertSame(2, $this->row($owner)['needs']);
        $this->assertFalse($this->row($rep)['device_bound']);                                     // the rule is not for them: nothing is asked
        $this->assertSame(0, $this->row($rep)['needs']);
    }

    public function test_a_role_that_is_not_listed_may_use_passkeys_that_sync(): void
    {
        $this->set(['device_bound_roles' => [], 'owner_device_bound' => false]);
        $admin = $this->person('admin');
        $ta = $this->openSession($admin);
        $this->passkey($ta, true);
        $this->assertSame('passkey_needed', $this->gateOf($admin));                               // met: only a sign-in with it is missing
        $this->assertTrue($this->report($admin)['passkeys'] === 1 && $this->row($admin)['met']);
    }

    // ------------------------------------------------------------ the owner's two, and the older all-in-one switch

    public function test_the_older_switch_still_makes_the_roles_that_need_two_keep_both_on_the_device(): void
    {
        $owner = $this->person('super_admin');
        $to = $this->openSession($owner);
        $this->passkey($to, true);
        $this->passkey($to, true);
        $this->assertSame('device_bound_missing', $this->gateOf($owner));
        $this->set(['owner_device_bound' => false]);                                              // the owner chose not to ask for that
        $this->assertSame('passkey_needed', $this->gateOf($owner));
    }

    public function test_a_role_can_be_held_to_the_device_even_when_the_older_switch_is_off(): void
    {
        $this->set(['owner_device_bound' => false, 'device_bound_roles' => ['super_admin']]);
        $owner = $this->person('super_admin');
        $to = $this->openSession($owner);
        $this->passkey($to, true);
        $this->passkey($to, true);
        $this->assertSame('device_bound_missing', $this->gateOf($owner));
        $this->passkey($to, false);
        $this->assertSame('device_bound_missing', $this->gateOf($owner));                         // two are needed, and only one stays on the device
        $this->passkey($to, false);
        $this->assertSame('passkey_needed', $this->gateOf($owner));
        $this->assertTrue($this->row($owner)['met']);
    }

    public function test_the_gate_counts_only_the_ones_that_stay_on_the_device(): void
    {
        $this->set(['device_bound_roles' => ['finance']]);
        $finance = $this->person('finance');
        $tf = $this->openSession($finance);
        $this->passkey($tf, true);
        $this->passkey($tf, true);
        $this->assertFalse($this->row($finance)['met']);
        $this->assertSame(2, $this->row($finance)['passkeys']);
    }

    // ------------------------------------------------------------ several roles: the strictest

    public function test_a_person_with_several_roles_is_held_to_the_strictest(): void
    {
        $this->set(['device_bound_roles' => ['finance'], 'owner_device_bound' => false]);
        $auth = \Mockery::mock(Authorizer::class)->makePartial();
        $auth->shouldReceive('roleKeys')->andReturn(['admin', 'finance']);
        $policy = new PasskeyPolicy($auth, app(CredentialStore::class), app(SecuritySettings::class));
        $someone = $this->person('admin');
        $this->assertTrue($policy->deviceBound($someone, 1));                                      // one of their roles asks for it
        $this->assertSame(1, $policy->needs($someone));

        $auth2 = \Mockery::mock(Authorizer::class)->makePartial();
        $auth2->shouldReceive('roleKeys')->andReturn(['admin', 'super_admin']);
        $policy2 = new PasskeyPolicy($auth2, app(CredentialStore::class), app(SecuritySettings::class));
        $this->assertSame(2, $policy2->needs($someone));                                          // one of their roles needs two
        $this->assertFalse($policy2->deviceBound($someone, 2));                                    // (and the owner chose not to ask for the device)
    }

    // ------------------------------------------------------------ the owner's door

    public function test_the_owner_can_set_it_per_role_and_it_is_written_down(): void
    {
        $owner = $this->person('super_admin');
        $to = $this->openSession($owner);
        $this->passkey($to, false);
        $this->passkey($to, false);
        $this->as($to)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201);
        $r = $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'log', 'device_bound_roles' => ['finance', 'admin'], 'owner_device_bound' => false])->assertOk();
        $r->assertJsonPath('settings.device_bound_roles', ['finance', 'admin'])->assertJsonPath('settings.owner_device_bound', false);
        $this->assertSame(['finance', 'admin'], app(SecuritySettings::class)->get('passkeys.device_bound_roles'));
        $e = SecurityEvent::where('event', 'passkey_policy_changed')->first();
        $this->assertSame([], $e->detail['before']['device_bound_roles']);
        $this->assertSame(['finance', 'admin'], $e->detail['after']['device_bound_roles']);
        $this->as($to)->getJson('/api/admin/security-policy')->assertOk()->assertJsonPath('settings.device_bound_roles', ['finance', 'admin']);
        $rows = collect($r->json('roster.people'));
        $this->assertSame(0, $rows->where('role', 'sales_rep')->count());
    }

    public function test_a_list_that_is_left_out_stays_and_a_role_that_does_not_exist_is_refused(): void
    {
        $this->set(['mode' => 'off']);
        $owner = $this->person('super_admin');
        $to = $this->openSession($owner);
        $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'log', 'device_bound_roles' => ['no_such_role']])->assertStatus(422)->assertJsonValidationErrors('device_bound_roles.0');
        $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'log', 'device_bound_roles' => ['finance']])->assertOk();
        $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'off'])->assertOk()->assertJsonPath('settings.device_bound_roles', ['finance']);
        $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'off', 'device_bound_roles' => []])->assertOk()->assertJsonPath('settings.device_bound_roles', []);
    }

    public function test_the_screen_that_asks_the_owner_to_confirm_names_the_roles(): void
    {
        $this->set(['mode' => 'off']);
        config(['security.policy.stepup.security_settings.mode' => 'enforce']);
        SecuritySettings::forget();
        $owner = $this->person('super_admin');
        $to = $this->openSession($owner);
        $r = $this->as($to)->putJson('/api/admin/security-policy', ['mode' => 'log', 'device_bound_roles' => ['finance', 'admin']])->assertStatus(403);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('Finance, Admin', $facts['Passkeys must stay on the device for']);
    }
}
