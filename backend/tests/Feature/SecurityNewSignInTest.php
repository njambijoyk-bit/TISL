<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Notify\NotificationTypes;
use App\Services\Notify\Notifier;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\Sessions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** "A new browser signed in": the email, and the button in it that ends every session. */
class SecurityNewSignInTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';
    private const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

    private object $notifier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('applicants', function ($t) {
            $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->unique(); $t->string('password'); $t->string('status')->default('active');
            $t->boolean('must_change_password')->default(false); $t->timestamp('email_verified_at')->nullable(); $t->string('remember_token', 100)->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Cache::flush();
        $this->notifier = new class extends Notifier {
            public array $calls = [];
            public bool $explode = false;

            public function __construct() {}

            public function send(Model $to, string $type, string $title, string $message, array $o = []): array
            {
                if ($this->explode) {
                    throw new \RuntimeException('mail is down');
                }
                $this->calls[] = ['send', $to, $type, $title, $message, $o];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->calls[] = ['contact', $contact, $type, $title, $message, $o];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        };
        $this->app->instance(Notifier::class, $this->notifier);
    }

    private function person(array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function requestFrom(string $ua, string $ip = '41.80.1.1'): Request
    {
        return Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => $ua, 'REMOTE_ADDR' => $ip]);
    }

    private function signIn(Model $who, string $ua = self::CHROME, string $method = 'password', string $ip = '41.80.1.1'): string
    {
        return app(Sessions::class)->issue($who, $this->requestFrom($ua, $ip), 'auth-token', $method);
    }

    // ------------------------------------------------------------ when it is sent

    public function test_the_first_sign_in_and_the_same_browser_again_are_not_announced_a_different_browser_is(): void
    {
        $u = $this->person();
        $this->signIn($u);
        $this->signIn($u);
        $this->assertSame([], $this->notifier->calls, 'nothing new about the first sign-in or the same kind of browser');
        $this->signIn($u, self::PHONE, 'password', '102.5.5.5');
        $this->assertCount(1, $this->notifier->calls);
        [$kind, $to, $type, $title, $message, $o] = $this->notifier->calls[0];
        $this->assertSame(['send', $u->id, 'new_sign_in'], [$kind, $to->id, $type]);
        $this->assertStringContainsString('Safari on iPhone', $message);
        $this->assertStringContainsString('102.5.5.5', $message);
        $this->assertSame('This was not me', $o['action_text']);
        $this->signIn($u, self::PHONE);
        $this->assertCount(1, $this->notifier->calls, 'the phone is no longer new');
    }

    public function test_signing_in_again_after_a_reset_or_just_after_registering_says_nothing(): void
    {
        $u = $this->person();
        $this->signIn($u);
        $this->signIn($u, self::PHONE, 'reset');
        $this->assertSame([], $this->notifier->calls);
        $u2 = $this->person(['email' => 'b@example.com']);
        $this->signIn($u2, self::CHROME, 'password');
        $this->signIn($u2, self::PHONE, 'register');
        $this->assertSame([], $this->notifier->calls);
    }

    public function test_it_can_be_switched_off(): void
    {
        config(['security.new_sign_in_email' => false]);
        $u = $this->person();
        $this->signIn($u);
        $this->signIn($u, self::PHONE);
        $this->assertSame([], $this->notifier->calls);
    }

    public function test_a_failing_mail_system_never_stops_a_sign_in(): void
    {
        $u = $this->person();
        $this->signIn($u);
        $this->notifier->explode = true;
        $token = $this->signIn($u, self::PHONE);
        $this->assertNotEmpty($token);
        $this->assertSame(2, $u->tokens()->count());
    }

    public function test_even_a_notice_that_cannot_be_built_never_stops_a_sign_in(): void
    {
        $u = $this->person();
        $this->signIn($u);
        $this->app->bind(\App\Services\Security\NewSignInNotice::class, fn () => throw new \RuntimeException('cannot be built'));
        $this->assertNotEmpty($this->signIn($u, self::PHONE));
    }

    public function test_the_notice_itself_never_raises_when_the_mail_system_does(): void
    {
        $u = $this->person();
        $this->notifier->explode = true;
        app(\App\Services\Security\NewSignInNotice::class)->send($u, $this->requestFrom(self::PHONE), 'password');
        $this->assertSame([], $this->notifier->calls);
    }

    public function test_it_goes_through_the_real_sign_in_door_too(): void
    {
        $this->person();
        $door = fn (string $ua, string $ip) => $this->withServerVariables(['REMOTE_ADDR' => $ip, 'HTTP_USER_AGENT' => $ua])->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $door(self::CHROME, '41.80.1.1')->assertOk();
        $this->assertCount(0, $this->notifier->calls);
        $door(self::PHONE, '102.5.5.5')->assertOk();
        $this->assertCount(1, $this->notifier->calls);
    }

    public function test_a_job_applicant_is_told_by_email_only(): void
    {
        $a = Applicant::forceCreate(['first_name' => 'Job', 'last_name' => 'Seeker', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $this->signIn($a);
        $this->signIn($a, self::PHONE);
        $this->assertCount(1, $this->notifier->calls);
        [$kind, $contact, $type, , , $o] = $this->notifier->calls[0];
        $this->assertSame(['contact', 'job@example.com', 'new_sign_in', 'Job Seeker'], [$kind, $contact['email'], $type, $contact['name']]);
        parse_str(substr($o['action_url'], strlen('/secure-account?')), $p);
        $who = SecureAccountLink::verify($p);
        $this->assertInstanceOf(Applicant::class, $who);
        $this->assertSame($a->id, $who->id);
        $this->assertNull(SecureAccountLink::verify(['t' => 'u'] + $p), 'the same number as a login account is not the same person');
    }

    public function test_the_security_message_is_one_that_always_gets_through(): void
    {
        $this->assertTrue(NotificationTypes::isEssential('new_sign_in'));
        $this->assertSame('A new browser signed in to your account', NotificationTypes::label('new_sign_in'));
    }

    // ------------------------------------------------------------ the button's link

    private function linkFor(User $u): array
    {
        $this->signIn($u);
        $this->signIn($u, self::PHONE);
        $url = $this->notifier->calls[array_key_last($this->notifier->calls)][5]['action_url'];
        $this->assertStringStartsWith('/secure-account?', $url);
        parse_str(substr($url, strlen('/secure-account?')), $p);

        return $p;
    }

    public function test_the_link_in_the_email_names_the_account_and_only_that_account(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        $this->assertSame($u->id, SecureAccountLink::verify($p)?->id);
    }

    public function test_a_changed_or_missing_part_of_the_link_makes_it_worthless(): void
    {
        $u = $this->person();
        $other = $this->person(['email' => 'baraka@example.com']);
        $p = $this->linkFor($u);
        $this->assertNull(SecureAccountLink::verify(['i' => $other->id] + $p), 'another account number');
        $this->assertNull(SecureAccountLink::verify(['e' => $p['e'] + 1000] + $p), 'a longer life');
        Applicant::forceCreate(['first_name' => 'Same', 'email' => 'same@example.com', 'password' => Hash::make('x-Right-password-1')]);   // an applicant with the same number
        $this->assertSame($u->id, Applicant::first()->id);
        $this->assertNull(SecureAccountLink::verify(['t' => 'a'] + $p), 'another kind of account with the same number');
        $this->assertNull(SecureAccountLink::verify(['i' => $u->id.'abc'] + $p), 'the number with something stuck on');
        $this->assertNull(SecureAccountLink::verify(['k' => strrev($p['k'])] + $p), 'another signature');
        foreach (['t', 'i', 'e', 'k'] as $key) {
            $without = $p;
            unset($without[$key]);
            $this->assertNull(SecureAccountLink::verify($without), "without {$key}");
        }
        $this->assertNull(SecureAccountLink::verify(['i' => ['1']] + $p));
        $this->assertNull(SecureAccountLink::verify(['i' => '-1'] + $p));
        $this->assertNull(SecureAccountLink::verify(['k' => ['x']] + $p));
        $this->assertNull(SecureAccountLink::verify([]));
    }

    public function test_the_link_runs_out_after_three_days(): void
    {
        $p = $this->linkFor($this->person());
        $this->travel(60)->hours();
        $this->assertNotNull(SecureAccountLink::verify($p), 'still good two and a half days later');
        $this->travel(24)->hours();
        $this->assertNull(SecureAccountLink::verify($p), 'gone after three and a half');
    }

    public function test_the_link_dies_the_moment_the_password_changes(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        $u->forceFill(['password' => Hash::make('A-brand-new-password-9')])->save();
        $this->assertNull(SecureAccountLink::verify($p));
    }

    public function test_a_link_made_with_another_key_is_worthless(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        config(['app.key' => 'base64:'.base64_encode(str_repeat('z', 32))]);
        $this->assertNull(SecureAccountLink::verify($p));
    }

    // ------------------------------------------------------------ pressing the button

    public function test_pressing_it_signs_everyone_out_of_that_account_only_logs_it_and_sends_a_reset_link(): void
    {
        $u = $this->person();
        $other = $this->person(['email' => 'baraka@example.com']);
        $p = $this->linkFor($u);
        $this->signIn($other);
        Password::shouldReceive('sendResetLink')->once()->with(['email' => 'amina@example.com'])->andReturn('passwords.sent');
        $r = $this->postJson('/api/auth/secure-account?'.http_build_query($p));
        $r->assertOk();
        $this->assertSame(2, $r->json('ended'));
        $this->assertSame(0, $u->tokens()->count());
        $this->assertSame(1, $other->tokens()->count(), 'somebody else is untouched');
        $this->assertSame(['not_me', 'not_me'], AuthSession::where('tokenable_id', $u->id)->pluck('revoked_reason')->all());
        $line = SecurityEvent::where('event', 'secure_account')->first();
        $this->assertSame(['alert', $u->id, 2], [$line->severity, $line->subject_id, $line->detail['sessions_ended']]);
    }

    public function test_an_applicant_who_presses_it_is_signed_out_and_sent_a_reset_link_from_the_applicant_system(): void
    {
        $a = Applicant::forceCreate(['first_name' => 'Job', 'last_name' => 'Seeker', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $this->signIn($a);
        $this->signIn($a, self::PHONE);
        parse_str(substr($this->notifier->calls[0][5]['action_url'], strlen('/secure-account?')), $p);
        $broker = \Mockery::mock();
        $broker->shouldReceive('sendResetLink')->once()->with(['email' => 'job@example.com'])->andReturn('passwords.sent');
        Password::shouldReceive('broker')->once()->with('applicants')->andReturn($broker);
        Password::shouldReceive('sendResetLink')->never();
        $this->postJson('/api/auth/secure-account?'.http_build_query($p))->assertOk();
        $this->assertSame(0, $a->tokens()->count());
        $this->assertSame('applicant', SecurityEvent::where('event', 'secure_account')->first()->subject_type);
    }

    public function test_a_wrong_or_old_link_does_nothing_and_says_what_to_do_instead(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        Password::shouldReceive('sendResetLink')->never();
        $r = $this->postJson('/api/auth/secure-account?'.http_build_query(['k' => 'nope'] + $p));
        $r->assertStatus(422);
        $this->assertStringContainsString('Forgot password', $r->json('message'));
        $this->assertSame(2, $u->tokens()->count(), 'nobody was signed out');
        $this->assertCount(0, SecurityEvent::where('event', 'secure_account')->get());
    }

    public function test_pressing_it_twice_is_harmless(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        Password::shouldReceive('sendResetLink')->twice()->andReturn('passwords.sent');
        $this->postJson('/api/auth/secure-account?'.http_build_query($p))->assertOk();
        $again = $this->postJson('/api/auth/secure-account?'.http_build_query($p));
        $again->assertOk();
        $this->assertSame(0, $again->json('ended'));
    }

    public function test_a_failing_reset_email_does_not_undo_the_sign_out(): void
    {
        $u = $this->person();
        $p = $this->linkFor($u);
        Password::shouldReceive('sendResetLink')->once()->andThrow(new \RuntimeException('mail is down'));
        $this->postJson('/api/auth/secure-account?'.http_build_query($p))->assertOk();
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_the_door_is_public_and_slowed_down(): void
    {
        $route = collect(Route::getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === 'api/auth/secure-account');
        $this->assertNotNull($route);
        $mw = $route->gatherMiddleware();
        $this->assertContains('throttle:password-reset', $mw);
        $this->assertNotContains('auth:sanctum', $mw, 'the link is the proof: they may be locked out');
    }
}
