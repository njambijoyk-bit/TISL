<?php

namespace Tests\Feature;

use App\Models\Security\AuthSession;
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

/** What is done with a sign-in that does not look like the person: written down, told, or held until they confirm with their passkey. */
class RiskGateTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
    private const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

    /** @var array<int, array{to: int, type: string, message: string, options: array}> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.cookie.enabled' => true, 'security.rate_limits.sign_in' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]], 'security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]],
            'security.login.free_tries' => 100]);
        Route::middleware(['api', 'auth:sanctum'])->get('/api/_probe', fn () => response()->json(['ok' => true]));
        $test = $this;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($test) extends \App\Services\Notify\Notifier {
            public function __construct(private $test) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->test->record(['to' => $to->getKey(), 'type' => $type, 'message' => $message, 'options' => $o]);

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

    private function risk(string $mode): void
    {
        config(['security.policy.risk.mode' => $mode]);
        SecuritySettings::forget();
    }

    private function person(): User
    {
        static $n = 0;

        return User::forceCreate(['name' => 'Amina', 'email' => 'amina'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function history(User $u): void
    {
        $req = Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => self::CHROME_WIN, 'REMOTE_ADDR' => '41.80.1.10']);
        app(Sessions::class)->issue($u, $req, 'auth-token', 'password');
        AuthSession::query()->update(['created_at' => now()->subDays(3)]);
        $this->sent = [];
    }

    private function signIn(User $u, string $ua = self::CHROME_WIN, string $ip = '41.80.1.10', string $password = 'Right-password-1')
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('User-Agent', $ua)->withServerVariables(['REMOTE_ADDR' => $ip])->withHeader('X-Token-In-Body', '1')->postJson('/api/auth/login', ['email' => $u->email, 'password' => $password]);
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function withPasskey(User $u): FakeAuthenticator
    {
        $t = app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => self::CHROME_WIN, 'REMOTE_ADDR' => '41.80.1.10']), 'auth-token', 'password');
        $d = new FakeAuthenticator();
        $q = $this->as($t)->postJson('/api/auth/passkeys/register/options');
        $this->as($t)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone'])->assertStatus(201);
        AuthSession::query()->update(['created_at' => now()->subDays(3)]);
        $this->sent = [];

        return $d;
    }

    // ------------------------------------------------------------ off, test, on

    public function test_off_by_default_nothing_is_judged(): void
    {
        $u = $this->person();
        $this->history($u);
        $r = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk();
        $this->assertSame(0, SecurityEvent::whereIn('event', ['risk_would_ask', 'risk_notice', 'risk_stronger'])->count());
        $this->as($r->json('token'))->getJson('/api/_probe')->assertOk();
    }

    public function test_test_mode_writes_down_what_it_would_have_done_and_stops_nobody(): void
    {
        $this->risk('log');
        $u = $this->person();
        $d = $this->withPasskey($u);
        $this->history($u);
        $r = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk();
        $e = SecurityEvent::where('event', 'risk_would_ask')->first();
        $this->assertSame(['new_device', 'new_network'], $e->detail['signals']);
        $this->assertSame('ask_for_passkey', $e->detail['would']);
        $this->as($r->json('token'))->getJson('/api/_probe')->assertOk();                          // nothing was held
        $this->assertSame([], array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'unusual_sign_in')));   // and nobody was emailed about it by this
    }

    public function test_test_mode_says_tell_the_person_when_there_is_no_passkey_to_ask_for(): void
    {
        $this->risk('log');
        $u = $this->person();
        $this->history($u);
        $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk();
        $this->assertSame('tell_the_person', SecurityEvent::where('event', 'risk_would_ask')->first()->detail['would']);
    }

    public function test_the_usual_sign_in_is_not_written_about(): void
    {
        $this->risk('log');
        $u = $this->person();
        $this->history($u);
        $this->signIn($u)->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'like', 'risk_%')->count());
    }

    // ------------------------------------------------------------ on

    public function test_an_unusual_sign_in_of_someone_with_a_passkey_is_held_until_they_confirm_with_it(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $device = $this->withPasskey($u);
        $this->history($u);
        $r = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk()->assertJsonPath('security.gate', 'risk_check');
        $token = $r->json('token');

        $this->as($token)->getJson('/api/_probe')->assertStatus(403)->assertJsonPath('restricted.reason', 'risk_check');
        $this->as($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', 'risk_check');      // the way out stays open
        $this->as($token)->getJson('/api/auth/passkeys')->assertOk();
        $this->assertSame(1, SecurityEvent::where('event', 'risk_stronger')->count());
        $mail = array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'unusual_sign_in'));
        $this->assertCount(1, $mail);
        $this->assertStringContainsString('We held that sign-in', $mail[0]['message']);
        $this->assertStringContainsString('browser you have not used lately', $mail[0]['message']);
        $this->assertSame('This was not me', $mail[0]['options']['action_text']);

        // the person confirms with their passkey: free
        $q = $this->as($token)->postJson('/api/auth/passkeys/prove/options');
        $this->as($token)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $device->assert($q->json('options'))])->assertOk();
        $this->as($token)->getJson('/api/_probe')->assertOk();
        $this->as($token)->getJson('/api/auth/me')->assertJsonPath('security.gate', null);
    }

    public function test_a_milder_sign_in_goes_through_and_the_person_is_told_when_it_is_more_than_a_new_browser(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $device = $this->withPasskey($u);
        $this->history($u);
        config(['security.risk.stronger_at' => 3]);
        $r = $this->signIn($u, self::CHROME_WIN, '102.5.7.9')->assertOk();                          // only the network is new
        $this->as($r->json('token'))->getJson('/api/_probe')->assertOk();
        $this->assertSame(1, SecurityEvent::where('event', 'risk_notice')->count());
        $mail = array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'unusual_sign_in'));
        $this->assertCount(1, $mail);
        $this->assertStringContainsString('It went through', $mail[0]['message']);
    }

    public function test_a_new_browser_alone_does_not_get_a_second_email_from_here(): void
    {
        $this->risk('enforce');
        config(['security.risk.stronger_at' => 3]);
        $u = $this->person();
        $this->history($u);
        $this->signIn($u, self::SAFARI_IPHONE)->assertOk();                                          // only the browser is new (its own email comes from the new-sign-in notice)
        $this->assertSame([], array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'unusual_sign_in')));
        $this->assertSame(1, SecurityEvent::where('event', 'risk_notice')->count());
    }

    public function test_someone_with_no_passkey_is_told_not_held(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $this->history($u);
        $r = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk()->assertJsonPath('security.gate', null);
        $this->as($r->json('token'))->getJson('/api/_probe')->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'risk_stronger')->count());
        $this->assertSame(1, SecurityEvent::where('event', 'risk_notice')->count());
        $this->assertCount(1, array_filter($this->sent, fn ($m) => $m['type'] === 'unusual_sign_in'));
    }

    public function test_a_passkey_sign_in_is_never_judged(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $d = $this->withPasskey($u);
        $this->history($u);
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $q = $this->withHeader('User-Agent', self::SAFARI_IPHONE)->withServerVariables(['REMOTE_ADDR' => '102.5.7.9'])->postJson('/api/auth/passkeys/options');
        $r = $this->withHeader('User-Agent', self::SAFARI_IPHONE)->withServerVariables(['REMOTE_ADDR' => '102.5.7.9'])->withHeader('X-Token-In-Body', '1')
            ->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))])->assertOk();
        $this->as($r->json('token'))->getJson('/api/_probe')->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'like', 'risk_%')->count());
    }

    public function test_wrong_passwords_just_before_are_enough_on_their_own(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $d = $this->withPasskey($u);
        $this->history($u);
        for ($i = 0; $i < 3; $i++) {
            $this->signIn($u, self::CHROME_WIN, '41.80.1.10', 'wrong-password-'.$i)->assertStatus(401);
        }
        $r = $this->signIn($u)->assertOk()->assertJsonPath('security.gate', 'risk_check');           // the right one, from the usual browser, but after a flurry
        $this->assertSame(['many_failures'], SecurityEvent::where('event', 'risk_stronger')->first()->detail['signals']);
    }

    public function test_the_hold_goes_when_the_rule_is_switched_off(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $this->withPasskey($u);
        $this->history($u);
        $token = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk()->json('token');
        $this->as($token)->getJson('/api/_probe')->assertStatus(403);
        $this->risk('off');
        $this->as($token)->getJson('/api/_probe')->assertOk();
        $this->as($token)->getJson('/api/auth/me')->assertJsonPath('security.gate', null);
    }

    public function test_the_hold_and_the_passkey_rule_work_side_by_side(): void
    {
        $this->risk('enforce');
        config(['security.policy.passkeys.mode' => 'log', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString()]);
        SecuritySettings::forget();
        $u = $this->person();
        $this->withPasskey($u);
        $this->history($u);
        $token = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->assertOk()->json('token');
        $this->as($token)->getJson('/api/_probe')->assertStatus(403)->assertJsonPath('restricted.reason', 'risk_check');   // held even though the other rule is only testing
    }

    public function test_a_hold_is_for_that_sign_in_only(): void
    {
        $this->risk('enforce');
        $u = $this->person();
        $this->withPasskey($u);
        $this->history($u);
        $held = $this->signIn($u, self::SAFARI_IPHONE, '102.5.7.9')->json('token');
        $usual = $this->signIn($u)->assertOk()->json('token');
        $this->as($held)->getJson('/api/_probe')->assertStatus(403);
        $this->as($usual)->getJson('/api/_probe')->assertOk();
    }

    public function test_the_country_is_written_with_the_sign_in_so_later_ones_can_be_compared(): void
    {
        $u = $this->person();
        $this->app['auth']->forgetGuards();
        $this->withHeader('CF-IPCountry', 'KE')->withHeader('X-Token-In-Body', '1')->postJson('/api/auth/login', ['email' => $u->email, 'password' => 'Right-password-1'])->assertOk();
        $this->assertSame('KE', SecurityEvent::where('event', 'sign_in')->first()->detail['country']);
    }
}
