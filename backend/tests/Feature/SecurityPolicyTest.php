<?php

namespace Tests\Feature;

use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** The owner's page for the passkey rule: seeing it, changing it, and the two safeguards (never lock yourself out; make it deliberate). */
class SecurityPolicyTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]]]);
        config(['security.policy.passkeys.mode' => 'off', 'security.policy.passkeys.enforce_from' => null]);
        SecuritySettings::forget();
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

    private function person(string $role, ?string $name = null): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name ?? ucfirst($role).(++$n), 'email' => $role.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
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

    private function add(string $token, ?FakeAuthenticator $d = null): FakeAuthenticator
    {
        $d ??= new FakeAuthenticator();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options');
        $q->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone'])->assertStatus(201);

        return $d;
    }

    private function save(string $token, array $body)
    {
        return $this->as($token)->putJson('/api/admin/security-policy', $body);
    }

    private function today(): string
    {
        return now()->toDateString();
    }

    // ------------------------------------------------------------ who may see and change it

    public function test_an_admin_can_see_the_rule_but_not_change_it(): void
    {
        $token = $this->openSession($this->person('admin'));
        $this->as($token)->getJson('/api/admin/security-policy')->assertOk()->assertJsonPath('ready', true)->assertJsonPath('settings.mode', 'off');
        $this->save($token, ['mode' => 'log'])->assertStatus(403);
        $this->assertSame('off', config('security.policy.passkeys.mode'));
        $this->assertSame(0, \DB::table('security_settings')->count());
    }

    public function test_someone_without_security_access_sees_nothing(): void
    {
        $token = $this->openSession($this->person('sales_rep'));
        $this->as($token)->getJson('/api/admin/security-policy')->assertStatus(403);
        $this->save($token, ['mode' => 'log'])->assertStatus(403);
    }

    public function test_the_routes_are_guarded_by_their_permissions(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/admin/security-policy'));
        $this->assertCount(2, $routes);
        foreach ($routes as $r) {
            $this->assertContains(in_array('GET', $r->methods()) ? 'permission:security.view' : 'permission:security.manage', $r->gatherMiddleware(), $r->uri());
        }
    }

    // ------------------------------------------------------------ changing it

    public function test_the_owner_can_turn_on_log_mode_and_the_change_is_written_down(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $this->save($token, ['mode' => 'log', 'enforce_from' => '2026-12-01', 'roles' => ['finance'], 'permissions' => ['payroll.run'], 'owner_device_bound' => false])
            ->assertOk()->assertJsonPath('settings.mode', 'log')->assertJsonPath('settings.enforce_from', '2026-12-01')->assertJsonPath('settings.roles', ['finance'])->assertJsonPath('settings.owner_device_bound', false);
        $this->assertSame('log', app(SecuritySettings::class)->get('passkeys.mode'));
        $e = SecurityEvent::where('event', 'passkey_policy_changed')->first();
        $this->assertNotNull($e);
        $this->assertSame('off', $e->detail['before']['mode']);
        $this->assertSame('log', $e->detail['after']['mode']);
        $this->assertSame($owner->id, \DB::table('security_settings')->where('setting_key', 'passkeys.mode')->value('updated_by_id'));
    }

    public function test_a_change_that_leaves_a_list_out_leaves_that_list_as_it_was(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'log', 'roles' => ['finance']])->assertOk();
        $this->save($token, ['mode' => 'off'])->assertOk()->assertJsonPath('settings.roles', ['finance']);
    }

    public function test_saving_twice_updates_the_same_row(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'log'])->assertOk();
        $this->save($token, ['mode' => 'off'])->assertOk();
        $this->assertSame(1, \DB::table('security_settings')->where('setting_key', 'passkeys.mode')->count());
        $this->assertSame('off', app(SecuritySettings::class)->get('passkeys.mode'));
    }

    public function test_the_values_are_checked(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'maybe'])->assertStatus(422);
        $this->save($token, ['mode' => 'enforce'])->assertStatus(422)->assertJsonValidationErrors('enforce_from');
        $this->save($token, ['mode' => 'log', 'enforce_from' => 'soon'])->assertStatus(422)->assertJsonValidationErrors('enforce_from');
        $this->save($token, ['mode' => 'log', 'roles' => ['no_such_role']])->assertStatus(422)->assertJsonValidationErrors('roles.0');
        $this->save($token, ['mode' => 'log', 'permissions' => ['no.such.permission']])->assertStatus(422)->assertJsonValidationErrors('permissions.0');
        $this->save($token, ['mode' => 'log', 'owner_roles' => ['no_such_role']])->assertStatus(422)->assertJsonValidationErrors('owner_roles.0');
        $this->assertSame(0, \DB::table('security_settings')->count());
    }

    // ------------------------------------------------------------ the two safeguards

    public function test_the_owner_can_not_turn_it_on_for_themselves_before_they_have_their_own_passkeys(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'enforce', 'enforce_from' => $this->today(), 'confirm' => true])->assertStatus(422)->assertJsonPath('reason', 'would_lock_you_out')->assertJsonPath('gate', 'passkey_missing');
        $this->assertSame('off', app(SecuritySettings::class)->get('passkeys.mode'));
        $this->assertSame(0, \DB::table('security_settings')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'passkey_policy_changed')->count());
        // and the page still works: nothing was half-saved
        $this->as($token)->getJson('/api/admin/security-policy')->assertOk();
    }

    public function test_a_future_date_does_not_lock_anyone_out_yet(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'enforce', 'enforce_from' => now()->addDays(30)->toDateString(), 'confirm' => true])->assertOk()->assertJsonPath('settings.mode', 'enforce');
    }

    public function test_the_owner_with_their_passkeys_must_still_say_yes_when_others_have_not_added_theirs(): void
    {
        $owner = $this->person('super_admin');
        $token = $this->openSession($owner);
        $this->add($token);
        $this->add($token);
        $this->person('admin');
        $this->person('admin');

        $r = $this->save($token, ['mode' => 'enforce', 'enforce_from' => $this->today()]);
        $r->assertStatus(422)->assertJsonPath('reason', 'confirm_needed')->assertJsonPath('missing', 2);
        $this->assertSame('off', app(SecuritySettings::class)->get('passkeys.mode'));

        $this->save($token, ['mode' => 'enforce', 'enforce_from' => $this->today(), 'confirm' => true])->assertOk()->assertJsonPath('settings.mode', 'enforce')->assertJsonPath('roster.summary.missing', 2);
        // it is in force now: the owner (who has done what it asks) carries on, an admin without a passkey does not
        $this->as($token)->getJson('/api/admin/security-policy')->assertOk();
        $adminToken = $this->openSession(User::where('role', 'admin')->first());
        $this->as($adminToken)->getJson('/api/admin/security-policy')->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_missing');
    }

    public function test_with_nobody_else_to_chase_no_confirmation_is_asked_for(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->add($token);
        $this->add($token);
        $this->save($token, ['mode' => 'enforce', 'enforce_from' => $this->today()])->assertOk();
    }

    public function test_the_owner_signed_in_by_password_alone_is_asked_to_use_their_passkey_first(): void
    {
        $owner = $this->person('super_admin');
        $first = $this->openSession($owner);
        $this->add($first);
        $this->add($first);
        $second = $this->openSession($owner);      // a later sign-in on the password alone
        $this->save($second, ['mode' => 'enforce', 'enforce_from' => $this->today(), 'confirm' => true])->assertStatus(422)->assertJsonPath('gate', 'passkey_needed');
    }

    // ------------------------------------------------------------ the list of staff

    public function test_the_list_says_who_has_added_a_passkey_and_who_still_has_to(): void
    {
        $owner = $this->person('super_admin', 'The Owner');
        $token = $this->openSession($owner);
        $this->add($token);
        $withOne = $this->person('admin', 'Has One');
        $this->add($this->openSession($withOne));
        $this->person('admin', 'Has None');
        $this->person('logistics', 'Till Person');
        $this->person('customer', 'A Shopper');

        $roster = $this->as($token)->getJson('/api/admin/security-policy')->assertOk()->json('roster');
        $names = array_column($roster['people'], null, 'name');
        $this->assertArrayNotHasKey('A Shopper', $names);          // not staff
        $this->assertTrue($names['Has One']['met']);
        $this->assertSame(1, $names['Has One']['passkeys']);
        $this->assertFalse($names['Has None']['met']);
        $this->assertTrue($names['Has None']['applies']);
        $this->assertFalse($names['Till Person']['applies']);       // the rule is not for logistics
        $this->assertSame(2, $names['The Owner']['needs']);
        $this->assertFalse($names['The Owner']['met']);             // the owner has only one
        $this->assertSame(['staff' => 4, 'applies' => 3, 'met' => 1, 'missing' => 2, 'with_passkey' => 2], $roster['summary']);
    }

    public function test_the_list_does_not_count_a_removed_or_switched_off_passkey(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $p = $this->person('admin', 'Gone');
        $this->add($this->openSession($p));
        \DB::table('auth_credentials')->where('user_id', $p->id)->update(['revoked_at' => now()]);
        $names = array_column($this->as($token)->getJson('/api/admin/security-policy')->json('roster.people'), null, 'name');
        $this->assertSame(0, $names['Gone']['passkeys']);
        $this->assertFalse($names['Gone']['met']);

        $q = $this->person('admin', 'Copied');
        $this->add($this->openSession($q));
        \DB::table('auth_credentials')->where('user_id', $q->id)->update(['disabled_at' => now(), 'disabled_reason' => 'clone_suspected']);
        $names = array_column($this->as($token)->getJson('/api/admin/security-policy')->json('roster.people'), null, 'name');
        $this->assertSame(0, $names['Copied']['passkeys']);
        $this->assertFalse($names['Copied']['met']);
    }

    public function test_a_list_saved_with_repeats_is_kept_once(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $this->save($token, ['mode' => 'log', 'roles' => ['finance', 'finance', 'admin'], 'permissions' => ['payroll.run', 'payroll.run']])->assertOk()
            ->assertJsonPath('settings.roles', ['finance', 'admin'])->assertJsonPath('settings.permissions', ['payroll.run']);
    }

    public function test_the_page_offers_the_roles_and_permissions_to_choose_from(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        $choices = $this->as($token)->getJson('/api/admin/security-policy')->json('choices');
        $this->assertContains('finance', array_column($choices['roles'], 'key'));
        $this->assertNotContains('customer', array_column($choices['roles'], 'key'));
        $this->assertContains('payroll.run', array_column($choices['permissions'], 'key'));
    }

    public function test_the_emergency_switch_is_shown_on_the_page(): void
    {
        config(['security.policy.kill_switch' => true]);
        app(SecuritySettings::class)->set('passkeys.mode', 'enforce', null);
        $token = $this->openSession($this->person('super_admin'));
        $this->as($token)->getJson('/api/admin/security-policy')->assertOk()->assertJsonPath('kill_switch', true)->assertJsonPath('mode', 'off')->assertJsonPath('settings.mode', 'enforce');
    }

    // ------------------------------------------------------------ before the script is run

    public function test_before_script_125_the_page_says_so_and_nothing_can_be_saved(): void
    {
        $token = $this->openSession($this->person('super_admin'));
        Schema::drop('security_settings');
        SecuritySettings::forget();
        $this->as($token)->getJson('/api/admin/security-policy')->assertOk()->assertJsonPath('ready', false)->assertJsonPath('roster', null);
        $this->save($token, ['mode' => 'log'])->assertStatus(409);
    }
}
