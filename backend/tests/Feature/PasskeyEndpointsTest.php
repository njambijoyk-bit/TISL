<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Cookie;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** Signing in with a passkey and "My devices", through the real doors. */
class PasskeyEndpointsTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]]]);
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

    private function person(string $email = 'amina@example.com', array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina Wanjiru', 'email' => $email, 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function openSession(User $u, string $method = 'password'): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', $method);
    }

    /** One request as a signed-in person (the test client remembers headers, so each starts clean). */
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

    private function pk(array $set = []): FakeAuthenticator
    {
        $d = new FakeAuthenticator();
        foreach ($set as $k => $v) {
            $d->$k = $v;
        }

        return $d;
    }

    /** Add a passkey through the doors, from a session. @return array{0: int, 1: FakeAuthenticator} the passkey's number and the device */
    private function add(string $token, ?FakeAuthenticator $d = null, array $extra = []): array
    {
        $d ??= $this->pk();
        $q = $this->as($token)->postJson('/api/auth/passkeys/register/options', $extra);
        $q->assertOk();
        $r = $this->as($token)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone']);
        $r->assertStatus(201);

        return [$r->json('data.id'), $d];
    }

    /** Prove it is them with a passkey, in a session. */
    private function prove(string $token, FakeAuthenticator $d): void
    {
        $q = $this->as($token)->postJson('/api/auth/passkeys/prove/options');
        $q->assertOk();
        $this->as($token)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))])->assertOk();
    }

    /** Sign in with a passkey through the public doors. */
    private function passkeyLogin(FakeAuthenticator $d, array $overrides = [], array $headers = [])
    {
        $q = $this->anon()->postJson('/api/auth/passkeys/options');
        $q->assertOk();

        return $this->anon()->withHeaders($headers)->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'), $overrides)]);
    }

    // ------------------------------------------------------------ signing in with a passkey

    public function test_the_sign_in_question_is_the_same_for_everyone_and_names_nobody(): void
    {
        $this->person();
        $a = $this->anon()->postJson('/api/auth/passkeys/options', ['email' => 'amina@example.com']);
        $b = $this->anon()->postJson('/api/auth/passkeys/options', ['email' => 'nobody@example.com']);
        $a->assertOk();
        $b->assertOk();
        foreach ([$a, $b] as $r) {
            $this->assertSame('targetisl.co.ke', $r->json('options.rpId'));
            $this->assertSame([], $r->json('options.allowCredentials') ?? []);
        }
        $this->assertSame(array_keys($a->json('options')), array_keys($b->json('options')));
    }

    public function test_a_passkey_signs_the_person_in_and_the_session_remembers_how_strongly(): void
    {
        $u = $this->person();
        [$id, $d] = $this->add($this->openSession($u), null);
        $r = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1']);
        $r->assertOk();
        $this->assertSame('amina@example.com', $r->json('user.email'));
        $this->assertNotNull($r->json('access'));
        $this->assertNotEmpty($r->json('token'));
        $row = AuthSession::where('method', 'passkey')->first();
        $this->assertSame([$id, 2], [$row->credential_id, $row->strength]);
        $this->assertEqualsWithDelta(0, now()->diffInSeconds($row->last_strong_at, false), 3);
        $line = SecurityEvent::where('event', 'sign_in')->latest('id')->first();
        $this->assertSame(['passkey', $id, 2], [$line->detail['method'], $line->detail['credential'], $line->detail['strength']]);
        $this->as($r->json('token'))->getJson('/api/auth/me')->assertOk();   // and the session works
    }

    public function test_a_browser_gets_the_cookie_and_csrf_code_after_a_passkey_sign_in_too(): void
    {
        config(['security.cookie.enabled' => true]);
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $r = $this->passkeyLogin($d);
        $r->assertOk();
        $this->assertArrayNotHasKey('token', $r->json());
        $this->assertNotEmpty($r->json('csrf'));
        $this->assertTrue(collect($r->headers->getCookies())->contains(fn (Cookie $c) => $c->getName() === 'tisl_session' && $c->isHttpOnly()));
    }

    public function test_a_sign_in_that_is_not_genuine_gets_a_plain_refusal_and_no_session(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $before = AuthSession::count();
        foreach ([['badSignature' => true], ['challenge' => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], ['origin' => 'https://evil.example']] as $o) {
            $d2 = $d->cloneDevice();
            $r = $this->passkeyLogin($d2, $o);
            $r->assertStatus(422);
            $this->assertStringContainsString('not accepted', $r->json('message'));
        }
        $this->assertSame($before, AuthSession::count());
        $this->assertSame(3, SecurityEvent::where('event', 'sign_in_failed')->where('detail->door', 'passkey')->count());
    }

    public function test_an_unknown_passkey_gets_the_very_same_refusal_as_a_forged_one(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $forged = $this->passkeyLogin($d->cloneDevice(), ['badSignature' => true]);
        $unknown = $this->passkeyLogin($this->pk());
        $this->assertSame([422, $forged->json('message')], [$unknown->getStatusCode(), $unknown->json('message')]);
    }

    public function test_a_suspended_person_is_not_let_in_by_a_passkey(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $u->forceFill(['status' => 'suspended'])->save();
        $before = AuthSession::count();
        $r = $this->passkeyLogin($d);
        $r->assertStatus(403);
        $this->assertStringContainsString('suspended', $r->json('message'));
        $this->assertSame($before, AuthSession::count());
        $this->assertSame('passkey', SecurityEvent::where('event', 'sign_in_refused')->first()->detail['door']);
    }

    public function test_a_pending_password_change_does_not_stand_in_the_way_of_a_passkey(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $u->forceFill(['force_password_change' => true])->save();
        $this->passkeyLogin($d)->assertOk();
    }

    public function test_a_deleted_person_can_not_sign_in_with_a_passkey(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $u->delete();
        $this->passkeyLogin($d)->assertStatus(422);
    }

    public function test_a_copied_passkey_is_switched_off_its_sign_ins_end_and_the_owner_is_alerted(): void
    {
        $u = $this->person();
        [$id, $d] = $this->add($this->openSession($u));
        $good = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1']);
        $good->assertOk();
        $thief = $d->cloneDevice();
        $this->passkeyLogin($d)->assertOk();            // counter 2
        $r = $this->passkeyLogin($thief, ['counter' => 1]);
        $r->assertStatus(403);
        $this->assertStringContainsString('copied', $r->json('message'));
        $this->assertNotNull(AuthCredential::find($id)->disabled_at);
        $this->assertSame('alert', SecurityEvent::where('event', 'passkey_clone_suspected')->first()->severity);
        $this->passkeyLogin($d)->assertStatus(422);     // the real device is shut out too until the owner deals with it
    }

    public function test_a_sign_in_question_can_not_be_used_with_the_answer_to_a_proof_question(): void
    {
        $u = $this->person();
        $token = $this->openSession($u);
        [, $d] = $this->add($token);
        $proof = $this->as($token)->postJson('/api/auth/passkeys/prove/options');
        $r = $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => $proof->json('challenge_id'), 'credential' => $d->assert($proof->json('options'))]);
        $r->assertStatus(422);
        $this->assertSame(0, AuthSession::where('method', 'passkey')->count());
    }

    public function test_the_sign_in_door_is_slowed_down_for_one_address(): void
    {
        config(['security.rate_limits.passkey' => ['ip' => [[3, 1]]]]);
        $codes = [];
        for ($i = 0; $i < 5; $i++) {
            $codes[] = $this->anon()->postJson('/api/auth/passkeys/options')->getStatusCode();
        }
        $this->assertSame([200, 200, 200, 429, 429], $codes);
    }

    public function test_the_door_asks_for_the_right_things(): void
    {
        $this->anon()->postJson('/api/auth/passkeys/login', [])->assertStatus(422);
        $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => 'short', 'credential' => []])->assertStatus(422);
    }

    // ------------------------------------------------------------ adding the first passkey

    public function test_the_first_passkey_is_added_right_after_signing_in_and_lifts_the_session(): void
    {
        $u = $this->person();
        $token = $this->openSession($u);
        [$id] = $this->add($token);
        $c = AuthCredential::find($id);
        $this->assertSame(['first', null, 'My phone'], [$c->added_method, $c->added_by_id, $c->name]);
        $row = AuthSession::first();
        $this->assertSame([$id, 2], [$row->credential_id, $row->strength]);
        $this->assertSame('passkey_added', SecurityEvent::latest('id')->first()->event);
    }

    public function test_later_the_first_passkey_needs_the_password_typed_again(): void
    {
        $u = $this->person();
        $token = $this->openSession($u);
        $this->travel(11)->minutes();
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'password_needed');
        $this->as($token)->postJson('/api/auth/passkeys/register/options', ['current_password' => 'wrong'])->assertStatus(403);
        $this->as($token)->postJson('/api/auth/passkeys/register/options', ['current_password' => 'Right-password-1'])->assertOk();
    }

    public function test_the_list_shows_each_passkey_without_its_secrets_and_marks_the_one_in_use(): void
    {
        $u = $this->person();
        $token = $this->openSession($u);
        [$id] = $this->add($token, $this->pk(['backupEligible' => true]));
        $r = $this->as($token)->getJson('/api/auth/passkeys');
        $r->assertOk();
        $row = $r->json('data.0');
        $this->assertSame([$id, 'My phone', 'passkey', true, true, false], [$row['id'], $row['name'], $row['kind'], $row['synced'], $row['current'], $row['disabled']]);
        $this->assertSame(10, $r->json('max'));
        foreach (['credential_id', 'public_key', 'user_handle', 'credential_hash'] as $secret) {
            $this->assertArrayNotHasKey($secret, $row);
        }
    }

    // ------------------------------------------------------------ changing the set of passkeys

    public function test_a_password_session_can_not_add_another_passkey_without_proof_from_one_already_there(): void
    {
        $u = $this->person();
        [$firstId, $first] = $this->add($this->openSession($u));
        $stolen = $this->openSession($u);      // someone with only the password
        $this->as($stolen)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'proof_needed')->assertJsonPath('requires', 'passkey');
        $this->prove($stolen, $first);
        [$secondId] = $this->add($stolen, $this->pk());
        $second = AuthCredential::find($secondId);
        $this->assertSame(['approved', $firstId], [$second->added_method, $second->added_by_id], 'it says which passkey approved this one');
    }

    public function test_proof_is_only_good_for_ten_minutes(): void
    {
        $u = $this->person();
        [, $first] = $this->add($this->openSession($u));
        $token = $this->openSession($u);
        $this->prove($token, $first);
        $this->travel(9)->minutes();
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->travel(2)->minutes();
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
    }

    public function test_a_session_opened_with_a_passkey_is_already_strong_for_ten_minutes(): void
    {
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $token = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->travel(11)->minutes();
        $this->as($token)->postJson('/api/auth/passkeys/register/options')->assertStatus(403);
    }

    public function test_proving_needs_a_passkey_of_your_own(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        [, $da] = $this->add($this->openSession($a));
        [, $db] = $this->add($this->openSession($b));
        $this->as($this->openSession($b))->postJson('/api/auth/passkeys/prove/options')->assertOk();
        $tb = $this->openSession($b);
        $q = $this->as($tb)->postJson('/api/auth/passkeys/prove/options');
        $this->as($tb)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $da->assert($q->json('options'))])->assertStatus(422);
        $this->assertFalse(app(Sessions::class)->freshStrong(\Laravel\Sanctum\PersonalAccessToken::findToken($tb), 10));
    }

    public function test_proving_without_any_passkey_says_so(): void
    {
        $u = $this->person();
        $this->as($this->openSession($u))->postJson('/api/auth/passkeys/prove/options')->assertStatus(409)->assertJsonPath('reason', 'no_passkey');
    }

    public function test_a_proof_question_for_one_person_is_no_use_to_another(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        [, $da] = $this->add($this->openSession($a));
        $this->add($this->openSession($b));
        $q = $this->as($this->openSession($a))->postJson('/api/auth/passkeys/prove/options');
        $tb = $this->openSession($b);
        $this->as($tb)->postJson('/api/auth/passkeys/prove', ['challenge_id' => $q->json('challenge_id'), 'credential' => $da->assert($q->json('options'))])->assertStatus(422);
    }

    public function test_rename_is_only_for_your_own_passkeys(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        $ta = $this->openSession($a);
        [$id] = $this->add($ta);
        $this->as($ta)->patchJson("/api/auth/passkeys/{$id}", ['name' => 'Work laptop'])->assertOk()->assertJsonPath('data.name', 'Work laptop');
        $this->assertSame('Work laptop', AuthCredential::find($id)->name);
        $this->as($this->openSession($b))->patchJson("/api/auth/passkeys/{$id}", ['name' => 'Mine now'])->assertStatus(404);
        $this->as($ta)->patchJson("/api/auth/passkeys/{$id}", ['name' => ''])->assertStatus(422);
        $this->as($ta)->patchJson("/api/auth/passkeys/{$id}", ['name' => str_repeat('x', 81)])->assertStatus(422);
        $this->assertSame('Work laptop', AuthCredential::find($id)->name);
    }

    public function test_removing_a_passkey_needs_proof_ends_its_sign_ins_and_leaves_the_other_devices_alone(): void
    {
        $u = $this->person();
        [$oldId, $old] = $this->add($this->openSession($u));
        $tOld = $this->passkeyLogin($old, [], ['X-Token-In-Body' => '1'])->json('token');        // a session opened with the old phone
        [$newId, $new] = $this->add($tOld, $this->pk());                                                   // approved by it
        $tNew = $this->passkeyLogin($new, [], ['X-Token-In-Body' => '1'])->json('token');        // a session opened with the new phone
        $stolen = $this->openSession($u);
        $this->as($stolen)->deleteJson("/api/auth/passkeys/{$oldId}")->assertStatus(403)->assertJsonPath('reason', 'proof_needed');
        $this->assertNull(AuthCredential::find($oldId)->revoked_at);

        $r = $this->as($tNew)->deleteJson("/api/auth/passkeys/{$oldId}", ['replaced_by' => $newId]);
        $r->assertOk();
        $c = AuthCredential::find($oldId);
        $this->assertSame(['replaced', $newId, $u->id], [$c->revoked_reason, $c->replaced_by_id, $c->revoked_by_id]);
        $this->assertNotNull($c->revoked_at);
        $this->assertTrue($r->json('sessions_ended') >= 2, 'the sessions the old phone opened ended');
        $this->as($tOld)->getJson('/api/auth/me')->assertStatus(401);
        $this->as($tNew)->getJson('/api/auth/me')->assertOk();
        $this->assertSame(1, \Laravel\Sanctum\PersonalAccessToken::whereKey(\Laravel\Sanctum\PersonalAccessToken::findToken($stolen)->id)->count(), 'a session that did not use it stays');
        $this->passkeyLogin($old)->assertStatus(422);   // and the removed passkey signs nobody in
        $line = SecurityEvent::where('event', 'passkey_removed')->first();
        $this->assertSame(['warning', $oldId, 'replaced', $newId], [$line->severity, $line->detail['credential'], $line->detail['reason'], $line->detail['replaced_by']]);
    }

    public function test_the_list_tells_the_story_of_a_device_that_was_replaced(): void
    {
        $u = $this->person();
        [$oldId, $old] = $this->add($this->openSession($u));
        $t = $this->passkeyLogin($old, [], ['X-Token-In-Body' => '1'])->json('token');
        [$newId, $new] = $this->add($t, $this->pk());
        $this->as($t)->patchJson("/api/auth/passkeys/{$oldId}", ['name' => 'Pixel 7'])->assertOk();
        $this->as($t)->patchJson("/api/auth/passkeys/{$newId}", ['name' => 'Pixel 9'])->assertOk();
        $this->as($t)->deleteJson("/api/auth/passkeys/{$oldId}", ['replaced_by' => $newId])->assertOk();
        $t2 = $this->passkeyLogin($new, [], ['X-Token-In-Body' => '1'])->json('token');
        $r = $this->as($t2)->getJson('/api/auth/passkeys');
        $r->assertOk();
        $this->assertCount(1, $r->json('data'));
        $row = $r->json('data.0');
        $this->assertSame(['Pixel 9', 'Pixel 7', 'approved'], [$row['name'], $row['approved_by_name'], $row['added_method']]);
        $this->assertSame(['Pixel 7'], array_column($row['replaces'], 'name'));
        $this->assertNotEmpty($row['replaces'][0]['removed_at']);
        $this->assertCount(1, $r->json('history'));
        $h = $r->json('history.0');
        $this->assertSame(['Pixel 7', 'replaced', 'Pixel 9'], [$h['name'], $h['reason'], $h['replaced_by_name']]);
        [$thirdId] = $this->add($t2, $this->pk());
        $rows = collect($this->as($t2)->getJson('/api/auth/passkeys')->json('data'))->keyBy('id');
        $this->assertSame([], $rows[$thirdId]['replaces'], 'a passkey that took nobody\'s place says so');
        $this->assertCount(1, $rows[$newId]['replaces']);
    }

    public function test_one_persons_history_is_theirs_alone(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        [$id, $d] = $this->add($this->openSession($a));
        $t = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        $this->add($t, $this->pk());
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}", ['reason' => 'lost'])->assertOk();
        [, $db] = $this->add($this->openSession($b));
        $tb = $this->passkeyLogin($db, [], ['X-Token-In-Body' => '1'])->json('token');
        $this->assertSame([], $this->as($tb)->getJson('/api/auth/passkeys')->json('history'));
    }

    public function test_the_reason_is_kept_and_a_wrong_replacement_is_refused(): void
    {
        $u = $this->person();
        [$id, $d] = $this->add($this->openSession($u));
        $t = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        [$id2] = $this->add($t, $this->pk());
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}", ['replaced_by' => 99999])->assertStatus(422);
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}", ['replaced_by' => $id])->assertStatus(422);
        $this->assertNull(AuthCredential::find($id)->revoked_at);
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id2}", ['reason' => 'lost'])->assertOk();
        $c = AuthCredential::find($id2);
        $this->assertSame(['lost', null], [$c->revoked_reason, $c->replaced_by_id]);
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id2}")->assertStatus(404);
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}", ['reason' => 'because'])->assertStatus(422);
    }

    public function test_one_person_can_not_remove_anothers_passkey(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        [$id] = $this->add($this->openSession($a));
        [, $db] = $this->add($this->openSession($b));
        $tb = $this->passkeyLogin($db, [], ['X-Token-In-Body' => '1'])->json('token');
        $this->as($tb)->deleteJson("/api/auth/passkeys/{$id}")->assertStatus(404);
        $this->assertNull(AuthCredential::find($id)->revoked_at);
    }

    public function test_the_browser_that_used_a_removed_passkey_loses_its_cookie(): void
    {
        config(['security.cookie.enabled' => true]);
        $u = $this->person();
        [$id, $d] = $this->add($this->openSession($u));
        $q = $this->anon()->postJson('/api/auth/passkeys/options');
        $login = $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
        $cookie = collect($login->headers->getCookies())->first();
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];
        $r = $this->withCredentials()->withUnencryptedCookie($cookie->getName(), $cookie->getValue())->withHeaders(['X-CSRF-Token' => $login->json('csrf'), 'Origin' => 'https://targetisl.co.ke'])->deleteJson("/api/auth/passkeys/{$id}");
        $r->assertOk();
        $gone = collect($r->headers->getCookies())->first(fn (Cookie $c) => $c->getName() === 'tisl_session');
        $this->assertNotNull($gone);
        $this->assertLessThan(time(), $gone->getExpiresTime());
    }

    public function test_the_doors_need_a_signed_in_person_and_are_slowed_down(): void
    {
        foreach (['getJson' => '/api/auth/passkeys', 'postJson' => '/api/auth/passkeys/register/options'] as $m => $url) {
            $this->anon()->{$m}($url)->assertStatus(401);
        }
        config(['security.rate_limits.passkey_manage' => ['user' => [[2, 15]]]]);
        $t = $this->openSession($this->person());
        $codes = [];
        for ($i = 0; $i < 4; $i++) {
            $codes[] = $this->as($t)->getJson('/api/auth/passkeys')->getStatusCode();
        }
        $this->assertSame([200, 200, 429, 429], $codes);
    }

    public function test_the_list_of_sign_ins_says_which_are_strong(): void
    {
        $u = $this->person();
        $a = $this->openSession($u);
        $aId = \Laravel\Sanctum\PersonalAccessToken::findToken($a)->id;
        $strong = fn (string $as) => collect($this->as($as)->getJson('/api/auth/sessions')->json('data'))->mapWithKeys(fn ($r) => [$r['id'] => $r['strong']])->all();
        $this->assertSame([$aId => false], $strong($a));
        [, $d] = $this->add($a);
        $this->assertSame([$aId => true], $strong($a), 'adding a passkey lifted this one');
        $b = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        $bId = \Laravel\Sanctum\PersonalAccessToken::findToken($b)->id;
        $c = $this->openSession($u);
        $cId = \Laravel\Sanctum\PersonalAccessToken::findToken($c)->id;
        $this->assertEquals([$aId => true, $bId => true, $cId => false], $strong($b));
    }

    public function test_a_lost_passkey_ends_every_other_sign_in_not_only_its_own(): void
    {
        $u = $this->person();
        [$lostId, $lost] = $this->add($this->openSession($u));
        $t = $this->passkeyLogin($lost, [], ['X-Token-In-Body' => '1'])->json('token');
        [, $other] = $this->add($t, $this->pk());
        $keep = $this->passkeyLogin($other, [], ['X-Token-In-Body' => '1'])->json('token');
        $unrelated = $this->openSession($u);
        $this->as($keep)->deleteJson("/api/auth/passkeys/{$lostId}", ['reason' => 'lost'])->assertOk();
        $this->as($keep)->getJson('/api/auth/me')->assertOk();
        $this->as($unrelated)->getJson('/api/auth/me')->assertStatus(401);
        $this->as($t)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_a_passkey_used_only_to_prove_does_not_take_over_the_session_it_proved_in(): void
    {
        $u = $this->person();
        [$firstId, $first] = $this->add($this->openSession($u));
        $t = $this->passkeyLogin($first, [], ['X-Token-In-Body' => '1'])->json('token');
        [$secondId] = $this->add($t, $this->pk());
        $this->assertSame($firstId, AuthSession::where('token_id', \Laravel\Sanctum\PersonalAccessToken::findToken($t)->id)->first()->credential_id);
        $this->assertNotSame($firstId, $secondId);
    }

    // ------------------------------------------------------------ the rest of the doors' rules

    public function test_a_passkey_that_is_already_switched_off_can_be_tidied_away_without_further_proof(): void
    {
        $u = $this->person();
        [$id] = $this->add($this->openSession($u));
        AuthCredential::find($id)->forceFill(['disabled_at' => now(), 'disabled_reason' => 'clone_suspected'])->save();
        $t = $this->openSession($u);
        $this->travel(30)->minutes();   // a stale session, with no passkey that can prove anything
        $this->as($t)->deleteJson("/api/auth/passkeys/{$id}")->assertOk();
        $this->assertNotNull(AuthCredential::find($id)->revoked_at);
    }

    public function test_a_replacement_must_be_one_of_your_own_passkeys(): void
    {
        $a = $this->person();
        $b = $this->person('baraka@example.com', ['name' => 'Baraka']);
        [$mine, $d] = $this->add($this->openSession($a));
        [$theirs] = $this->add($this->openSession($b));
        $t = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        $this->as($t)->deleteJson("/api/auth/passkeys/{$mine}", ['replaced_by' => $theirs])->assertStatus(422);
        $this->assertNull(AuthCredential::find($mine)->revoked_at);
    }

    public function test_removing_a_different_passkey_leaves_this_browsers_cookie_alone(): void
    {
        config(['security.cookie.enabled' => true]);
        $u = $this->person();
        [, $d] = $this->add($this->openSession($u));
        $strong = $this->passkeyLogin($d, [], ['X-Token-In-Body' => '1'])->json('token');
        [$otherId] = $this->add($strong, $this->pk());
        $q = $this->anon()->postJson('/api/auth/passkeys/options');
        $login = $this->anon()->postJson('/api/auth/passkeys/login', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
        $cookie = collect($login->headers->getCookies())->first();
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];
        $r = $this->withCredentials()->withUnencryptedCookie($cookie->getName(), $cookie->getValue())->withHeaders(['X-CSRF-Token' => $login->json('csrf'), 'Origin' => 'https://targetisl.co.ke'])->deleteJson("/api/auth/passkeys/{$otherId}");
        $r->assertOk();
        $this->assertNull(collect($r->headers->getCookies())->first(fn (Cookie $c) => $c->getName() === 'tisl_session'), 'this browser stays signed in');
    }

    public function test_the_passkey_sign_in_door_itself_is_slowed_down(): void
    {
        config(['security.rate_limits.passkey' => ['ip' => [[3, 1]]]]);
        $codes = [];
        for ($i = 0; $i < 5; $i++) {
            $codes[] = $this->anon()->postJson('/api/auth/passkeys/login', [])->getStatusCode();
        }
        $this->assertSame([422, 422, 422, 429, 429], $codes);
    }

    public function test_a_customer_who_must_accept_new_policies_is_asked_even_when_signing_in_with_a_passkey(): void
    {
        \Illuminate\Support\Facades\Schema::create('policies', function ($t) {
            $t->id(); $t->string('key'); $t->string('title')->nullable(); $t->text('content')->nullable(); $t->text('disagree_consequence_text')->nullable(); $t->string('sensitivity')->nullable();
            $t->unsignedInteger('major_version')->default(1); $t->unsignedInteger('minor_version')->default(0); $t->string('version')->nullable(); $t->boolean('requires_acceptance')->default(true); $t->boolean('is_active')->default(true);
            $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps();
        });
        \Illuminate\Support\Facades\Schema::create('policy_acceptances', function ($t) {
            $t->id(); $t->unsignedBigInteger('policy_id')->nullable(); $t->string('policy_key'); $t->string('policy_version')->nullable(); $t->text('policy_snapshot')->nullable(); $t->unsignedBigInteger('customer_id')->nullable();
            $t->unsignedBigInteger('user_id')->nullable(); $t->string('customer_number')->nullable(); $t->string('action_context')->nullable(); $t->string('reference_type')->nullable(); $t->unsignedBigInteger('reference_id')->nullable();
            $t->string('response'); $t->text('disagree_reason')->nullable(); $t->string('ip_address')->nullable(); $t->string('user_agent')->nullable(); $t->boolean('was_successful')->default(true); $t->boolean('flagged')->default(false); $t->timestamp('accepted_at')->nullable(); $t->timestamps();
        });
        \Illuminate\Support\Facades\DB::table('policies')->insert(['key' => 'terms_of_use', 'title' => 'Terms', 'major_version' => 2, 'version' => '2.0', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $u = $this->person();
        \Illuminate\Support\Facades\DB::table('customers')->insert(['user_id' => $u->id, 'first_name' => 'Amina']);
        [, $d] = $this->add($this->openSession($u));
        $before = AuthSession::count();
        $r = $this->passkeyLogin($d);
        $r->assertOk();
        $this->assertTrue($r->json('requires_policy_acceptance'));
        $this->assertSame('terms_of_use', $r->json('policies.0.key'));
        $this->assertSame($before, AuthSession::count(), 'no session until they have accepted');
    }
}
