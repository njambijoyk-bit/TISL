<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\PasskeyPolicy;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** The passkey rule: who it is for, the grace period, log and enforce, and the restricted session that can only add or use a passkey. */
class PasskeyPolicyTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        \Illuminate\Support\Facades\Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });   // (staff sign-in looks for the employee record)
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]]]);
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

    private function rule(string $mode, ?string $from = null, array $more = []): void
    {
        config(['security.policy.passkeys.mode' => $mode, 'security.policy.passkeys.enforce_from' => $from] + $more);
        SecuritySettings::forget();
    }

    private function person(string $role, string $email = null): User
    {
        static $n = 0;

        return User::forceCreate(['name' => ucfirst($role), 'email' => $email ?? $role.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function openSession(User $u, string $method = 'password', ?int $credential = null, int $strength = 0): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', $method, $credential, $strength);
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function pk(array $set = []): FakeAuthenticator
    {
        $d = new FakeAuthenticator();
        foreach ($set as $k => $v) {
            $d->$k = $v;
        }

        return $d;
    }

    /** Add a passkey through the doors, from a session. @return FakeAuthenticator the device */
    private function add(string $token, ?FakeAuthenticator $d = null): FakeAuthenticator
    {
        $d ??= $this->pk();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options');
        $q->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone'])->assertStatus(201);

        return $d;
    }

    private function prove(string $token, FakeAuthenticator $d): void
    {
        $q = $this->as($token)->postJson('/api/auth/passkeys/prove/options');
        $q->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))])->assertOk();
    }

    private function probe(string $token)
    {
        return $this->as($token)->getJson('/api/_probe');
    }

    private function yesterday(): string
    {
        return now()->subDay()->toDateString();
    }

    private function tomorrow(): string
    {
        return now()->addDays(10)->toDateString();
    }

    // ------------------------------------------------------------ nothing happens until someone switches it on

    public function test_it_is_off_by_default_and_nobody_is_held(): void
    {
        $token = $this->openSession($this->person('admin'));
        $this->probe($token)->assertOk();
        $this->as($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.mode', 'off')->assertJsonPath('security.gate', null);
    }

    public function test_the_emergency_switch_in_the_servers_settings_puts_the_rule_to_sleep(): void
    {
        $this->rule('enforce', $this->yesterday(), ['security.policy.kill_switch' => true]);
        $this->probe($this->openSession($this->person('admin')))->assertOk();
    }

    public function test_an_unknown_mode_is_the_same_as_off(): void
    {
        $this->rule('banana', $this->yesterday());
        $this->probe($this->openSession($this->person('admin')))->assertOk();
    }

    // ------------------------------------------------------------ who it is for

    public function test_it_is_for_staff_with_the_named_roles_or_permissions_and_nobody_else(): void
    {
        $this->rule('enforce', $this->yesterday());
        foreach (['admin' => 403, 'finance' => 403, 'senior_accountant' => 403, 'cashier' => 200, 'logistics' => 200, 'sales_rep' => 200, 'customer' => 200] as $role => $expect) {
            $this->probe($this->openSession($this->person($role)))->assertStatus($expect);
        }
    }

    public function test_the_rule_follows_the_settings_not_a_fixed_list(): void
    {
        $this->rule('enforce', $this->yesterday(), ['security.policy.passkeys.roles' => ['logistics'], 'security.policy.passkeys.permissions' => []]);
        $this->probe($this->openSession($this->person('logistics')))->assertStatus(403);
        $this->probe($this->openSession($this->person('admin')))->assertOk();
    }

    public function test_the_rule_is_for_staff_even_if_a_portal_role_is_named(): void
    {
        $this->rule('enforce', $this->yesterday(), ['security.policy.passkeys.roles' => ['customer', 'admin']]);
        $this->probe($this->openSession($this->person('customer')))->assertOk();
        $this->probe($this->openSession($this->person('admin')))->assertStatus(403);
    }

    public function test_a_screen_value_beats_the_default(): void
    {
        $this->rule('off');
        app(SecuritySettings::class)->set('passkeys.mode', 'enforce', null);
        app(SecuritySettings::class)->set('passkeys.enforce_from', $this->yesterday(), null);
        $this->assertSame('enforce', app(PasskeyPolicy::class)->mode());
        $this->probe($this->openSession($this->person('admin')))->assertStatus(403);
    }

    // ------------------------------------------------------------ the grace period

    public function test_before_the_date_people_are_only_reminded(): void
    {
        $this->rule('enforce', $this->tomorrow());
        $token = $this->openSession($this->person('admin'));
        $this->probe($token)->assertOk();
        $me = $this->as($token)->getJson('/api/auth/me')->assertOk();
        $me->assertJsonPath('security.phase', 'grace')->assertJsonPath('security.gate', null)->assertJsonPath('security.applies', true);
        $this->assertContains($me->json('security.days_left'), [9, 10]);
    }

    public function test_enforce_with_no_date_only_reminds(): void
    {
        $this->rule('enforce', null);
        $this->probe($this->openSession($this->person('admin')))->assertOk();
    }

    public function test_a_date_that_is_not_a_date_only_reminds(): void
    {
        $this->rule('enforce', 'next-week-ish');
        $this->probe($this->openSession($this->person('admin')))->assertOk();
    }

    public function test_the_date_itself_is_the_first_day_of_the_rule(): void
    {
        $this->rule('enforce', now()->toDateString());
        $this->probe($this->openSession($this->person('admin')))->assertStatus(403);
    }

    // ------------------------------------------------------------ log mode

    public function test_log_mode_stops_nobody_but_writes_one_line_per_session(): void
    {
        $this->rule('log', $this->yesterday());
        $token = $this->openSession($this->person('admin'));
        $this->probe($token)->assertOk();
        $this->probe($token)->assertOk();
        $this->probe($token)->assertOk();
        $this->assertSame(1, SecurityEvent::where('event', 'passkey_policy_would_restrict')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'passkey_policy_restricted')->count());
        $this->probe($this->openSession($this->person('customer')))->assertOk();
        $this->assertSame(1, SecurityEvent::where('event', 'passkey_policy_would_restrict')->count());
    }

    public function test_log_mode_tells_the_page_nothing_is_holding_the_person(): void
    {
        $this->rule('log', $this->yesterday());
        $token = $this->openSession($this->person('admin'));
        $this->as($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.mode', 'log')->assertJsonPath('security.gate', null)->assertJsonPath('security.would_gate', 'passkey_missing');
        $this->rule('enforce', $this->yesterday());
        $this->as($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', 'passkey_missing')->assertJsonPath('security.would_gate', 'passkey_missing');
    }

    // ------------------------------------------------------------ enforce: the restricted session

    public function test_without_a_passkey_the_session_can_only_add_one(): void
    {
        $this->rule('enforce', $this->yesterday());
        $token = $this->openSession($this->person('admin'));

        $r = $this->probe($token);
        $r->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
        $this->assertSame(1, SecurityEvent::where('event', 'passkey_policy_restricted')->count());

        // the way out stays open
        $this->as($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', 'passkey_missing');
        $this->as($token)->getJson('/api/auth/passkeys')->assertOk();
        $this->as($token)->getJson('/api/auth/sessions')->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertOk();

        // adding one lifts it at once
        $this->add($token);
        $this->probe($token)->assertOk();
        $this->as($token)->getJson('/api/auth/me')->assertJsonPath('security.gate', null)->assertJsonPath('security.phase', 'met');
    }

    public function test_the_restricted_session_can_sign_out(): void
    {
        $this->rule('enforce', $this->yesterday());
        $token = $this->openSession($this->person('admin'));
        $this->as($token)->postJson('/api/auth/logout')->assertOk();
    }

    public function test_a_restricted_session_does_not_reach_the_owners_security_settings(): void
    {
        $this->rule('enforce', $this->yesterday());
        $token = $this->openSession($this->person('super_admin'));
        $this->as($token)->getJson('/api/security/policy')->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
    }

    public function test_a_password_session_of_someone_with_a_passkey_must_use_it_once(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin');
        $first = $this->openSession($u);
        $device = $this->add($first);            // (this session is strong now)
        $second = $this->openSession($u);         // later, on a password alone
        $this->probe($second)->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_needed');
        $this->prove($second, $device);
        $this->probe($second)->assertOk();
    }

    public function test_a_session_opened_with_a_passkey_is_never_held(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin');
        $this->add($this->openSession($u));
        $cred = AuthCredential::where('user_id', $u->id)->first();
        $this->probe($this->openSession($u, 'passkey', $cred->id, 2))->assertOk();
    }

    public function test_a_session_after_a_password_reset_is_still_held(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin');
        $this->add($this->openSession($u));
        $this->probe($this->openSession($u, 'reset'))->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_needed');
    }

    public function test_a_switched_off_passkey_does_not_count(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin');
        $this->add($token = $this->openSession($u));
        AuthCredential::where('user_id', $u->id)->update(['disabled_at' => now(), 'disabled_reason' => 'clone_suspected']);
        $this->probe($token)->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
    }

    public function test_a_removed_passkey_does_not_count(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin');
        $this->add($token = $this->openSession($u));
        AuthCredential::where('user_id', $u->id)->update(['revoked_at' => now()]);
        $this->probe($token)->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
    }

    public function test_someone_elses_passkey_does_not_count(): void
    {
        $this->rule('enforce', $this->yesterday());
        $this->add($this->openSession($this->person('admin')));
        $this->probe($this->openSession($this->person('admin')))->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
    }

    // ------------------------------------------------------------ the owner needs two devices tied to the device

    public function test_the_owner_needs_two_passkeys(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('super_admin');
        $token = $this->openSession($u);
        $first = $this->add($token);
        $this->probe($token)->assertStatus(403)->assertJsonPath('restricted.reason', 'second_missing')->assertJsonPath('restricted.needs', 2);
        $this->as($token)->getJson('/api/auth/me')->assertJsonPath('security.passkeys', 1)->assertJsonPath('security.needs', 2);
        $this->add($token, $this->pk());
        $this->probe($token)->assertOk();
    }

    public function test_a_copied_to_the_cloud_passkey_does_not_count_for_the_owner(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('super_admin');
        $token = $this->openSession($u);
        $this->add($token, $this->pk(['backupEligible' => true]));
        $this->add($token, $this->pk(['backupEligible' => true]));
        $this->probe($token)->assertStatus(403)->assertJsonPath('restricted.reason', 'device_bound_missing');
        $this->add($token, $this->pk());            // one tied to the device
        $this->probe($token)->assertStatus(403)->assertJsonPath('restricted.reason', 'device_bound_missing');
        $this->add($token, $this->pk());            // a second one tied to the device
        $this->probe($token)->assertOk();
    }

    public function test_the_owner_can_allow_cloud_passkeys(): void
    {
        $this->rule('enforce', $this->yesterday(), ['security.policy.passkeys.owner_device_bound' => false]);
        $token = $this->openSession($this->person('super_admin'));
        $this->add($token, $this->pk(['backupEligible' => true]));
        $this->add($token, $this->pk(['backupEligible' => true]));
        $this->probe($token)->assertOk();
    }

    public function test_an_admin_needs_one_and_it_may_be_synced(): void
    {
        $this->rule('enforce', $this->yesterday());
        $token = $this->openSession($this->person('admin'));
        $this->add($token, $this->pk(['backupEligible' => true]));
        $this->probe($token)->assertOk();
    }

    // ------------------------------------------------------------ the answer a sign-in gives

    public function test_signing_in_by_password_says_where_the_person_stands(): void
    {
        $this->rule('enforce', $this->yesterday());
        $u = $this->person('admin', 'boss@example.com');
        $r = $this->postJson('/api/auth/login', ['email' => 'boss@example.com', 'password' => 'Right-password-1']);
        $r->assertOk()->assertJsonPath('security.gate', 'passkey_missing')->assertJsonPath('security.phase', 'due');
    }

    public function test_a_customer_is_told_the_rule_is_not_for_them(): void
    {
        $this->rule('enforce', $this->yesterday());
        $this->person('customer', 'shopper@example.com');
        $this->postJson('/api/auth/login', ['email' => 'shopper@example.com', 'password' => 'Right-password-1'])->assertOk()->assertJsonPath('security.applies', false)->assertJsonPath('security.gate', null);
    }

    public function test_with_the_rule_off_the_sign_in_answer_is_quiet(): void
    {
        $this->person('admin', 'boss@example.com');
        $this->postJson('/api/auth/login', ['email' => 'boss@example.com', 'password' => 'Right-password-1'])->assertOk()->assertJsonPath('security.mode', 'off');
    }
}
