<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthPendingAction;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** "One more step": the sensitive actions, the question the server writes down, and the answer that is bound to exactly that question. */
class StepUpTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Cache::flush();
        config(['security.rate_limits.passkey' => ['ip' => [[1000, 1]]], 'security.rate_limits.passkey_manage' => ['user' => [[1000, 15]]], 'security.rate_limits.step_up' => ['user' => [[1000, 15]]]]);
        Route::middleware(['api', 'auth:sanctum', 'assurance:payment_keys'])->put('/api/_keys', fn (Request $r) => response()->json(['ok' => true, 'n' => $r->input('n')]));
        Route::middleware(['api', 'auth:sanctum', 'assurance:export_bulk'])->post('/api/_export', fn (Request $r) => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth:sanctum', 'assurance:bank_details'])->post('/api/_bank', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'assurance:payment_keys'])->put('/api/_no_sign_in_check', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth:sanctum', 'assurance:access_change'])->post('/api/_roles', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth:sanctum', 'permission:payments.keys', 'assurance:payment_keys'])->put('/api/_owner_keys', fn () => response()->json(['ok' => true]));
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

    private function mode(string $rule, string $mode): void
    {
        config(["security.policy.stepup.{$rule}.mode" => $mode]);
        SecuritySettings::forget();
    }

    private function person(string $role = 'super_admin'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => 'Owner '.(++$n), 'email' => 'owner'.$n.'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
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

    /** A person with a passkey that has been on the account for a while. @return array{0: string, 1: FakeAuthenticator} a sign-in and the device */
    private function withPasskey(User $u, bool $old = true): array
    {
        $t = $this->openSession($u);
        $d = new FakeAuthenticator();
        $q = $this->as($t)->postJson('/api/auth/passkeys/register/options');
        $this->as($t)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'My phone'])->assertStatus(201);
        if ($old) {
            AuthCredential::where('user_id', $u->id)->update(['created_at' => now()->subDays(3)]);
        }

        return [$this->openSession($u), $d];   // a later, password-only sign-in
    }

    private function ask(string $token, array $body = ['n' => 1]): \Illuminate\Testing\TestResponse
    {
        return $this->as($token)->putJson('/api/_keys', $body);
    }

    /** Answer a question with the passkey, bound to it. */
    private function answer(string $token, string $pending, FakeAuthenticator $d, ?string $reason = 'Rotating the keys after the bank asked', ?string $forPending = null)
    {
        $q = $this->as($token)->postJson("/api/auth/step-up/{$pending}/options");
        $q->assertOk();

        return $this->as($token)->postJson('/api/auth/step-up/'.($forPending ?? $pending).'/approve', ['reason' => $reason, 'challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
    }

    private function retry(string $token, string $pending, array $body = ['n' => 1], string $uri = '/api/_keys')
    {
        return $this->as($token)->withHeader('X-Step-Up', $pending)->putJson($uri, $body);
    }

    // ------------------------------------------------------------ off, test, on

    public function test_nothing_is_asked_by_default(): void
    {
        $t = $this->openSession($this->person());
        $this->ask($t)->assertOk()->assertJsonPath('ok', true);
        $this->assertSame(0, AuthPendingAction::count());
    }

    public function test_test_mode_asks_nothing_but_writes_down_that_it_would_have_once_in_a_while(): void
    {
        $this->mode('payment_keys', 'log');
        $t = $this->openSession($this->person());
        $this->ask($t)->assertOk();
        $this->ask($t)->assertOk();
        $this->ask($t)->assertOk();
        $this->assertSame(0, AuthPendingAction::count());
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_would_ask')->count());
        $this->assertSame('payment_keys', SecurityEvent::where('event', 'stepup_would_ask')->first()->detail['rule']);
    }

    public function test_the_emergency_switch_puts_every_rule_to_sleep(): void
    {
        $this->mode('payment_keys', 'enforce');
        config(['security.policy.kill_switch' => true]);
        $this->ask($this->openSession($this->person()))->assertOk();
    }

    public function test_an_unknown_mode_is_the_same_as_off(): void
    {
        $this->mode('payment_keys', 'maybe');
        $this->ask($this->openSession($this->person()))->assertOk();
    }

    public function test_before_script_128_nothing_is_asked(): void
    {
        $this->mode('payment_keys', 'enforce');
        Schema::drop('auth_pending_actions');
        StepUp::forget();
        $this->ask($this->openSession($this->person()))->assertOk();
    }

    public function test_a_rule_that_is_not_in_the_catalogue_is_never_asked(): void
    {
        $this->assertSame('off', app(StepUp::class)->mode('no_such_rule'));
    }

    // ------------------------------------------------------------ the question

    public function test_when_on_the_action_is_held_and_the_question_is_written_down_from_the_servers_own_reading(): void
    {
        $this->mode('payment_keys', 'enforce');
        $u = $this->person();
        $t = $this->openSession($u);
        $r = $this->ask($t, ['n' => 7, 'api_key' => 'sk_live_SECRET', 'account' => 'Main']);
        $r->assertStatus(403)->assertJsonPath('step_up.rule', 'payment_keys')->assertJsonPath('step_up.class', 'critical')->assertJsonPath('step_up.strength', 2)->assertJsonPath('step_up.reason_required', true)->assertJsonPath('step_up.needs_second_person', false);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringContainsString($u->email, $facts['Who']);
        $this->assertSame('Change the payment keys', $facts['What']);
        $this->assertStringNotContainsString('SECRET', json_encode($r->json()));
        $this->assertSame(1, AuthPendingAction::count());
        $this->assertStringNotContainsString('SECRET', json_encode(AuthPendingAction::first()->facts));
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_asked')->count());
    }

    public function test_a_rule_with_no_wording_of_its_own_shows_every_value_and_hides_the_secrets(): void
    {
        $this->mode('export_bulk', 'enforce');
        $t = $this->openSession($this->person());
        $r = $this->as($t)->postJson('/api/_export', ['list' => 'customers', 'api_key' => 'sk_live_SECRET', 'filters' => ['from' => '2026-01-01']])->assertStatus(403);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('customers', $facts['List']);
        $this->assertSame('{"from":"2026-01-01"}', $facts['Filters']);
        $this->assertSame('••••••••', $facts['Api Key']);                                         // a secret is named, never shown
        $this->assertStringNotContainsString('SECRET', json_encode($r->json()));
    }

    public function test_the_payment_keys_screen_names_the_fields_but_never_shows_their_values(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $r = $this->ask($t, ['consumer_key' => 'sk_live_SECRET', 'passkey' => 'p4ss', 'shortcode' => '174379']);
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertStringContainsString('Consumer Key', $facts['Fields being set']);
        $this->assertStringContainsString('Shortcode', $facts['Fields being set']);
        $this->assertStringContainsString('not shown', $facts['Fields being set']);
        $this->assertStringNotContainsString('SECRET', json_encode($r->json()));
        $this->assertStringNotContainsString('174379', json_encode($r->json()));
        $this->assertStringNotContainsString('p4ss', json_encode($r->json()));
    }

    public function test_a_screen_that_cannot_read_its_record_still_says_what_it_can(): void
    {
        $this->mode('payroll_run', 'enforce');
        Route::middleware(['api', 'auth:sanctum', 'assurance:payroll_run'])->post('/api/_payroll/runs/{id}/pay', fn () => response()->json(['ok' => true]));
        $t = $this->openSession($this->person());
        $r = $this->as($t)->postJson('/api/_payroll/runs/5/pay', ['x' => 1])->assertStatus(403);       // (there is no payroll table here to read the run from)
        $facts = collect($r->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('Run or pay payroll', $facts['What']);
        $this->assertArrayHasKey('X', $facts);                                                          // the plain list stood in
    }

    public function test_asking_again_for_the_same_thing_reuses_the_question(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $a = $this->ask($t)->json('step_up.pending');
        $b = $this->ask($t)->json('step_up.pending');
        $this->assertSame($a, $b);
        $this->assertSame(1, AuthPendingAction::count());
        $c = $this->ask($t, ['n' => 2])->json('step_up.pending');                               // something else is another question
        $this->assertNotSame($a, $c);
    }

    public function test_the_serious_ones_say_that_a_second_person_will_be_needed(): void
    {
        $this->mode('access_change', 'enforce');
        $t = $this->openSession($this->person());
        $this->as($t)->postJson('/api/_roles', ['user' => 5, 'role' => 'admin'])->assertStatus(403)->assertJsonPath('step_up.needs_second_person', true);
        $this->assertTrue(AuthPendingAction::first()->needs_second_person);
    }

    public function test_authorization_comes_first(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person('sales_rep'));                                    // may not touch payment keys at all
        $r = $this->as($t)->putJson('/api/_owner_keys', ['n' => 1])->assertStatus(403);
        $this->assertArrayNotHasKey('step_up', $r->json());
        $this->assertSame(0, AuthPendingAction::count());
    }

    public function test_someone_not_signed_in_gets_the_normal_refusal(): void
    {
        $this->mode('payment_keys', 'enforce');
        $this->app['auth']->forgetGuards();
        $this->putJson('/api/_keys', ['n' => 1])->assertStatus(401);
        $this->assertSame(0, AuthPendingAction::count());
    }

    // ------------------------------------------------------------ the answer, with a passkey

    public function test_the_answer_with_the_passkey_lets_that_one_action_through_once(): void
    {
        $this->mode('payment_keys', 'enforce');
        $u = $this->person();
        [$t, $d] = $this->withPasskey($u);
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk()->assertJsonPath('pending', $pending);
        $this->retry($t, $pending)->assertOk()->assertJsonPath('ok', true);
        $this->retry($t, $pending)->assertStatus(403)->assertJsonStructure(['step_up' => ['pending']]);      // used up: a new question
        $e = SecurityEvent::where('event', 'stepup_approved')->first();
        $this->assertSame('passkey', $e->detail['with']);
        $this->assertSame('Rotating the keys after the bank asked', $e->detail['reason']);
    }

    public function test_the_approval_is_for_exactly_that_action(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t, ['n' => 1])->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk();
        $this->retry($t, $pending, ['n' => 2])->assertStatus(403);                                // a different value
        $this->retry($t, $pending, ['n' => 1, 'extra' => 'x'])->assertStatus(403);                // an extra value
        $this->as($t)->withHeader('X-Step-Up', $pending)->putJson('/api/_owner_keys', ['n' => 1])->assertStatus(403);   // another door
        $this->retry($t, $pending, ['n' => 1])->assertOk();                                       // the real one still works
    }

    public function test_the_approval_belongs_to_the_person_and_the_sign_in_that_asked(): void
    {
        $this->mode('payment_keys', 'enforce');
        $u = $this->person();
        [$t, $d] = $this->withPasskey($u);
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk();
        $other = $this->openSession($u);                                                          // the same person, another browser
        $this->retry($other, $pending)->assertStatus(403);
        $this->as($other)->getJson("/api/auth/step-up/{$pending}")->assertStatus(404);
        $stranger = $this->openSession($this->person());
        $this->retry($stranger, $pending)->assertStatus(403);
        $this->retry($t, $pending)->assertOk();
    }

    public function test_only_the_sign_in_that_asked_can_answer_and_only_the_person(): void
    {
        $this->mode('payment_keys', 'enforce');
        $u = $this->person();
        [$t, $d] = $this->withPasskey($u);
        $pending = $this->ask($t)->json('step_up.pending');
        $other = $this->openSession($u);                                                          // the same person in another browser
        $this->as($other)->postJson("/api/auth/step-up/{$pending}/options")->assertStatus(404);
        $this->as($other)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(404);
        $this->as($other)->deleteJson("/api/auth/step-up/{$pending}")->assertStatus(404);
        $stranger = $this->openSession($this->person());
        $this->as($stranger)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(404);
        $this->assertNull(AuthPendingAction::find($pending)->approved_at);
        $this->assertNull(AuthPendingAction::find($pending)->cancelled_at);
    }

    public function test_another_sign_in_asking_for_the_same_thing_gets_its_own_question(): void
    {
        $this->mode('payment_keys', 'enforce');
        $u = $this->person();
        $a = $this->openSession($u);
        $b = $this->openSession($u);
        $first = $this->ask($a)->json('step_up.pending');
        $second = $this->ask($b)->json('step_up.pending');
        $this->assertNotSame($first, $second);
        $this->as($b)->postJson("/api/auth/step-up/{$second}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertOk();
        $this->retry($b, $second)->assertOk();
    }

    public function test_a_question_answered_late_but_still_in_time_is_good_for_a_few_minutes_more(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        Carbon::setTestNow(now()->addMinutes(4));
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertOk();
        Carbon::setTestNow(now()->addMinutes(3));                                                  // seven minutes after it was asked, three after it was answered
        $this->retry($t, $pending)->assertOk();
        Carbon::setTestNow();
    }

    public function test_a_wrong_password_is_written_down(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'wrong'])->assertStatus(422);
        $e = SecurityEvent::where('event', 'stepup_failed')->first();
        $this->assertSame('wrong_password', $e->detail['why']);
        $this->assertSame('warning', $e->severity);
    }

    public function test_a_session_with_no_real_token_is_never_let_through(): void
    {
        $this->mode('payment_keys', 'enforce');
        \Laravel\Sanctum\Sanctum::actingAs($this->person(), ['*']);                               // (a transient sign-in: there is nothing to tie a question to)
        $r = $this->putJson('/api/_keys', ['n' => 1])->assertStatus(403);
        $this->assertArrayNotHasKey('step_up', $r->json());
        $this->assertSame(0, AuthPendingAction::count());
    }

    public function test_a_door_with_no_sign_in_check_of_its_own_leaves_that_to_the_door(): void
    {
        $this->mode('payment_keys', 'enforce');
        $this->app['auth']->forgetGuards();
        $this->putJson('/api/_no_sign_in_check')->assertOk();
    }

    public function test_one_rules_answer_never_covers_another_rule(): void
    {
        $this->mode('export_bulk', 'enforce');
        $this->mode('bank_details', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->as($t)->postJson('/api/_export')->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['current_password' => 'Right-password-1'])->assertOk();
        $this->as($t)->postJson('/api/_export')->assertOk();                                      // its own rule: covered
        $this->as($t)->withHeader('X-Step-Up', $pending)->postJson('/api/_bank')->assertStatus(403);   // another rule of the same kind: not
        $this->as($t)->postJson('/api/_bank')->assertStatus(403);
    }

    public function test_the_answer_says_until_when_a_run_is_covered(): void
    {
        $this->mode('export_bulk', 'enforce');
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $run = $this->as($t)->postJson('/api/_export')->json('step_up.pending');
        $r = $this->as($t)->postJson("/api/auth/step-up/{$run}/approve", ['current_password' => 'Right-password-1'])->assertOk();
        $this->assertNotNull($r->json('covers_until'));
        $single = $this->ask($t)->json('step_up.pending');
        $r = $this->as($t)->postJson("/api/auth/step-up/{$single}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertOk();
        $this->assertNull($r->json('covers_until'));
    }

    public function test_a_reason_is_needed_for_the_serious_ones(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d, null)->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->answer($t, $pending, $d, 'ok')->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->answer($t, $pending, $d, '   ')->assertStatus(422);
        $this->retry($t, $pending)->assertStatus(403);
        $this->answer($t, $pending, $d, 'Quarterly rotation')->assertOk();
    }

    public function test_a_reason_is_not_asked_of_the_lighter_ones(): void
    {
        $this->mode('export_bulk', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->as($t)->postJson('/api/_export')->assertStatus(403)->assertJsonPath('step_up.reason_required', false)->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['current_password' => 'Right-password-1'])->assertOk();
    }

    public function test_an_answer_meant_for_another_question_is_no_use(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $a = $this->ask($t, ['n' => 1])->json('step_up.pending');
        $b = $this->ask($t, ['n' => 2])->json('step_up.pending');
        $this->answer($t, $a, $d, 'Quarterly rotation', $b)->assertStatus(422)->assertJsonPath('reason', 'wrong_context');   // the device answered A's question; B is not approved by it
        $this->retry($t, $b, ['n' => 2])->assertStatus(403);
        $this->answer($t, $b, $d)->assertOk();
        $this->retry($t, $b, ['n' => 2])->assertOk();
        $this->retry($t, $a, ['n' => 1])->assertStatus(403);                                       // A was never answered
    }

    public function test_an_answer_can_not_be_replayed(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $q = $this->as($t)->postJson("/api/auth/step-up/{$pending}/options")->assertOk();
        $answer = $d->assert($q->json('options'));
        $body = ['reason' => 'Quarterly rotation', 'challenge_id' => $q->json('challenge_id'), 'credential' => $answer];
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", $body)->assertOk();
        $this->retry($t, $pending)->assertOk();
        $next = $this->ask($t)->json('step_up.pending');                                           // the same action again: a new question
        $this->as($t)->postJson("/api/auth/step-up/{$next}/approve", $body)->assertStatus(422);    // the old answer does not fit
        $this->retry($t, $next)->assertStatus(403);
    }

    public function test_someone_elses_passkey_is_no_use(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t] = $this->withPasskey($this->person());
        [, $theirs] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $theirs)->assertStatus(422);
        $this->retry($t, $pending)->assertStatus(403);
        $this->assertGreaterThanOrEqual(1, SecurityEvent::where('event', 'stepup_failed')->count());
    }

    public function test_a_passkey_must_be_used_with_fingerprint_face_or_pin(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $d->userVerified = false;
        $this->answer($t, $pending, $d)->assertStatus(422);
        $this->retry($t, $pending)->assertStatus(403);
    }

    public function test_answering_makes_the_session_strong_and_fresh(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $this->assertFalse(app(Sessions::class)->freshStrong(\Laravel\Sanctum\PersonalAccessToken::findToken($t)));
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk();
        $this->assertTrue(app(Sessions::class)->freshStrong(\Laravel\Sanctum\PersonalAccessToken::findToken($t)));
    }

    // ------------------------------------------------------------ a passkey that was only just added

    public function test_a_passkey_added_a_moment_ago_can_not_approve_a_critical_action(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person(), false);                                   // added just now (by whoever was in)
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertStatus(403)->assertJsonPath('reason', 'passkey_too_new');
        $this->retry($t, $pending)->assertStatus(403);
        $this->assertSame('passkey_too_new', SecurityEvent::where('event', 'stepup_failed')->first()->detail['why']);
    }

    public function test_the_same_passkey_can_approve_a_lighter_action_straight_away_and_the_serious_one_a_day_later(): void
    {
        $this->mode('export_bulk', 'enforce');
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person(), false);
        $light = $this->as($t)->postJson('/api/_export')->json('step_up.pending');
        $this->answer($t, $light, $d, null)->assertOk();
        $this->as($t)->postJson('/api/_export')->assertOk();
        Carbon::setTestNow(now()->addHours(25));
        $t2 = $this->openSession(User::first());
        $pending = $this->ask($t2)->json('step_up.pending');
        $this->answer($t2, $pending, $d)->assertOk();
        Carbon::setTestNow();
    }

    public function test_the_wait_can_be_changed_or_switched_off(): void
    {
        $this->mode('payment_keys', 'enforce');
        config(['security.stepup.new_passkey_hours' => 0]);
        [$t, $d] = $this->withPasskey($this->person(), false);
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk();
    }

    // ------------------------------------------------------------ the password

    public function test_the_password_is_not_enough_for_a_rule_that_asks_for_a_passkey_when_the_person_has_one(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'passkey_needed');
        $this->assertFalse($this->as($t)->getJson("/api/auth/step-up/{$pending}")->json('can_use_password'));
    }

    public function test_someone_with_no_passkey_yet_may_use_the_password_until_they_have_one(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->assertTrue($this->as($t)->getJson("/api/auth/step-up/{$pending}")->json('can_use_password'));
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'wrong'])->assertStatus(422)->assertJsonPath('reason', 'wrong_password');
        $this->retry($t, $pending)->assertStatus(403);
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertOk();
        $this->retry($t, $pending)->assertOk();
        $this->assertSame('password', SecurityEvent::where('event', 'stepup_approved')->first()->detail['with']);
    }

    public function test_the_fallback_can_be_switched_off(): void
    {
        $this->mode('payment_keys', 'enforce');
        config(['security.stepup.password_fallback' => false]);
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'passkey_needed');
    }

    public function test_the_lighter_rules_take_the_password_even_from_someone_with_a_passkey(): void
    {
        $this->mode('export_bulk', 'enforce');
        [$t] = $this->withPasskey($this->person());
        $pending = $this->as($t)->postJson('/api/_export')->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['current_password' => 'Right-password-1'])->assertOk();
    }

    // ------------------------------------------------------------ a run of related actions

    public function test_one_answer_covers_a_short_run_for_the_rules_that_allow_it(): void
    {
        $this->mode('export_bulk', 'enforce');
        $u = $this->person();
        $t = $this->openSession($u);
        $pending = $this->as($t)->postJson('/api/_export', ['what' => 'customers'])->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['current_password' => 'Right-password-1'])->assertOk();
        $this->as($t)->postJson('/api/_export', ['what' => 'customers'])->assertOk();            // with or without the number
        $this->as($t)->postJson('/api/_export', ['what' => 'payroll'])->assertOk();               // and something else of the same kind
        $this->as($t)->withHeader('X-Step-Up', $pending)->postJson('/api/_export', ['what' => 'ledger'])->assertOk();
        $other = $this->openSession($u);                                                          // another sign-in is not covered
        $this->as($other)->postJson('/api/_export', ['what' => 'customers'])->assertStatus(403);
        Carbon::setTestNow(now()->addMinutes(16));
        $this->as($t)->postJson('/api/_export', ['what' => 'customers'])->assertStatus(403);      // the run is over
        Carbon::setTestNow();
    }

    public function test_a_run_is_only_for_its_own_rule(): void
    {
        $this->mode('export_bulk', 'enforce');
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->as($t)->postJson('/api/_export')->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['current_password' => 'Right-password-1'])->assertOk();
        $this->ask($t)->assertStatus(403);
        $this->retry($t, $pending)->assertStatus(403);
    }

    // ------------------------------------------------------------ time, giving up, speed

    public function test_a_question_runs_out(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        Carbon::setTestNow(now()->addMinutes(6));
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/options")->assertStatus(410);
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(410);
        Carbon::setTestNow();
    }

    public function test_an_answer_that_is_not_used_soon_runs_out_too(): void
    {
        $this->mode('payment_keys', 'enforce');
        [$t, $d] = $this->withPasskey($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->answer($t, $pending, $d)->assertOk();
        Carbon::setTestNow(now()->addMinutes(6));
        $this->retry($t, $pending)->assertStatus(403);
        Carbon::setTestNow();
    }

    public function test_giving_up_closes_the_question(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->as($t)->deleteJson("/api/auth/step-up/{$pending}")->assertOk();
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(410);
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_cancelled')->count());
        $this->ask($t)->assertStatus(403);                                                          // asking again makes a fresh question
        $this->assertSame(2, AuthPendingAction::count());
    }

    public function test_an_answered_question_can_not_be_given_up_or_answered_again(): void
    {
        $this->mode('payment_keys', 'enforce');
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertOk();
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(410);
        $this->as($t)->deleteJson("/api/auth/step-up/{$pending}")->assertOk();
        $this->retry($t, $pending)->assertOk();                                                     // cancelling after the answer changed nothing
    }

    public function test_guessing_the_password_is_slowed_down(): void
    {
        $this->mode('payment_keys', 'enforce');
        config(['security.rate_limits.step_up' => ['user' => [[4, 15]]]]);
        \App\Services\Security\RateLimits::register();
        $t = $this->openSession($this->person());
        $pending = $this->ask($t)->json('step_up.pending');
        for ($i = 0; $i < 4; $i++) {
            $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'wrong'])->assertStatus(422);
        }
        $this->as($t)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => 'Quarterly rotation', 'current_password' => 'Right-password-1'])->assertStatus(429);
    }

    public function test_a_question_that_does_not_exist_is_not_found(): void
    {
        $t = $this->openSession($this->person());
        $this->as($t)->getJson('/api/auth/step-up/'.str_repeat('a', 40))->assertStatus(404);
        $this->as($t)->postJson('/api/auth/step-up/'.str_repeat('a', 40).'/options')->assertStatus(404);
        $this->as($t)->postJson('/api/auth/step-up/'.str_repeat('a', 40).'/approve', ['current_password' => 'Right-password-1'])->assertStatus(404);
    }

    // ------------------------------------------------------------ what the screen shows

    public function test_a_feature_can_add_what_its_screen_shows(): void
    {
        $this->mode('payment_keys', 'enforce');
        StepUp::addFacts('payment_keys', fn (Request $r, User $u) => [['label' => 'Gateway', 'value' => 'M-Pesa (live)']]);
        $t = $this->openSession($this->person());
        $facts = collect($this->ask($t)->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('M-Pesa (live)', $facts['Gateway']);
        $this->assertArrayHasKey('Which keys', $facts->all());                                          // beside the built-in wording, not instead of it
    }

    public function test_a_features_own_wording_is_not_replaced_by_the_built_in_one(): void
    {
        $this->mode('payment_keys', 'enforce');
        StepUp::describeAs('payment_keys', fn (Request $r, User $u) => [['label' => 'Own wording', 'value' => 'ours']]);
        $t = $this->openSession($this->person());
        $facts = collect($this->ask($t)->json('step_up.facts'))->pluck('value', 'label');
        $this->assertSame('ours', $facts['Own wording']);
        $this->assertArrayNotHasKey('Which keys', $facts->all());
    }

    public function test_the_catalogue_is_sound(): void
    {
        foreach (\App\Services\Security\StepUp\Catalogue::RULES as $key => $r) {
            $this->assertMatchesRegularExpression('/^[a-z_]+$/', $key);
            $this->assertContains($r['class'], ['critical', 'elevated']);
            $this->assertContains($r['strength'], [1, 2]);
            $this->assertGreaterThan(0, $r['fresh']);
            if ($r['class'] === 'critical') {
                $this->assertSame(2, $r['strength'], "{$key}: a critical action asks for a passkey");
                $this->assertTrue($r['reason'], "{$key}: a critical action asks why");
                $this->assertFalse($r['window'], "{$key}: a critical action is asked every time");
            }
        }
    }
}
