<?php

namespace Tests\Feature;

use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\KnownDevice;
use App\Services\Security\SealPhrase;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The seal phrase: shown on the sign-in page only to a browser that has signed in as that person before, and to nobody else, whatever they type. */
class SealPhraseTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        SealPhrase::forget();
        Cache::flush();
        config(['security.cookie.enabled' => true]);        // (the way a browser signs in)
        config(['security.rate_limits.sign_in' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]], 'security.rate_limits.seal' => ['ip' => [[1000, 1]]], 'security.rate_limits.guess' => ['user' => [[1000, 15]]]]);
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

    private function person(string $email): User
    {
        return User::forceCreate(['name' => 'Someone', 'email' => $email, 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function fresh(): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this;
    }

    /** Sign in through the real door, from a browser that sends `$cookie` (the known-device note it already holds). @return string|null the known-device note the answer hands back */
    private function signIn(string $email, ?string $cookie = null): ?string
    {
        $r = $this->fresh()->withCredentials()->withUnencryptedCookies($cookie ? ['tisl_known' => $cookie] : [])->postJson('/api/auth/login', ['email' => $email, 'password' => 'Right-password-1']);
        $r->assertOk();
        foreach ($r->headers->getCookies() as $c) {
            if ($c->getName() === 'tisl_known') {
                return $c->getValue();
            }
        }

        return null;
    }

    private function token(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    private function choose(User $u, string $phrase = 'blue elephant 42'): void
    {
        $this->fresh()->withHeader('Authorization', 'Bearer '.$this->token($u))->putJson('/api/auth/seal', ['phrase' => $phrase, 'current_password' => 'Right-password-1'])->assertOk();
    }

    private function ask(string $email, ?string $cookie = null)
    {
        return $this->fresh()->withCredentials()->withUnencryptedCookies($cookie ? ['tisl_known' => $cookie] : [])->postJson('/api/auth/seal', ['email' => $email]);
    }

    // ------------------------------------------------------------ the note a browser keeps

    public function test_signing_in_leaves_a_note_that_this_browser_is_theirs(): void
    {
        $u = $this->person('amina@example.com');
        $note = $this->signIn('amina@example.com');
        $this->assertNotNull($note);
        $this->assertStringStartsWith($u->id.'.', $note);                      // (the account, then the signature)
        $this->assertStringNotContainsString('Right-password', $note);
    }

    public function test_the_note_cannot_be_read_by_the_page(): void
    {
        $this->person('amina@example.com');
        $r = $this->fresh()->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $cookie = collect($r->headers->getCookies())->first(fn ($c) => $c->getName() === 'tisl_known');
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
    }

    public function test_the_note_grows_to_hold_each_account_and_stays_short(): void
    {
        $note = null;
        $ids = [];
        for ($i = 1; $i <= 12; $i++) {
            $ids[] = $this->person("p{$i}@example.com")->id;
            $note = $this->signIn("p{$i}@example.com", $note);
        }
        $known = explode(',', explode('.', $note)[0]);
        $this->assertCount(KnownDevice::MAX, $known);
        $this->assertSame((string) $ids[11], $known[0]);                          // newest first
        $this->assertNotContains((string) $ids[0], $known);                       // the oldest dropped off
    }

    public function test_signing_in_again_moves_the_person_to_the_front_without_repeating(): void
    {
        $a = $this->person('a@example.com');
        $b = $this->person('b@example.com');
        $note = $this->signIn('a@example.com');
        $note = $this->signIn('b@example.com', $note);
        $note = $this->signIn('a@example.com', $note);
        $this->assertSame($a->id.','.$b->id, explode('.', $note)[0]);
    }

    // ------------------------------------------------------------ who is shown the phrase

    public function test_a_browser_that_has_signed_in_before_is_shown_the_phrase(): void
    {
        $u = $this->person('amina@example.com');
        $this->choose($u);
        $note = $this->signIn('amina@example.com');
        $this->ask('amina@example.com', $note)->assertOk()->assertExactJson(['phrase' => 'blue elephant 42']);
        $this->ask('AMINA@example.com ', $note)->assertOk()->assertJsonPath('phrase', 'blue elephant 42');          // however the email is typed
    }

    public function test_a_stranger_is_shown_nothing(): void
    {
        $u = $this->person('amina@example.com');
        $this->choose($u);
        $this->ask('amina@example.com')->assertOk()->assertExactJson(['phrase' => null]);
    }

    public function test_someone_elses_browser_is_not_enough(): void
    {
        $this->choose($this->person('amina@example.com'));
        $other = $this->person('baraka@example.com');
        $note = $this->signIn('baraka@example.com');
        $this->ask('amina@example.com', $note)->assertOk()->assertExactJson(['phrase' => null]);
    }

    public function test_a_note_that_was_changed_is_worthless(): void
    {
        $u = $this->person('amina@example.com');
        $this->choose($u);
        $other = $this->person('baraka@example.com');
        $note = $this->signIn('baraka@example.com');
        [$ids, $sig] = explode('.', $note);
        $this->ask('amina@example.com', $u->id.'.'.$sig)->assertExactJson(['phrase' => null]);                    // another account's signature
        $this->ask('amina@example.com', $ids.','.$u->id.'.'.$sig)->assertExactJson(['phrase' => null]);            // an account added by hand
        $this->ask('amina@example.com', $u->id.'.')->assertExactJson(['phrase' => null]);
        $this->ask('amina@example.com', (string) $u->id)->assertExactJson(['phrase' => null]);
        $this->ask('amina@example.com', '.'.$sig)->assertExactJson(['phrase' => null]);
    }

    public function test_a_note_made_with_another_key_is_worthless(): void
    {
        $u = $this->person('amina@example.com');
        $this->choose($u);
        $note = $this->signIn('amina@example.com');
        config(['app.key' => 'base64:'.base64_encode(str_repeat('z', 32))]);
        $this->ask('amina@example.com', $note)->assertExactJson(['phrase' => null]);
    }

    public function test_the_answer_looks_the_same_for_an_email_with_no_account_or_no_phrase(): void
    {
        $this->person('amina@example.com');                                        // has an account but no phrase
        $note = $this->signIn('amina@example.com');
        $a = $this->ask('amina@example.com', $note);
        $b = $this->ask('nobody@example.com', $note);
        $c = $this->ask('amina@example.com');
        foreach ([$a, $b, $c] as $r) {
            $r->assertOk()->assertExactJson(['phrase' => null]);
        }
        $this->fresh()->postJson('/api/auth/seal', [])->assertOk()->assertExactJson(['phrase' => null]);
        $this->fresh()->postJson('/api/auth/seal', ['email' => ['a@b.c']])->assertOk()->assertExactJson(['phrase' => null]);
    }

    public function test_a_passkey_sign_in_leaves_the_note_too(): void
    {
        // (the same door for every way of signing in: password, reset, passkey)
        $u = $this->person('amina@example.com');
        $r = $this->fresh()->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $this->assertTrue(collect($r->headers->getCookies())->contains(fn ($c) => $c->getName() === 'tisl_known'));
    }

    public function test_a_note_that_lists_more_accounts_than_allowed_is_read_only_as_far_as_the_cap(): void
    {
        $payload = implode(',', range(1, 12));
        $note = $payload.'.'.hash_hmac('sha256', 'known-device|'.$payload, (string) config('app.key'));            // (signed properly, as only this server could)
        $request = Request::create('/x', 'POST', [], ['tisl_known' => $note]);
        $this->assertSame(range(1, KnownDevice::MAX), KnownDevice::read($request));
    }

    public function test_a_job_applicant_does_not_get_a_note_because_their_number_could_be_a_users(): void
    {
        $applicant = new \App\Models\Applicant();
        $applicant->id = 7;
        $request = Request::create('/api/careers/auth/login', 'POST');
        $response = \App\Services\Security\SessionCookie::respond($request, ['ok' => true], 200, '1|abc', $applicant);
        $names = array_map(fn ($c) => $c->getName(), $response->headers->getCookies());
        $this->assertContains('tisl_applicant', $names);
        $this->assertNotContains('tisl_known', $names);
    }

    public function test_a_client_that_is_not_a_browser_gets_no_note(): void
    {
        $this->person('amina@example.com');
        $r = $this->fresh()->withHeader('X-Token-In-Body', '1')->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $this->assertFalse(collect($r->headers->getCookies())->contains(fn ($c) => $c->getName() === 'tisl_known'));
    }

    // ------------------------------------------------------------ choosing it

    public function test_choosing_a_phrase_needs_the_password(): void
    {
        $u = $this->person('amina@example.com');
        $t = $this->token($u);
        $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->putJson('/api/auth/seal', ['phrase' => 'blue elephant 42'])->assertStatus(422);
        $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->putJson('/api/auth/seal', ['phrase' => 'blue elephant 42', 'current_password' => 'wrong'])->assertStatus(422);
        $this->fresh()->putJson('/api/auth/seal', ['phrase' => 'blue elephant 42', 'current_password' => 'Right-password-1'])->assertStatus(401);
        $this->assertSame(0, \DB::table('auth_seals')->count());
    }

    public function test_the_phrase_is_checked_and_tidied(): void
    {
        $u = $this->person('amina@example.com');
        $t = $this->token($u);
        foreach (['', 'ab', str_repeat('x', 41), '<script>alert(1)</script>', 'hello <b>', "line\nbreak", '  '] as $bad) {
            $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->putJson('/api/auth/seal', ['phrase' => $bad, 'current_password' => 'Right-password-1'])->assertStatus(422);
        }
        $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->putJson('/api/auth/seal', ['phrase' => "  Mnazi   wa  Pwani  ", 'current_password' => 'Right-password-1'])->assertOk()->assertJsonPath('phrase', 'Mnazi wa Pwani');
        $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->putJson('/api/auth/seal', ['phrase' => 'Maji ya moto, kahawa!', 'current_password' => 'Right-password-1'])->assertOk();
    }

    public function test_choosing_again_replaces_it_and_it_can_be_removed(): void
    {
        $u = $this->person('amina@example.com');
        $t = $this->token($u);
        $this->choose($u, 'first words');
        $this->choose($u, 'second words');
        $this->assertSame(1, \DB::table('auth_seals')->count());
        $this->assertSame('second words', $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->getJson('/api/auth/seal')->json('phrase'));
        $note = $this->signIn('amina@example.com');
        $this->ask('amina@example.com', $note)->assertJsonPath('phrase', 'second words');
        $this->fresh()->withHeader('Authorization', 'Bearer '.$t)->deleteJson('/api/auth/seal')->assertOk();
        $this->ask('amina@example.com', $note)->assertJsonPath('phrase', null);
        $this->assertSame(2 + 1, SecurityEvent::where('event', 'seal_phrase_changed')->count());
    }

    public function test_one_persons_phrase_is_not_anothers(): void
    {
        $a = $this->person('a@example.com');
        $b = $this->person('b@example.com');
        $this->choose($a, 'only for a');
        $this->assertNull($this->fresh()->withHeader('Authorization', 'Bearer '.$this->token($b))->getJson('/api/auth/seal')->json('phrase'));
        $this->fresh()->withHeader('Authorization', 'Bearer '.$this->token($b))->deleteJson('/api/auth/seal')->assertOk();
        $this->assertSame('only for a', \DB::table('auth_seals')->where('user_id', $a->id)->value('phrase'));
    }

    // ------------------------------------------------------------ speed and set-up

    public function test_asking_over_and_over_is_slowed_down(): void
    {
        config(['security.rate_limits.seal' => ['ip' => [[3, 1]]]]);
        \App\Services\Security\RateLimits::register();
        for ($i = 0; $i < 3; $i++) {
            $this->ask('amina@example.com')->assertOk();
        }
        $this->ask('amina@example.com')->assertStatus(429);
    }

    public function test_before_script_127_nothing_is_shown_and_nothing_can_be_saved(): void
    {
        $u = $this->person('amina@example.com');
        Schema::drop('auth_seals');
        SealPhrase::forget();
        $note = $this->signIn('amina@example.com');
        $this->ask('amina@example.com', $note)->assertOk()->assertExactJson(['phrase' => null]);
        $this->fresh()->withHeader('Authorization', 'Bearer '.$this->token($u))->putJson('/api/auth/seal', ['phrase' => 'blue elephant 42', 'current_password' => 'Right-password-1'])->assertStatus(409);
        $this->fresh()->withHeader('Authorization', 'Bearer '.$this->token($u))->getJson('/api/auth/seal')->assertOk()->assertJsonPath('ready', false);
    }
}
