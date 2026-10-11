<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\Security\AuthRecoveryRequest;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\AssistedRecovery;
use App\Services\Security\RecoveryCodes;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\SignInReset;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** "Reset sign-in methods": an administrator takes away every passkey, recovery code and sign-in of a person (not their password); for staff the passkey rule is for, it waits a day first. */
class SignInResetTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    /** @var array<int, array{to: int, type: string, title: string, message: string, options: array}> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]], 'security.rate_limits.step_up' => ['user' => [[1000, 15]]],
            'security.rate_limits.reset' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]],
            'security.policy.kill_switch' => false, 'security.stepup.password_fallback' => true, 'security.recovery.cooling_hours' => 24,
            'security.policy.passkeys.mode' => 'off', 'security.policy.passkeys.roles' => ['admin', 'finance', 'super_admin'], 'security.policy.passkeys.permissions' => []]);
        foreach (['signin_reset'] as $r) {
            config(["security.policy.stepup.{$r}.mode" => 'off', "security.policy.stepup.{$r}.two" => 'off']);
        }
        SecuritySettings::forget();
        AssistedRecovery::forget();
        $test = $this;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($test) extends \App\Services\Notify\Notifier {
            public function __construct(private $test) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->test->record(['to' => $to->getKey(), 'type' => $type, 'title' => $title, 'message' => $message, 'options' => $o]);

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
    }

    public function record(array $m): void
    {
        $this->sent[] = $m;
    }

    /** @return array<int, array{to: int, type: string, title: string, message: string, options: array}> */
    private function ofType(string $type): array
    {
        return array_values(array_filter($this->sent, fn ($m) => $m['type'] === $type));
    }

    private function person(string $role, string $name = 'Someone'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'x'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function signIn(User $u): string
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

    private function passkey(User $u): AuthCredential
    {
        static $n = 0;

        return AuthCredential::forceCreate(['user_id' => $u->id, 'credential_hash' => hash('sha256', 'z'.(++$n)), 'credential_id' => 'z'.$n, 'public_key' => 'k', 'user_handle' => 'h', 'name' => 'Phone '.$n, 'counter' => 0]);
    }

    private function reset(string $token, User $target, ?string $reason = 'Their phone was lost and they have no codes')
    {
        return $this->as($token)->postJson("/api/admin/users/{$target->id}/reset-signin-methods", $reason === null ? [] : ['reason' => $reason]);
    }

    /** A person with two passkeys, recovery codes and two sign-ins. */
    private function furnished(string $role, string $name): User
    {
        $u = $this->person($role, $name);
        $this->passkey($u);
        $this->passkey($u);
        app(RecoveryCodes::class)->generate($u);
        $this->signIn($u);
        $this->signIn($u);

        return $u;
    }

    // ------------------------------------------------------------ at once, for everyone the rule is not for

    public function test_for_someone_the_rule_is_not_for_it_happens_at_once_and_takes_everything_but_the_password(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $to = $this->signIn($owner);
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $other = $this->furnished('logistics', 'Other Person');

        $r = $this->reset($to, $rep)->assertOk();
        $r->assertJsonPath('done', true)->assertJsonPath('summary.passkeys_removed', 2)->assertJsonPath('summary.codes_revoked', 10)->assertJsonPath('summary.sessions_ended', 2);
        $this->assertSame(0, AuthCredential::where('user_id', $rep->id)->whereNull('revoked_at')->count());
        $this->assertSame(2, AuthCredential::where('user_id', $rep->id)->where('revoked_reason', 'reset')->where('revoked_by_id', $owner->id)->count());
        $this->assertSame(0, AuthRecoveryCode::where('user_id', $rep->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertSame(0, $rep->tokens()->count());
        $this->assertTrue(Hash::check('Right-password-1', $rep->fresh()->password));                // the password is not touched
        $this->assertFalse((bool) $rep->fresh()->force_password_change);
        // and nobody else's
        $this->assertSame(2, AuthCredential::where('user_id', $other->id)->whereNull('revoked_at')->count());
        $this->assertSame(10, AuthRecoveryCode::where('user_id', $other->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertSame(2, $other->tokens()->count());
        $this->assertSame(0, AuthRecoveryRequest::count());                                        // (nothing to wait for: no request is kept)
    }

    public function test_it_is_written_down_as_an_alert_and_the_person_is_told(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $to = $this->signIn($owner);
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $this->reset($to, $rep, 'Phone stolen')->assertOk();
        $e = SecurityEvent::where('event', 'signin_methods_reset')->first();
        $this->assertSame('alert', $e->severity);
        $this->assertSame($rep->id, $e->subject_id);
        $this->assertSame($owner->id, $e->detail['by']);
        $this->assertSame('Phone stolen', $e->detail['reason']);
        $this->assertSame(2, $e->detail['passkeys_removed']);
        $this->assertFalse($e->detail['waited']);
        $told = $this->ofType('signin_methods_reset');
        $this->assertCount(1, $told);
        $this->assertSame($rep->id, $told[0]['to']);
        $this->assertStringContainsString('Olive Owner reset', $told[0]['message']);
        $this->assertStringContainsString('2 passkeys were taken away', $told[0]['message']);
        $this->assertStringContainsString('Your password was not changed', $told[0]['message']);
        $this->assertStringContainsString('This was not me', $told[0]['options']['action_text']);
    }

    public function test_customers_are_reset_at_once_too_and_without_any_question(): void
    {
        config(['security.policy.stepup.signin_reset.mode' => 'enforce']);
        SecuritySettings::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $customer = $this->furnished('customer', 'Carol Customer');
        $this->reset($to, $customer)->assertOk()->assertJsonPath('done', true);                    // (a customer's account is not a staff account: nothing is held back)
        $this->assertSame(0, AuthCredential::where('user_id', $customer->id)->whereNull('revoked_at')->count());
    }

    public function test_it_works_without_the_waiting_day_script_for_those_who_do_not_wait(): void
    {
        Schema::drop('auth_recovery_approvals');
        AssistedRecovery::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $this->reset($to, $rep)->assertOk()->assertJsonPath('done', true);
    }

    // ------------------------------------------------------------ staff the rule is for wait a day

    public function test_for_staff_the_passkey_rule_is_for_it_waits_a_day_and_nothing_changes_meanwhile(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $to = $this->signIn($owner);
        $admin = $this->person('admin', 'Adam Admin');
        $fin = $this->furnished('finance', 'Fiona Finance');

        $r = $this->reset($to, $fin, 'She left her phone in a taxi')->assertOk();
        $r->assertJsonPath('done', false);
        $this->assertStringContainsString('unless somebody cancels it', $r->json('message'));
        $row = AuthRecoveryRequest::first();
        $this->assertSame('reset', $row->kind);
        $this->assertSame($fin->id, $row->user_id);
        $this->assertSame($owner->id, $row->asked_by_id);
        $this->assertSame('She left her phone in a taxi', $row->note);
        $this->assertSame(0, $row->needed);
        $this->assertEqualsWithDelta(24 * 3600, now()->diffInSeconds($row->release_at, false), 5);
        $this->assertSame($r->json('request'), $row->id);
        $this->assertSame('cooling', $row->state());
        // nothing has happened to her yet
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());
        $this->assertSame(10, AuthRecoveryCode::where('user_id', $fin->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertSame(2, $fin->tokens()->count());
        $this->assertSame(0, SecurityEvent::where('event', 'signin_methods_reset')->count());
        $e = SecurityEvent::where('event', 'signin_reset_asked')->first();
        $this->assertSame('warning', $e->severity);
        $this->assertSame($owner->id, $e->detail['by']);
        // she is told, with the button that stops it; the other administrators are told too
        $own = $this->ofType('signin_reset_asked');
        $this->assertCount(1, $own);
        $this->assertSame($fin->id, $own[0]['to']);
        $this->assertStringContainsString('Olive Owner asked to take away all your passkeys', $own[0]['message']);
        $this->assertStringContainsString('She left her phone in a taxi', $own[0]['message']);
        $this->assertStringContainsString('Nothing changes until', $own[0]['message']);
        $this->assertStringContainsString('This was not me', $own[0]['options']['action_text']);
        $others = $this->ofType('signin_reset_asked_other');
        $this->assertContains($admin->id, array_column($others, 'to'));
        $this->assertSame('/admin/security/approvals?open='.AuthRecoveryRequest::where('kind', 'reset')->first()->id, $others[0]['options']['action_url'], 'opens that very request');
        $this->assertNotContains($owner->id, array_column($others, 'to'));                         // the one who asked knows
        $this->assertNotContains($fin->id, array_column($others, 'to'));
    }

    public function test_a_second_request_for_the_same_person_is_refused_while_one_waits(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk();
        $this->reset($to, $fin)->assertStatus(409)->assertJsonPath('reason', 'already_pending');
        $this->assertSame(1, AuthRecoveryRequest::count());
    }

    public function test_waiting_needs_script_130_and_says_so_instead_of_doing_it_at_once(): void
    {
        Schema::drop('auth_recovery_approvals');
        AssistedRecovery::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertStatus(409)->assertJsonPath('reason', 'not_ready');
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());   // never silently skipping the wait
    }

    public function test_a_server_with_the_wait_switched_off_does_it_at_once(): void
    {
        config(['security.recovery.cooling_hours' => 0]);
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk()->assertJsonPath('done', true);
    }

    public function test_the_rule_is_for_people_by_the_permissions_they_hold_too(): void
    {
        config(['security.policy.passkeys.roles' => [], 'security.policy.passkeys.permissions' => ['payroll.run']]);
        SecuritySettings::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $acc = $this->furnished('senior_accountant', 'Ann Accountant');                           // holds payroll.run
        $this->reset($to, $acc)->assertOk()->assertJsonPath('done', false);
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $this->reset($to, $rep)->assertOk()->assertJsonPath('done', true);
    }

    // ------------------------------------------------------------ the waiting day ends

    public function test_when_the_day_is_over_the_sweep_carries_it_out_once(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $to = $this->signIn($owner);
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin, 'Phone lost')->assertOk();

        $this->travel(23)->hours();
        $this->assertSame(0, Artisan::call('security:release-resets'));
        $this->assertStringContainsString('Nothing was due', Artisan::output());
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());

        $this->travel(2)->hours();
        $this->assertSame(0, Artisan::call('security:release-resets'));
        $this->assertStringContainsString('1 reset(s) carried out', Artisan::output());
        $this->assertSame(0, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->where('revoked_reason', 'reset')->count());
        $this->assertSame(0, AuthRecoveryCode::where('user_id', $fin->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertSame(0, $fin->tokens()->count());
        $this->assertTrue(Hash::check('Right-password-1', $fin->fresh()->password));
        $row = AuthRecoveryRequest::first();
        $this->assertNotNull($row->executed_at);
        $this->assertSame('done', $row->state());
        $admin = $this->person('admin', 'Adam Admin');                                              // and it is history: nobody is asked to look at it any more
        $this->assertCount(0, app(AssistedRecovery::class)->forApprover($admin));
        $e = SecurityEvent::where('event', 'signin_methods_reset')->first();
        $this->assertTrue($e->detail['waited']);
        $this->assertSame($owner->id, $e->detail['by']);
        $this->assertSame('Phone lost', $e->detail['reason']);
        $this->assertCount(1, $this->ofType('signin_methods_reset'));

        // it is done once
        $this->passkey($fin);
        $this->assertSame(0, Artisan::call('security:release-resets'));
        $this->assertSame(1, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());   // a passkey added afterwards stays
        $this->assertSame(1, SecurityEvent::where('event', 'signin_methods_reset')->count());
    }

    public function test_after_it_the_person_signs_in_with_the_password_and_may_add_a_passkey(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk();
        config(['security.policy.passkeys.mode' => 'enforce', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString()]);   // (the rule comes on afterwards)
        SecuritySettings::forget();
        $this->travel(25)->hours();
        $this->assertSame(0, Artisan::call('security:release-resets'));
        $t = $this->signIn($fin);                                                                  // the password still works
        $this->as($t)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', 'passkey_missing');   // and the rule asks for a new passkey
        $d = new FakeAuthenticator();
        $q = $this->as($t)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->as($t)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'New phone'])->assertStatus(201);
    }

    public function test_the_sweep_ignores_what_was_cancelled_and_what_is_not_due_and_a_person_who_is_gone(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $a = $this->furnished('finance', 'Fiona Finance');
        $b = $this->furnished('finance', 'Fred Finance');
        $c = $this->furnished('finance', 'Faith Finance');
        $this->reset($to, $a)->assertOk();
        $this->reset($to, $b)->assertOk();
        $this->reset($to, $c)->assertOk();
        AuthRecoveryRequest::where('user_id', $a->id)->update(['cancelled_at' => now(), 'cancelled_by' => 'link']);
        AuthRecoveryRequest::where('user_id', $c->id)->update(['release_at' => now()->addHours(30)]);
        User::where('id', $b->id)->update(['deleted_at' => now()]);
        $this->travel(25)->hours();
        $this->assertSame(0, app(SignInReset::class)->executeDue());
        $this->assertSame(2, AuthCredential::where('user_id', $a->id)->whereNull('revoked_at')->count());
        $this->assertSame(2, AuthCredential::where('user_id', $c->id)->whereNull('revoked_at')->count());
        User::withTrashed()->where('id', $b->id)->update(['deleted_at' => null]);
        $this->assertTrue(AuthRecoveryRequest::where('user_id', $b->id)->first()->alive());
        $this->assertSame(1, app(SignInReset::class)->executeDue());                              // (she is back, and her day is over)
        $this->assertSame(0, AuthCredential::where('user_id', $b->id)->whereNull('revoked_at')->count());
    }

    public function test_a_reset_that_runs_out_before_it_is_swept_is_not_carried_out(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk();
        $this->travel(24 + 24 * 8)->hours();                                                       // the sweep never ran, and a week went by
        $this->assertSame(0, app(SignInReset::class)->executeDue());
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());
        $this->assertSame('expired', AuthRecoveryRequest::first()->state());
    }

    public function test_a_request_for_help_the_person_had_open_is_moot_once_their_methods_are_reset(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $rep = $this->furnished('logistics', 'Lola Logistics');
        AuthRecoveryRequest::create(['id' => str_repeat('a', 40), 'user_id' => $rep->id, 'kind' => 'self', 'asked_by_id' => $rep->id, 'needed' => 2, 'expires_at' => now()->addDay()]);
        $this->reset($to, $rep)->assertOk();
        $row = AuthRecoveryRequest::find(str_repeat('a', 40));
        $this->assertSame('cancelled', $row->state());
        $this->assertSame('reset', $row->cancelled_by);
    }

    public function test_the_sweep_does_nothing_and_does_not_fail_before_script_130(): void
    {
        Schema::drop('auth_recovery_approvals');
        Schema::drop('auth_recovery_requests');
        AssistedRecovery::forget();
        $this->assertSame(0, Artisan::call('security:release-resets'));
        $this->assertStringContainsString('Nothing was due', Artisan::output());
    }

    public function test_the_sweep_is_scheduled(): void
    {
        $commands = collect(app(Schedule::class)->events())->map(fn ($e) => (string) $e->command)->implode(' | ');
        $this->assertStringContainsString('security:release-resets', $commands);
        $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains((string) $e->command, 'security:release-resets'));
        $this->assertSame('*/5 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    // ------------------------------------------------------------ stopping it

    public function test_the_person_can_stop_it_with_the_not_me_button(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk();
        parse_str(SecureAccountLink::query($fin), $q);
        $this->postJson('/api/auth/secure-account', $q)->assertOk();
        $this->assertSame('cancelled', AuthRecoveryRequest::first()->state());
        $this->assertSame('link', AuthRecoveryRequest::first()->cancelled_by);
        $this->travel(25)->hours();
        $this->assertSame(0, app(SignInReset::class)->executeDue());
        $this->assertSame(0, SecurityEvent::where('event', 'signin_methods_reset')->count());
    }

    public function test_the_person_can_stop_it_from_their_own_sign_in(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $id = $this->reset($to, $fin)->json('request');
        $tf = $this->signIn($fin);
        $this->as($tf)->deleteJson("/api/auth/recovery-requests/{$id}")->assertOk();
        $this->assertSame('cancelled', AuthRecoveryRequest::find($id)->state());
        $this->assertSame('person', AuthRecoveryRequest::find($id)->cancelled_by);
    }

    public function test_an_administrator_who_could_do_it_may_cancel_it_and_sees_it_listed(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $to = $this->signIn($owner);
        $fin = $this->furnished('finance', 'Fiona Finance');
        $admin = $this->person('admin', 'Adam Admin');
        $a = $this->furnished('admin', 'Alt Admin');
        AuthCredential::where('user_id', $a->id)->update(['created_at' => now()->subDays(3)]);
        $ta = app(Sessions::class)->issue($a, Request::create('/x', 'POST', [], [], [], ['REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'passkey', AuthCredential::where('user_id', $a->id)->first()->id, 2);
        config(['security.policy.passkeys.mode' => 'off']);
        $id = $this->reset($to, $fin)->json('request');

        $list = $this->as($ta)->getJson('/api/auth/recovery-approvals')->assertOk();
        $card = collect($list->json('data'))->firstWhere('id', $id);
        $this->assertSame('reset', $card['kind']);
        $this->assertSame('Olive Owner', $card['started_by']);
        $this->assertSame('cooling', $card['state']);
        $this->assertFalse($card['can_approve']);
        $this->assertTrue($card['can_cancel']);
        $this->assertSame('Fiona Finance', $card['person']['name']);
        $this->as($ta)->postJson("/api/auth/recovery-approvals/{$id}/cancel", ['reason' => 'She says she did not ask'])->assertOk();
        $this->assertSame('admin', AuthRecoveryRequest::find($id)->cancelled_by);
        $this->travel(25)->hours();
        $this->assertSame(0, app(SignInReset::class)->executeDue());
        $this->assertNotNull($admin);
    }

    public function test_the_person_it_is_for_never_sees_it_in_their_own_list_of_things_to_approve(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertOk();
        $this->assertSame(1, AuthRecoveryRequest::where('kind', 'reset')->count());
        $this->assertSame(0, AuthRecoveryRequest::where('kind', 'self')->count());
        // and it is not "their request for help": their own screen shows nothing open
        $this->assertNull(app(AssistedRecovery::class)->open($fin));
    }

    // ------------------------------------------------------------ who may, and how

    public function test_it_needs_a_reason(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $this->reset($to, $rep, null)->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->reset($to, $rep, 'ok')->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertSame(2, AuthCredential::where('user_id', $rep->id)->whereNull('revoked_at')->count());
    }

    public function test_nobody_can_reset_their_own(): void
    {
        $owner = $this->person('super_admin', 'Olive Owner');
        $this->passkey($owner);
        $to = $this->signIn($owner);
        $this->reset($to, $owner)->assertStatus(422)->assertJsonPath('reason', 'own_account');
        $this->assertSame(1, AuthCredential::where('user_id', $owner->id)->whereNull('revoked_at')->count());
    }

    public function test_someone_who_may_not_manage_that_account_can_not_do_it(): void
    {
        $rep = $this->person('logistics', 'Lola Logistics');
        $tr = $this->signIn($rep);
        $owner = $this->person('super_admin', 'Olive Owner');
        $this->passkey($owner);
        $this->reset($tr, $owner)->assertStatus(403);
        $this->assertSame(1, AuthCredential::where('user_id', $owner->id)->whereNull('revoked_at')->count());
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->assertContains($this->postJson("/api/admin/users/{$owner->id}/reset-signin-methods", ['reason' => 'Because'])->status(), [401, 403]);   // (nobody signed in)
    }

    public function test_a_password_reset_still_leaves_the_passkeys_alone(): void
    {
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $this->as($to)->postJson("/api/admin/users/{$rep->id}/reset-password", ['password' => 'Wq7!zXp4kLmN2v9#'])->assertOk();
        $this->assertSame(2, AuthCredential::where('user_id', $rep->id)->whereNull('revoked_at')->count());          // (the two actions are separate on purpose)
        $this->assertSame(10, AuthRecoveryCode::where('user_id', $rep->id)->whereNull('revoked_at')->whereNull('used_at')->count());
    }

    public function test_the_serious_action_question_comes_first_for_staff_and_not_for_customers(): void
    {
        config(['security.policy.stepup.signin_reset.mode' => 'enforce']);
        SecuritySettings::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $customer = $this->furnished('customer', 'Carol Customer');
        $r = $this->reset($to, $fin)->assertStatus(403)->assertJsonPath('step_up.rule', 'signin_reset');
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringContainsString('Fiona Finance', $facts['Whose sign-in']);
        $this->assertStringContainsString('Take away ALL their passkeys and recovery codes', $facts['Change']);
        $this->assertStringContainsString('after a waiting day', $facts['Change']);
        $this->assertStringContainsString('their password stays', $facts['Change']);
        $this->assertSame(0, AuthRecoveryRequest::count());
        $this->assertSame(2, AuthCredential::where('user_id', $fin->id)->whereNull('revoked_at')->count());
        $this->reset($to, $customer)->assertOk();
    }

    public function test_the_question_for_a_person_who_does_not_wait_does_not_promise_a_wait(): void
    {
        config(['security.policy.stepup.signin_reset.mode' => 'enforce']);
        SecuritySettings::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $rep = $this->furnished('logistics', 'Lola Logistics');
        $r = $this->reset($to, $rep)->assertStatus(403);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringNotContainsString('waiting day', $facts['Change']);
    }

    public function test_it_is_one_of_the_two_person_actions(): void
    {
        config(['security.policy.stepup.signin_reset.mode' => 'enforce', 'security.policy.stepup.signin_reset.two' => 'enforce']);
        SecuritySettings::forget();
        $to = $this->signIn($this->person('super_admin', 'Olive Owner'));
        $fin = $this->furnished('finance', 'Fiona Finance');
        $this->reset($to, $fin)->assertStatus(403)->assertJsonPath('step_up.will_need_second', true);
    }
}
