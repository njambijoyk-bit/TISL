<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AuthController;
use App\Models\Security\AuthEmailLink;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Security\EmailSignInLink;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** Phase 4.1: the one-time sign-in link a customer can ask for by email. */
class EmailSignInLinkTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    /** @var array<int, array{to: int, type: string, message: string, options: array}> */
    public array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        config(['security.rate_limits.email_link' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]], 'security.rate_limits.email_link_use' => ['ip' => [[1000, 1]]],
            'security.email_link.enabled' => true, 'security.email_link.minutes' => 15, 'security.email_link.resend_seconds' => 60, 'security.cookie.secure' => false]);
        $test = $this;
        $this->app->instance(Notifier::class, new class($test) extends Notifier {
            public function __construct(private $test) {}

            public function send(Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->test->sent[] = ['to' => $to->getKey(), 'type' => $type, 'message' => $message, 'options' => $o];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
    }

    private function person(string $role = 'customer', string $email = 'amina@example.com'): User
    {
        return User::forceCreate(['name' => 'Amina Wanjiru', 'email' => $email, 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    /** Ask for a link; returns [response, the browser cookie, the code in the emailed link or null]. */
    private function ask(string $email = 'amina@example.com', array $server = []): array
    {
        $before = count($this->sent);
        $res = $this->withServerVariables($server)->postJson('/api/auth/email-link', ['email' => $email]);
        $cookie = $res->getCookie('tisl_link', false);
        $code = null;
        if (count($this->sent) > $before) {
            parse_str((string) parse_url($this->sent[array_key_last($this->sent)]['options']['action_url'], PHP_URL_QUERY), $q);
            $code = $q['k'];
        }

        return [$res, $cookie?->getValue(), $code];
    }

    private function open(string $path, ?string $code, ?string $binder, array $extra = [])
    {
        $t = $binder === null ? $this : $this->withCredentials()->withUnencryptedCookie('tisl_link', $binder);

        return $t->postJson('/api/auth/email-link/'.$path, ['k' => $code ?? str_repeat('a', 48)] + $extra);
    }

    public function test_a_customer_is_emailed_a_link_and_signs_in_with_it_in_the_same_browser(): void
    {
        $u = $this->person();
        [$res, $binder, $code] = $this->ask();
        $res->assertOk();
        $this->assertNotNull($code);
        $this->assertNotEmpty($binder);
        $mail = $this->sent[0];
        $this->assertSame(['email_sign_in_link', $u->id], [$mail['type'], $mail['to']]);
        $this->assertSame(['email'], $mail['options']['only'], 'by email only, never to a WhatsApp list');
        $this->assertTrue($mail['options']['no_bell'], 'a link that signs someone in is kept out of the bell');
        $this->assertStringNotContainsString($code, $mail['message']);

        $this->open('check', $code, $binder)->assertOk()->assertJson(['ok' => true, 'name' => 'Amina Wanjiru']);
        $this->assertSame(0, AuthSession::count(), 'looking at the page signs nobody in (a mail scanner may open it)');
        $res = $this->open('confirm', $code, $binder)->assertOk();
        $this->assertSame($u->id, $res->json('user.id'));
        $this->assertSame(1, $u->tokens()->count());
        $this->assertSame('email_link', AuthSession::first()->method);
        $this->assertSame('email_link', SecurityEvent::where('event', 'sign_in')->first()->detail['method']);
    }

    public function test_the_link_only_works_once(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $this->open('confirm', $code, $binder)->assertOk();
        $this->open('confirm', $code, $binder)->assertStatus(422)->assertJson(['reason' => 'expired']);
        $this->open('check', $code, $binder)->assertStatus(422);
        $this->assertSame(1, User::first()->tokens()->count());
    }

    public function test_the_link_runs_out(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $this->travel(16)->minutes();
        $this->open('confirm', $code, $binder)->assertStatus(422)->assertJson(['reason' => 'expired']);
        $this->assertSame(0, User::first()->tokens()->count());
    }

    public function test_a_link_on_another_browser_does_nothing_and_does_not_use_it_up(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $this->open('confirm', $code, null)->assertStatus(422)->assertJson(['reason' => 'other_browser']);
        $this->open('confirm', $code, 'someone-elses-cookie-code')->assertStatus(422)->assertJson(['reason' => 'other_browser']);
        $this->assertSame(0, User::first()->tokens()->count());
        $this->open('confirm', $code, $binder)->assertOk();   // the real browser still can
    }

    public function test_a_few_wrong_browser_tries_burn_the_link(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        for ($i = 0; $i < 5; $i++) {
            $this->open('confirm', $code, null)->assertStatus(422);
        }
        $this->open('confirm', $code, $binder)->assertStatus(422)->assertJson(['reason' => 'expired']);
    }

    public function test_the_page_tells_a_wrong_browser_nothing_about_the_person(): void
    {
        $this->person();
        [, , $code] = $this->ask();
        $res = $this->open('check', $code, null)->assertStatus(422);
        $this->assertArrayNotHasKey('name', $res->json());
    }

    public function test_a_made_up_or_malformed_code_does_nothing(): void
    {
        $this->person();
        [, $binder] = $this->ask();
        foreach ([str_repeat('a', 48), 'short', str_repeat('a', 49), '../../etc'] as $bad) {
            $this->open('confirm', $bad, $binder)->assertStatus(422);
        }
        $this->postJson('/api/auth/email-link/confirm', [])->assertStatus(422);
        $this->postJson('/api/auth/email-link/confirm', ['k' => ['a']])->assertStatus(422);
    }

    public function test_the_code_is_kept_only_as_a_hash(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $row = AuthEmailLink::first();
        $this->assertNotSame($code, $row->id);
        $this->assertSame(hash('sha256', $code), $row->id);
        $this->assertSame(hash('sha256', $binder), $row->binder_hash);
        $this->assertStringNotContainsString($code, json_encode($row->getAttributes()));
    }

    public function test_a_new_request_kills_the_earlier_link(): void
    {
        $this->person();
        [, $b1, $c1] = $this->ask();
        $this->travel(61)->seconds();
        [, $b2, $c2] = $this->ask();
        $this->assertNotSame($c1, $c2);
        $this->open('confirm', $c1, $b1)->assertStatus(422);
        $this->open('confirm', $c2, $b2)->assertOk();
    }

    public function test_asking_again_within_a_minute_does_not_flood_the_inbox(): void
    {
        $this->person();
        $this->ask();
        [$res, , $code] = $this->ask();
        $res->assertOk();
        $this->assertNull($code);
        $this->assertCount(1, $this->sent);
    }

    public function test_staff_never_get_a_link_and_the_answer_is_the_same_as_for_a_customer(): void
    {
        $this->person('customer', 'c@example.com');
        foreach (['admin', 'finance', 'super_admin'] as $i => $role) {
            $this->person($role, "s{$i}@example.com");
        }
        [$known] = $this->ask('c@example.com');
        $answers = [$known->json()];
        foreach (['s0@example.com', 's1@example.com', 's2@example.com', 'nobody@example.com'] as $email) {
            [$res, $cookie, $code] = $this->ask($email);
            $this->assertNull($code, "no link for {$email}");
            $this->assertNotEmpty($cookie, 'the browser gets its cookie anyway, so that does not give the account away either');
            $answers[] = $res->json();
        }
        $this->assertCount(1, $this->sent);
        $this->assertCount(1, array_unique(array_map('json_encode', $answers)), 'the same answer whoever the email belongs to');
        $this->assertSame(1, AuthEmailLink::count());
    }

    public function test_a_suspended_customer_gets_no_link_and_one_who_is_suspended_after_asking_cannot_use_it(): void
    {
        $u = $this->person();
        $u->forceFill(['status' => 'suspended'])->save();
        [, , $code] = $this->ask();
        $this->assertNull($code);
        $u->forceFill(['status' => 'active'])->save();
        [, $binder, $code] = $this->ask();
        $u->forceFill(['status' => 'suspended'])->save();
        $this->open('confirm', $code, $binder)->assertStatus(422);
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_a_customer_who_becomes_staff_after_asking_cannot_use_the_link(): void
    {
        $u = $this->person();
        [, $binder, $code] = $this->ask();
        $u->forceFill(['role' => 'admin'])->save();
        app(\App\Services\Access\Authorizer::class)->forget($u->id);   // (the roles of a person are remembered for the request)
        $this->open('confirm', $code, $binder)->assertStatus(422);
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_it_can_be_switched_off(): void
    {
        $this->person();
        config(['security.email_link.enabled' => false]);
        [$res, , $code] = $this->ask();
        $res->assertOk();
        $this->assertNull($code);
        config(['security.email_link.enabled' => true]);
        [, $binder, $code] = $this->ask();
        config(['security.email_link.enabled' => false]);
        $this->open('confirm', $code, $binder)->assertStatus(422);
    }

    public function test_asking_is_limited_by_email_and_address(): void
    {
        config(['security.rate_limits.email_link' => ['email_ip' => [[2, 15]], 'ip' => [[100, 15]]]]);
        $this->person();
        $this->ask()[0]->assertOk();
        $this->ask()[0]->assertOk();
        $this->ask()[0]->assertStatus(429);
        $this->postJson('/api/auth/email-link', ['email' => 'other@example.com'])->assertOk();   // another email from the same address has its own count
    }

    public function test_using_links_is_limited_by_address(): void
    {
        config(['security.rate_limits.email_link_use' => ['ip' => [[3, 15]]]]);
        for ($i = 0; $i < 3; $i++) {
            $this->open('confirm', null, null)->assertStatus(422);
        }
        $this->open('confirm', null, null)->assertStatus(429);
    }

    public function test_the_binder_cookie_cannot_be_read_by_scripts(): void
    {
        $this->person();
        $res = $this->postJson('/api/auth/email-link', ['email' => 'amina@example.com']);
        $c = $res->getCookie('tisl_link', false);
        $this->assertTrue($c->isHttpOnly());
        $this->assertSame('lax', strtolower((string) $c->getSameSite()));
    }

    public function test_a_wrong_email_shape_is_refused_before_anything_happens(): void
    {
        $this->postJson('/api/auth/email-link', ['email' => 'not an email'])->assertStatus(422);
        $this->postJson('/api/auth/email-link', [])->assertStatus(422);
        $this->assertSame([], $this->sent);
    }

    public function test_the_signing_in_cookie_clears_the_binder_and_a_new_browser_is_not_announced(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $this->open('confirm', $code, $binder)->assertOk();
        $this->assertSame([], array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'new_sign_in')));
    }
    public function test_someone_who_is_a_customer_and_also_staff_is_never_eligible(): void
    {
        $both = new class extends User {
            public function isCustomer(): bool { return true; }

            public function isStaff(): bool { return true; }

            public function canLogin(): bool { return true; }

            public function trashed(): bool { return false; }
        };
        $this->assertFalse(EmailSignInLink::eligible($both));
        $plain = new class extends User {
            public function isCustomer(): bool { return true; }

            public function isStaff(): bool { return false; }

            public function canLogin(): bool { return true; }

            public function trashed(): bool { return false; }
        };
        $this->assertTrue(EmailSignInLink::eligible($plain));
    }

    public function test_policies_that_must_be_accepted_come_first_and_leave_the_link_usable(): void
    {
        $u = $this->person();
        [, $binder, $code] = $this->ask();
        $stop = true;
        $this->partialMock(AuthController::class, function ($m) use (&$stop) { $m->shouldReceive('policyGate')->andReturnUsing(function () use (&$stop) { return $stop ? response()->json(['requires_policy_acceptance' => true, 'policies' => []], 200) : null; }); });
        $this->open('confirm', $code, $binder)->assertOk()->assertJson(['requires_policy_acceptance' => true]);
        $this->assertSame(0, $u->tokens()->count(), 'not signed in until the policies are accepted');
        $stop = false;
        $this->open('confirm', $code, $binder)->assertOk()->assertJsonMissing(['requires_policy_acceptance' => true]);
        $this->assertSame(1, $u->tokens()->count());
    }

    public function test_signing_in_from_a_new_device_by_email_link_does_not_also_send_a_new_browser_email(): void
    {
        $u = $this->person();
        app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
        [, $binder, $code] = $this->ask('amina@example.com', ['HTTP_USER_AGENT' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'REMOTE_ADDR' => '102.5.5.5']);
        $this->withServerVariables(['HTTP_USER_AGENT' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'REMOTE_ADDR' => '102.5.5.5']);
        $this->open('confirm', $code, $binder)->assertOk();
        $this->assertSame(2, $u->tokens()->count());
        $this->assertSame([], array_values(array_filter($this->sent, fn ($m) => $m['type'] === 'new_sign_in')));
    }

    public function test_old_links_are_swept_away_and_new_ones_kept(): void
    {
        $this->person();
        [, $binder, $code] = $this->ask();
        $this->travel(3)->hours();
        $this->assertSame(0, EmailSignInLink::prune());
        $this->travel(2)->days();
        $this->assertSame(1, EmailSignInLink::prune());
        $this->assertSame(0, AuthEmailLink::count());
    }
}
