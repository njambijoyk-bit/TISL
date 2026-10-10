<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\RecoveryCodes;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** Recovery codes: made once, shown once, good once - and what they do (let a lost passkey be replaced), and what they never do (sign anyone in). */
class RecoveryCodesTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]], 'security.rate_limits.recovery' => ['user' => [[1000, 15]]]]);
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

    private function person(string $role = 'customer'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => 'Amina '.(++$n), 'email' => 'amina'.$n.'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function openSession(User $u, string $method = 'password'): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', $method);
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function add(string $token, ?FakeAuthenticator $d = null, array $extra = []): array
    {
        $d ??= new FakeAuthenticator();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options', $extra);
        $q->assertOk();
        $r = $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone']);
        $r->assertStatus(201);

        return [$r->json('data.id'), $d];
    }

    private function prove(string $token, FakeAuthenticator $d): void
    {
        $q = $this->as($token)->postJson('/api/auth/passkeys/prove/options');
        $q->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))])->assertOk();
    }

    /** A person with codes in hand: [user, a session that made them, the codes]. */
    private function withCodes(string $role = 'customer'): array
    {
        $u = $this->person($role);
        $t = $this->openSession($u);
        $codes = $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201)->json('codes');

        return [$u, $t, $codes];
    }

    // ------------------------------------------------------------ making them

    public function test_a_set_is_ten_distinct_easy_to_read_codes_shown_once(): void
    {
        $u = $this->person();
        $t = $this->openSession($u);
        $r = $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201);
        $codes = $r->json('codes');
        $this->assertCount(10, $codes);
        $this->assertCount(10, array_unique($codes));
        foreach ($codes as $c) {
            $this->assertMatchesRegularExpression('/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/', $c);
        }
        $this->assertSame(10, $r->json('remaining'));
        // asking again for the status never shows them
        $status = $this->as($t)->getJson('/api/auth/recovery-codes')->assertOk();
        $this->assertSame(10, $status->json('remaining'));
        $this->assertArrayNotHasKey('codes', $status->json());
        $this->assertSame(1, SecurityEvent::where('event', 'recovery_codes_made')->count());
    }

    public function test_only_a_fingerprint_is_kept_not_the_code(): void
    {
        [, , $codes] = $this->withCodes();
        $stored = AuthRecoveryCode::pluck('code_hash')->all();
        $this->assertCount(10, $stored);
        foreach ($codes as $c) {
            $plain = str_replace('-', '', $c);
            $this->assertNotContains($c, $stored);
            $this->assertNotContains($plain, $stored);
            $this->assertNotContains(hash('sha256', $plain), $stored);          // not even a plain hash: it is keyed with the app key
            $this->assertContains(hash_hmac('sha256', $plain, config('app.key')), $stored);
        }
        $this->assertStringNotContainsString($codes[0], json_encode(AuthRecoveryCode::all()->toArray()));
    }

    public function test_making_codes_needs_the_password_when_there_is_no_passkey(): void
    {
        $t = $this->openSession($this->person());
        $this->as($t)->postJson('/api/auth/recovery-codes')->assertStatus(403)->assertJsonPath('reason', 'password_needed');
        $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'wrong'])->assertStatus(403)->assertJsonPath('reason', 'password_needed');
        $this->assertSame(0, AuthRecoveryCode::count());
    }

    public function test_making_codes_needs_a_passkey_used_just_now_when_there_is_one(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        [, $device] = $this->add($first);
        $later = $this->openSession($u);                                                       // a password session
        $this->as($later)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'proof_needed');   // the password is not enough
        $this->prove($later, $device);
        $this->as($later)->postJson('/api/auth/recovery-codes')->assertStatus(201);
    }

    public function test_a_new_set_ends_the_old_one(): void
    {
        [$u, $t, $old] = $this->withCodes();
        $new = $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201)->json('codes');
        $this->assertSame(10, $this->as($t)->getJson('/api/auth/recovery-codes')->json('remaining'));
        $this->assertSame(20, AuthRecoveryCode::where('user_id', $u->id)->count());
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $old[0]])->assertStatus(422);
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $new[0]])->assertOk();
    }

    public function test_one_persons_codes_are_not_another_persons(): void
    {
        [, , $codes] = $this->withCodes();
        $other = $this->openSession($this->person());
        $this->as($other)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertStatus(422);
        $this->assertSame(10, AuthRecoveryCode::good()->count());
    }

    // ------------------------------------------------------------ using one

    public function test_a_code_works_once(): void
    {
        [, $t, $codes] = $this->withCodes();
        $r = $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $this->assertSame(9, $r->json('remaining'));
        $this->assertSame(15, $r->json('minutes'));
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertStatus(422);
        $this->assertSame(9, $this->as($t)->getJson('/api/auth/recovery-codes')->json('remaining'));
        $this->assertSame(1, SecurityEvent::where('event', 'recovery_code_used')->count());
        $this->assertSame(1, SecurityEvent::where('event', 'recovery_code_failed')->count());
        $this->assertSame('alert', SecurityEvent::where('event', 'recovery_code_used')->value('severity'));
    }

    public function test_how_it_is_typed_does_not_matter(): void
    {
        [, $t, $codes] = $this->withCodes();
        $typed = '  '.strtolower(str_replace('-', ' ', $codes[0])).' ';
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $typed])->assertOk();
    }

    public function test_something_that_is_not_a_code_is_turned_away(): void
    {
        [, $t] = $this->withCodes();
        foreach (['', 'ABC', 'AAAAA-AAAAA', str_repeat('Z', 11), '2222-2222-22'] as $bad) {
            $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $bad])->assertStatus(422);
        }
        $this->assertSame(10, AuthRecoveryCode::good()->count());
    }

    public function test_a_code_does_not_sign_anyone_in(): void
    {
        [, , $codes] = $this->withCodes();
        $this->anon()->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertStatus(401);
        $this->assertSame(10, AuthRecoveryCode::good()->count());
    }

    private function anon(): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this;
    }

    public function test_guessing_is_slowed_down(): void
    {
        config(['security.rate_limits.recovery' => ['user' => [[5, 15]]]]);
        \App\Services\Security\RateLimits::register();
        [, $t] = $this->withCodes();
        for ($i = 0; $i < 5; $i++) {
            $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => 'AAAAA-BBBBB'])->assertStatus(422);
        }
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => 'AAAAA-BBBBB'])->assertStatus(429);
    }

    // ------------------------------------------------------------ what a code lets a session do

    public function test_a_lost_device_can_be_replaced_with_a_code_and_the_new_one_says_how_it_got_there(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        [$lostId] = $this->add($first);                                                       // the passkey on the phone that is now lost
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201)->json('codes');

        $now = $this->openSession($u);                                                        // signs in on a new computer with the password alone
        $this->as($now)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
        $this->as($now)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[3]])->assertOk();
        [$newId] = $this->add($now);                                                           // now it can
        $new = AuthCredential::find($newId);
        $this->assertSame('recovery', $new->added_method);
        $this->assertNull($new->added_by_id);
        $this->assertSame(2, AuthSession::where('token_id', \Laravel\Sanctum\PersonalAccessToken::findToken($now)->id)->value('strength'));   // the new passkey made this session strong

        // the lost one can be taken away in the same window (and everyone else is signed out)
        $other = $this->openSession($u);
        $this->as($now)->deleteJson("/api/auth/passkeys/{$lostId}", ['reason' => 'lost'])->assertOk();
        $this->assertNotNull(AuthCredential::find($lostId)->revoked_at);
        $this->as($other)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_a_passkey_that_vouches_for_the_new_one_is_recorded_as_doing_so_even_with_a_code_used(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        [$oldId, $device] = $this->add($first);
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->json('codes');
        $now = $this->openSession($u);
        $this->as($now)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $this->prove($now, $device);                                                           // the old device turned up after all
        [$newId] = $this->add($now);
        $new = AuthCredential::find($newId);
        $this->assertSame('approved', $new->added_method);
        $this->assertSame($oldId, $new->added_by_id);
    }

    public function test_the_window_is_a_quarter_of_an_hour(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        $this->add($first);
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->json('codes');
        $now = $this->openSession($u);
        $this->as($now)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        Carbon::setTestNow(now()->addMinutes(14));
        $this->as($now)->postJson('/api/auth/passkeys/register/options')->assertOk();
        Carbon::setTestNow(now()->addMinutes(2));
        $this->as($now)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
        Carbon::setTestNow();
    }

    public function test_the_window_belongs_to_the_session_that_used_the_code(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        $this->add($first);
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->json('codes');
        $a = $this->openSession($u);
        $b = $this->openSession($u);
        $this->as($a)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $this->as($b)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
    }

    public function test_a_code_does_not_open_the_way_to_make_more_codes(): void
    {
        $u = $this->person();
        $first = $this->openSession($u);
        $this->add($first);
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->json('codes');
        $now = $this->openSession($u);
        $this->as($now)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $this->as($now)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
    }

    public function test_it_gets_a_person_the_rule_holds_back_through_the_gate(): void
    {
        config(['security.policy.passkeys.mode' => 'enforce', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString()]);
        SecuritySettings::forget();
        $u = $this->person('admin');
        $first = $this->openSession($u);
        $this->add($first);
        $codes = $this->as($first)->postJson('/api/auth/recovery-codes')->assertStatus(201)->json('codes');

        $now = $this->openSession($u);                                                       // the phone is lost: a password sign-in on a new computer
        $this->as($now)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', 'passkey_needed');
        $this->as($now)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();     // reachable although held back
        $this->add($now);                                                                      // the new passkey
        $this->as($now)->getJson('/api/auth/me')->assertOk()->assertJsonPath('security.gate', null);
    }

    // ------------------------------------------------------------ before the script is run

    public function test_before_script_126_everything_says_so(): void
    {
        $t = $this->openSession($this->person());
        Schema::drop('auth_recovery_codes');
        RecoveryCodes::forget();
        $this->as($t)->getJson('/api/auth/recovery-codes')->assertOk()->assertJsonPath('ready', false);
        $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(409);
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => 'AAAAA-BBBBB'])->assertStatus(409);
    }
}
