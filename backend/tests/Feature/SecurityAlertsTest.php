<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** Telling people when the doors of their own account change, and what "This was not me" then does. */
class SecurityAlertsTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    /** @var array<int, array{to: int, type: string, title: string, message: string, options: array}> */
    private array $sent = [];

    private bool $failing = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]], 'security.rate_limits.recovery' => ['user' => [[1000, 15]]], 'security.rate_limits.reset' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]]]);
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
    }

    public function record(array $m): void
    {
        $this->sent[] = $m;
    }

    public function isFailing(): bool
    {
        return $this->failing;
    }

    private function ofType(string $type): array
    {
        return array_values(array_filter($this->sent, fn ($m) => $m['type'] === $type));
    }

    private function person(): User
    {
        static $n = 0;

        return User::forceCreate(['name' => 'Amina '.(++$n), 'email' => 'amina'.$n.'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
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

    private function anon(): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this;
    }

    private function add(string $token, ?FakeAuthenticator $d = null): array
    {
        $d ??= new FakeAuthenticator();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options');
        $q->assertOk();
        $r = $this->as($token)->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36')->withServerVariables(['REMOTE_ADDR' => '41.80.1.1'])
            ->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'Kitchen laptop']);
        $r->assertStatus(201);

        return [$r->json('data.id'), $d];
    }

    // ------------------------------------------------------------ passkeys

    public function test_adding_a_passkey_tells_the_person(): void
    {
        $u = $this->person();
        $this->add($this->openSession($u));
        $m = $this->ofType('passkey_added');
        $this->assertCount(1, $m);
        $this->assertSame($u->id, $m[0]['to']);
        $this->assertStringContainsString('Kitchen laptop', $m[0]['message']);
        $this->assertStringContainsString('Chrome on Windows', $m[0]['message']);
        $this->assertStringContainsString('41.80.1.1', $m[0]['message']);
        $this->assertStringContainsString('This was not me', $m[0]['options']['action_text']);
        $this->assertStringStartsWith('/secure-account?', $m[0]['options']['action_url']);
        $this->assertStringContainsString('If this was not you', $m[0]['message']);
    }

    public function test_the_wording_says_how_the_passkey_got_there(): void
    {
        $u = $this->person();
        $t = $this->openSession($u);
        [, $device] = $this->add($t);
        $this->sent = [];
        $q = $this->as($t)->postJson('/api/auth/passkeys/prove/options');
        $this->as($t)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $device->assert($q->json('options'))])->assertOk();
        $this->add($t);
        $this->assertStringContainsString('approved with another of your passkeys', $this->ofType('passkey_added')[0]['message']);

        $codes = $this->as($t)->postJson('/api/auth/recovery-codes')->assertStatus(201)->json('codes');
        $later = $this->openSession($u);
        $this->as($later)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $this->sent = [];
        $this->add($later);
        $this->assertStringContainsString('added with a recovery code', $this->ofType('passkey_added')[0]['message']);
    }

    public function test_removing_a_passkey_tells_the_person_and_says_why(): void
    {
        $u = $this->person();
        $t = $this->openSession($u);
        [$id] = $this->add($t);
        $this->sent = [];
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}", ['reason' => 'lost'])->assertOk();
        $m = $this->ofType('passkey_removed');
        $this->assertCount(1, $m);
        $this->assertStringContainsString('Kitchen laptop', $m[0]['message']);
        $this->assertStringContainsString('reported lost', $m[0]['message']);
        $this->assertStringContainsString('This was not me', $m[0]['options']['action_text']);
    }

    public function test_a_copied_key_being_switched_off_tells_the_person(): void
    {
        $u = $this->person();
        $t = $this->openSession($u);
        [, $device] = $this->add($t);
        $device->counter = 5;
        $this->sent = [];
        $q = $this->anon()->postJson('/api/auth/passkeys/options');
        $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $device->assert($q->json('options'))])->assertOk();
        $device->counter = 2;                                                                    // a copy that did not keep up
        $q = $this->anon()->postJson('/api/auth/passkeys/options');
        $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $device->assert($q->json('options'))])->assertStatus(403);
        $m = $this->ofType('passkey_clone');
        $this->assertCount(1, $m);
        $this->assertSame($u->id, $m[0]['to']);
        $this->assertStringContainsString('switched off', $m[0]['message']);
    }

    // ------------------------------------------------------------ recovery codes

    public function test_making_and_using_recovery_codes_tells_the_person(): void
    {
        $u = $this->person();
        $t = $this->openSession($u);
        $codes = $this->as($t)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201)->json('codes');
        $this->assertCount(1, $this->ofType('recovery_codes_made'));
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => 'AAAAA-BBBBB'])->assertStatus(422);
        $this->assertCount(0, $this->ofType('recovery_code_used'));                              // a wrong guess is in the log, not a message
        $this->as($t)->postJson('/api/auth/recovery-codes/use', ['code' => $codes[0]])->assertOk();
        $m = $this->ofType('recovery_code_used');
        $this->assertCount(1, $m);
        $this->assertStringContainsString('9 left', $m[0]['message']);
    }

    // ------------------------------------------------------------ the switch, and a failing mail server

    public function test_it_can_be_switched_off(): void
    {
        config(['security.alerts_email' => false]);
        $this->add($this->openSession($this->person()));
        $this->assertSame([], $this->sent);
    }

    public function test_a_mail_server_that_is_down_never_stops_the_change(): void
    {
        $this->failing = true;
        $u = $this->person();
        [$id] = $this->add($this->openSession($u));
        $this->assertNotNull(AuthCredential::find($id));
        $this->assertSame([], $this->sent);
    }

    // ------------------------------------------------------------ "This was not me"

    public function test_this_was_not_me_takes_away_recent_passkeys_and_codes_and_signs_everyone_out(): void
    {
        $u = $this->person();
        $other = $this->person();
        $mine = $this->openSession($u);
        [$old] = $this->add($mine);
        AuthCredential::where('id', $old)->update(['created_at' => now()->subDays(10)]);        // an old one the person has had for a while
        [$recent] = $this->add($mine);                                                          // one added just now (by whoever was in)
        $this->as($mine)->postJson('/api/auth/recovery-codes')->assertStatus(201);
        $theirs = $this->openSession($other);
        [$otherPasskey] = $this->add($theirs);
        $this->as($theirs)->postJson('/api/auth/recovery-codes', ['current_password' => 'Right-password-1'])->assertStatus(201);
        $this->sent = [];

        $link = SecureAccountLink::query($u);
        parse_str($link, $q);
        $r = $this->anon()->postJson('/api/auth/secure-account', $q)->assertOk();

        $this->assertNotNull(AuthCredential::find($recent)->revoked_at);
        $this->assertSame('not_me', AuthCredential::find($recent)->revoked_reason);
        $this->assertNull(AuthCredential::find($old)->revoked_at);                              // not the old one
        $this->assertNull(AuthCredential::find($otherPasskey)->revoked_at);                     // not anyone else's
        $this->assertSame(0, AuthRecoveryCode::where('user_id', $u->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->assertSame(10, AuthRecoveryCode::where('user_id', $other->id)->whereNull('revoked_at')->whereNull('used_at')->count());
        $this->as($mine)->getJson('/api/auth/me')->assertStatus(401);
        $this->as($theirs)->getJson('/api/auth/me')->assertOk();
        $this->assertSame(1, $r->json('passkeys_removed'));
        $this->assertSame(1, SecurityEvent::where('event', 'secure_account')->count());
        $this->assertSame(1, SecurityEvent::where('event', 'secure_account')->first()->detail['passkeys_removed']);
    }

    public function test_this_was_not_me_with_nothing_recent_removes_nothing_and_says_so(): void
    {
        $u = $this->person();
        [$id] = $this->add($this->openSession($u));
        AuthCredential::where('id', $id)->update(['created_at' => now()->subDays(10)]);
        parse_str(SecureAccountLink::query($u), $q);
        $r = $this->anon()->postJson('/api/auth/secure-account', $q)->assertOk();
        $this->assertSame(0, $r->json('passkeys_removed'));
        $this->assertNull(AuthCredential::find($id)->revoked_at);
        $this->assertStringNotContainsString('passkey', strtolower($r->json('message')));
    }
}
