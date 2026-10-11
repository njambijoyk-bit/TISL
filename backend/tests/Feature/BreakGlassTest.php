<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Notify\Staff;
use App\Services\Security\RecoveryCodes;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The owner's last way back in, the server command: what it ends, what it makes, who is told, and that it never prints or stores what it should not. */
class BreakGlassTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    /** @var array<int, array{to: int, type: string, title: string, message: string, options: array}> */
    private array $sent = [];

    private bool $failing = false;

    /** @var User[] */
    private array $managers = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        $test = $this;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($test) extends \App\Services\Notify\Notifier {
            public function __construct(private $test) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                if ($this->test->isFailing()) {
                    throw new \RuntimeException('the mail server is down');
                }
                $this->test->record(['to' => $to->getKey(), 'type' => $type, 'title' => $title, 'message' => $message, 'options' => $o]);

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->app->instance(Staff::class, new class($test) extends Staff {
            public function __construct(private $test) {}

            public function holding(string $permission): \Illuminate\Support\Collection
            {
                return $permission === 'security.manage' ? collect($this->test->managers()) : collect();
            }
        });
    }

    public function record(array $m): void
    {
        $this->sent[] = $m;
    }

    public function isFailing(): bool
    {
        return $this->failing;
    }

    /** @return User[] */
    public function managers(): array
    {
        return $this->managers;
    }

    private function ofType(string $type): array
    {
        return array_values(array_filter($this->sent, fn ($m) => $m['type'] === $type));
    }

    private function person(string $role = 'super_admin', string $name = 'Olive Owner'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'owner'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function openSession(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    private function passkey(User $u): AuthCredential
    {
        static $n = 0;

        return AuthCredential::forceCreate(['user_id' => $u->id, 'credential_hash' => hash('sha256', 'b'.(++$n)), 'credential_id' => 'b'.$n, 'public_key' => 'k', 'user_handle' => 'h', 'name' => 'Key '.$n, 'counter' => 0]);
    }

    private function recover(User $u, array $options = ['--yes' => true]): int
    {
        return Artisan::call('security:recover', ['email' => $u->email] + $options);
    }

    // ------------------------------------------------------------ the command asks first, and refuses what it can not do

    public function test_an_unknown_email_changes_nothing_and_says_so(): void
    {
        $this->assertSame(1, Artisan::call('security:recover', ['email' => 'nobody@example.com', '--yes' => true]));
        $this->assertStringContainsString('no account with that email', Artisan::output());
        $this->assertSame(0, SecurityEvent::where('event', 'break_glass_used')->count());
        $this->assertSame([], $this->sent);
    }

    public function test_the_email_is_found_whatever_its_case_or_spaces(): void
    {
        $u = $this->person();
        $this->assertSame(0, Artisan::call('security:recover', ['email' => '  '.strtoupper($u->email).' ', '--yes' => true]));
        $this->assertSame(1, SecurityEvent::where('event', 'break_glass_used')->count());
    }

    public function test_without_a_yes_it_asks_and_a_no_changes_nothing(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $this->passkey($u);
        $this->artisan('security:recover', ['email' => $u->email])->expectsConfirmation('Go ahead?', 'no')->expectsOutputToContain('Nothing was changed')->assertExitCode(0);
        $this->assertSame(1, $u->tokens()->count());
        $this->assertSame(1, AuthCredential::where('user_id', $u->id)->whereNull('revoked_at')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'break_glass_used')->count());
        $this->assertSame([], $this->sent);
    }

    public function test_the_yes_option_goes_ahead_without_asking(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $this->artisan('security:recover', ['email' => $u->email, '--yes' => true])->assertExitCode(0);   // a question asked here would fail the test: nobody is there to answer it
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_a_yes_typed_at_the_question_goes_ahead(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $this->artisan('security:recover', ['email' => $u->email])->expectsConfirmation('Go ahead?', 'yes')->assertExitCode(0);
        $this->assertSame(0, $u->tokens()->count());
    }

    // ------------------------------------------------------------ what it does

    public function test_it_ends_every_sign_in_and_takes_away_the_passkeys_of_that_account_only(): void
    {
        $u = $this->person();
        $other = $this->person('admin', 'Someone Else');
        $t1 = $this->openSession($u);
        $this->openSession($u);
        $this->openSession($other);
        $mine = $this->passkey($u);
        $this->passkey($u);
        $theirs = $this->passkey($other);
        AuthCredential::where('id', $this->passkey($u)->id)->update(['revoked_at' => now()->subDay(), 'revoked_reason' => 'lost']);   // one already gone

        $this->assertSame(0, $this->recover($u));

        $this->assertSame(0, $u->tokens()->count());
        $this->assertSame(1, $other->tokens()->count());
        $this->assertSame(2, AuthSession::where('tokenable_id', $u->id)->where('revoked_reason', 'break_glass')->count());
        $this->assertNull(AuthSession::where('tokenable_id', $other->id)->first()->revoked_at);
        $this->assertNotNull($mine->fresh()->revoked_at);
        $this->assertSame('break_glass', $mine->fresh()->revoked_reason);
        $this->assertNull($theirs->fresh()->revoked_at);
        $this->assertSame(1, AuthCredential::where('user_id', $u->id)->where('revoked_reason', 'lost')->count());   // the earlier reason is not overwritten
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$t1)->getJson('/api/auth/me')->assertStatus(401);
        $this->assertStringContainsString('2 sign-in(s) ended, 2 passkey(s) taken away', Artisan::output());
    }

    public function test_it_can_leave_the_passkeys_alone(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $key = $this->passkey($u);
        $this->assertSame(0, $this->recover($u, ['--yes' => true, '--keep-passkeys' => true]));
        $this->assertNull($key->fresh()->revoked_at);
        $this->assertSame(0, $u->tokens()->count());
        $this->assertSame(0, SecurityEvent::where('event', 'break_glass_used')->first()->detail['passkeys_removed']);
        $this->assertTrue(SecurityEvent::where('event', 'break_glass_used')->first()->detail['kept_passkeys']);
    }

    public function test_it_makes_a_fresh_set_of_codes_that_work_and_ends_the_old_set(): void
    {
        $u = $this->person();
        $old = app(RecoveryCodes::class)->generate($u);
        $this->assertSame(0, $this->recover($u));
        $out = Artisan::output();
        preg_match_all('/^  ([A-Z0-9]{5}-[A-Z0-9]{5})$/m', $out, $m);
        $this->assertCount(10, $m[1]);
        $this->assertSame(10, AuthRecoveryCode::where('user_id', $u->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertTrue(app(RecoveryCodes::class)->consume($u, $m[1][0]));
        $this->assertFalse(app(RecoveryCodes::class)->consume($u, $old[0]));
        $this->assertStringContainsString('shown once', $out);
        foreach ($m[1] as $code) {                                                                // nothing readable is kept
            $this->assertSame(0, AuthRecoveryCode::where('code_hash', $code)->count());
            $this->assertStringNotContainsString($code, json_encode(SecurityEvent::all()->toArray()).json_encode($this->sent));
        }
    }

    public function test_a_temporary_password_can_be_set_and_must_be_changed(): void
    {
        $u = $this->person();
        $this->assertSame(0, $this->recover($u, ['--yes' => true, '--temporary-password' => true]));
        $this->assertSame(1, preg_match('/Temporary password \(shown once[^:]*\): (\S+)/', Artisan::output(), $m));
        $password = $m[1];
        $this->assertGreaterThanOrEqual(16, strlen($password));
        $u->refresh();
        $this->assertTrue(Hash::check($password, $u->password));
        $this->assertFalse(Hash::check('Right-password-1', $u->password));
        $this->assertTrue($u->force_password_change);
        $this->assertNotNull($u->password_changed_at);
        $logged = json_encode(SecurityEvent::all()->toArray()).json_encode($this->sent);
        $this->assertStringNotContainsString($password, $logged);                                  // never in the log or in anything sent
        $this->assertTrue(SecurityEvent::where('event', 'break_glass_used')->first()->detail['temporary_password']);

        $first = $password;
        $this->recover($u, ['--yes' => true, '--temporary-password' => true]);
        preg_match('/Temporary password \(shown once[^:]*\): (\S+)/', Artisan::output(), $m);
        $this->assertNotSame($first, $m[1]);
    }

    public function test_without_the_option_the_password_is_left_alone(): void
    {
        $u = $this->person();
        $this->recover($u);
        $this->assertTrue(Hash::check('Right-password-1', $u->fresh()->password));
        $this->assertFalse((bool) $u->fresh()->force_password_change);
        $this->assertStringNotContainsString('Temporary password', Artisan::output());
    }

    public function test_the_person_signs_in_with_the_temporary_password_chooses_a_new_one_and_a_code_still_works(): void
    {
        $u = $this->person();
        $this->recover($u, ['--yes' => true, '--temporary-password' => true]);
        $out = Artisan::output();
        preg_match('/Temporary password \(shown once[^:]*\): (\S+)/', $out, $p);
        preg_match_all('/^  ([A-Z0-9]{5}-[A-Z0-9]{5})$/m', $out, $c);
        config(['security.rate_limits.login' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]], 'email' => [[1000, 1]]], 'security.rate_limits.force' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]], 'security.rate_limits.recovery' => ['user' => [[1000, 15]]]]);
        $this->postJson('/api/auth/login', ['email' => $u->email, 'password' => $p[1]])->assertStatus(403)->assertJsonPath('force_password_change', true);
        $r = $this->postJson('/api/auth/force-change-password', ['email' => $u->email, 'current_password' => $p[1], 'new_password' => 'Wq7!zXp4kLmN2v9#', 'new_password_confirmation' => 'Wq7!zXp4kLmN2v9#'])->assertOk();
        $token = $r->json('token');
        $this->assertNotEmpty($token);
        $this->assertFalse((bool) $u->fresh()->force_password_change);
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/recovery-codes/use', ['code' => $c[1][0]])->assertOk();
    }

    // ------------------------------------------------------------ the record and who is told

    public function test_it_is_written_down_as_an_alert_with_what_was_done(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $this->passkey($u);
        $this->recover($u);
        $e = SecurityEvent::where('event', 'break_glass_used')->first();
        $this->assertSame('alert', $e->severity);
        $this->assertSame($u->id, $e->subject_id);
        $this->assertSame(1, $e->detail['sessions_ended']);
        $this->assertSame(1, $e->detail['passkeys_removed']);
        $this->assertSame(10, $e->detail['codes_made']);
        $this->assertFalse($e->detail['temporary_password']);
        $this->assertStringContainsString('the server console', $e->detail['by']);
        $this->assertSame(1, SecurityEvent::where('event', 'break_glass_used')->count());
    }

    public function test_the_person_is_told_with_a_not_me_button_and_the_other_managers_are_told_too(): void
    {
        $u = $this->person(name: 'Olive Owner');
        $boss = $this->person('super_admin', 'Second Owner');
        $this->managers = [$u, $boss];                                                           // the person is a manager too: told once, in their own words
        $this->openSession($u);
        $this->recover($u);

        $own = $this->ofType('break_glass_used');
        $this->assertCount(1, $own);
        $this->assertSame($u->id, $own[0]['to']);
        $this->assertStringContainsString('emergency recovery command', $own[0]['message']);
        $this->assertStringContainsString('every sign-in of the account was ended (1)', $own[0]['message']);
        $this->assertStringContainsString('a new set of recovery codes was made', $own[0]['message']);
        $this->assertStringContainsString('This was not me', $own[0]['options']['action_text']);
        $this->assertStringStartsWith('/secure-account?', $own[0]['options']['action_url']);

        $others = $this->ofType('break_glass_used_other');
        $this->assertCount(1, $others);
        $this->assertSame($boss->id, $others[0]['to']);
        $this->assertStringContainsString('Olive Owner', $others[0]['message']);
        $this->assertStringContainsString($u->email, $others[0]['message']);
        $this->assertStringContainsString('treat it as serious', $others[0]['message']);
        $this->assertArrayNotHasKey('action_url', $others[0]['options']);
    }

    public function test_the_message_says_only_what_was_done(): void
    {
        $u = $this->person();
        $this->recover($u, ['--yes' => true, '--keep-passkeys' => true]);
        $m = $this->ofType('break_glass_used')[0]['message'];
        $this->assertStringNotContainsString('passkey', strtolower(explode('If you asked', $m)[0]));
        $this->assertStringNotContainsString('temporary password', $m);
        $this->recover($u, ['--yes' => true, '--temporary-password' => true]);
        $this->assertStringContainsString('a temporary password was set', $this->ofType('break_glass_used')[1]['message']);
    }

    public function test_a_mail_server_that_is_down_never_stops_it(): void
    {
        $u = $this->person();
        $this->openSession($u);
        $this->failing = true;
        $this->assertSame(0, $this->recover($u));
        $this->assertSame(0, $u->tokens()->count());
        $this->assertSame(1, SecurityEvent::where('event', 'break_glass_used')->count());
        $this->assertSame([], $this->sent);
    }

    public function test_the_alerts_switch_is_respected_but_the_log_is_not_optional(): void
    {
        config(['security.alerts_email' => false]);
        $u = $this->person();
        $this->recover($u);
        $this->assertSame([], $this->sent);
        $this->assertSame(1, SecurityEvent::where('event', 'break_glass_used')->count());
    }

    // ------------------------------------------------------------ before the scripts are run

    public function test_without_the_recovery_code_script_it_still_ends_sign_ins_and_says_what_it_could_not_do(): void
    {
        Schema::drop('auth_recovery_codes');
        RecoveryCodes::forget();
        $u = $this->person();
        $this->openSession($u);
        $this->assertSame(0, $this->recover($u));
        $out = Artisan::output();
        $this->assertSame(0, $u->tokens()->count());
        $this->assertStringContainsString('Recovery codes are not set up', $out);
        $this->assertStringContainsString('--temporary-password', $out);
        $this->assertSame(0, SecurityEvent::where('event', 'break_glass_used')->first()->detail['codes_made']);
    }

    public function test_there_is_no_way_to_reach_it_from_the_website(): void
    {
        foreach (\Illuminate\Support\Facades\Route::getRoutes()->getRoutes() as $route) {
            $this->assertStringNotContainsString('break-glass', $route->uri());
            $this->assertStringNotContainsString('security/recover', $route->uri());
            $this->assertStringNotContainsString('BreakGlass', (string) ($route->getActionName()));
        }
    }
}
