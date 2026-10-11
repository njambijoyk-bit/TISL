<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthPendingAction;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use App\Services\Security\StepUp\Council;
use App\Services\Security\StepUp\StepUp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** The Council of Two: for the most serious actions a second person, who could do it themselves, must approve what the first person asked for. */
class CouncilTest extends TestCase
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
            'security.policy.kill_switch' => false, 'security.stepup.password_fallback' => true, 'security.stepup.new_passkey_hours' => 24, 'security.stepup.council_minutes' => 30]);
        $this->rules('enforce', 'enforce');
        Route::middleware(['api', 'auth:sanctum', 'assurance:access_change'])->post('/api/_roles', fn (Request $r) => response()->json(['ok' => true, 'n' => $r->input('n')]));
        Route::middleware(['api', 'auth:sanctum', 'assurance:payroll_run'])->post('/api/_payroll', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth:sanctum', 'assurance:payment_keys'])->put('/api/_keys', fn () => response()->json(['ok' => true]));
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

    /** The rule itself and the second-person switch, for the two rules these tests use. */
    private function rules(string $rule, string $two): void
    {
        foreach (['access_change', 'payroll_run', 'payment_keys'] as $r) {
            config(["security.policy.stepup.{$r}.mode" => $rule, "security.policy.stepup.{$r}.two" => $two]);
        }
        SecuritySettings::forget();
    }

    private function person(string $role = 'super_admin', string $name = 'Someone'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'c'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    private function signIn(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    /** A person with a passkey (old enough for a serious action unless `$old` is false) and a later sign-in. @return array{0: string, 1: FakeAuthenticator} */
    private function withPasskey(User $u, bool $old = true): array
    {
        $t = $this->signIn($u);
        $d = new FakeAuthenticator();
        $q = $this->as($t)->postJson('/api/auth/passkeys/register/options');
        $this->as($t)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'Phone'])->assertStatus(201);
        if ($old) {
            AuthCredential::where('user_id', $u->id)->update(['created_at' => now()->subDays(3)]);
        }

        return [$this->signIn($u), $d];
    }

    private function ask(string $token, int $n = 1, string $uri = '/api/_roles')
    {
        return $this->as($token)->postJson($uri, ['n' => $n]);
    }

    /** The first person answers a question with their passkey. */
    private function firstAnswer(string $token, string $pending, FakeAuthenticator $d, string $reason = 'Giving the new accountant access')
    {
        $q = $this->as($token)->postJson("/api/auth/step-up/{$pending}/options")->assertOk();

        return $this->as($token)->postJson("/api/auth/step-up/{$pending}/approve", ['reason' => $reason, 'challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
    }

    /** The second person answers with their passkey. */
    private function secondAnswer(string $token, string $pending, FakeAuthenticator $d, ?string $reason = 'I checked with the owner')
    {
        $q = $this->as($token)->postJson("/api/auth/council/{$pending}/options");
        if ($q->status() !== 200) {
            return $q;
        }

        return $this->as($token)->postJson("/api/auth/council/{$pending}/approve", ['reason' => $reason, 'challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
    }

    private function retry(string $token, string $pending, int $n = 1, string $uri = '/api/_roles')
    {
        return $this->as($token)->withHeader('X-Step-Up', $pending)->postJson($uri, ['n' => $n]);
    }

    /** First person asked and answered; the request now waits for a second. @return array{0: string, 1: string, 2: FakeAuthenticator, 3: User} the first person's sign-in, the pending id, their device and the person */
    private function waiting(string $reason = 'Giving the new accountant access'): array
    {
        $a = $this->person('super_admin', 'Alice Asker');
        [$ta, $da] = $this->withPasskey($a);
        $id = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $id, $da, $reason)->assertOk();

        return [$ta, $id, $da, $a];
    }

    // ------------------------------------------------------------ off, test, on

    public function test_the_first_person_is_told_beforehand_only_when_a_second_person_will_be_asked(): void
    {
        $a = $this->person();
        [$ta] = $this->withPasskey($a);
        foreach (['off' => false, 'log' => false, 'enforce' => true] as $mode => $expected) {
            $this->rules('enforce', $mode);
            $r = $this->ask($ta, rand(1, 9999))->assertStatus(403);
            $this->assertSame($expected, $r->json('step_up.will_need_second'), $mode);
        }
        $this->rules('enforce', 'enforce');
        $this->as($ta)->putJson('/api/_keys')->assertStatus(403)->assertJsonPath('step_up.will_need_second', false);   // a rule that has no second person
    }

    public function test_by_default_one_person_is_enough(): void
    {
        $this->rules('enforce', 'off');
        $a = $this->person();
        [$ta, $da] = $this->withPasskey($a);
        $id = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $r = $this->firstAnswer($ta, $id, $da)->assertOk();
        $this->assertFalse($r->json('waiting_for_second'));
        $this->assertNull($r->json('second'));
        $this->retry($ta, $id)->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'council_asked')->count());
        $this->assertFalse(AuthPendingAction::first()->second_required);
    }

    public function test_in_test_mode_a_second_person_is_only_written_down_as_something_that_would_have_been_asked(): void
    {
        $this->rules('enforce', 'log');
        $a = $this->person();
        [$ta, $da] = $this->withPasskey($a);
        $id = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $id, $da)->assertOk()->assertJsonPath('waiting_for_second', false);
        $this->retry($ta, $id)->assertOk();
        $e = SecurityEvent::where('event', 'stepup_council_would_ask')->get();
        $this->assertCount(1, $e);
        $this->assertSame('access_change', $e[0]->detail['rule']);
        $this->assertSame(0, SecurityEvent::where('event', 'council_asked')->count());
        $this->assertSame([], $this->ofType('council_request'));
    }

    public function test_a_rule_that_is_not_on_never_asks_a_second_person(): void
    {
        $this->rules('log', 'enforce');                                                           // the first question is not even asked
        [$ta] = $this->withPasskey($this->person());
        $this->ask($ta)->assertOk();
        $this->assertSame(0, AuthPendingAction::count());
    }

    public function test_only_the_serious_rules_have_a_second_person(): void
    {
        $c = app(Council::class);
        foreach (['payment_keys', 'backup_restore', 'staff_account', 'export_bulk', 'voucher_cancel', 'bank_details'] as $rule) {
            config(["security.policy.stepup.{$rule}.two" => 'enforce']);
            SecuritySettings::forget();
            $this->assertSame('off', $c->mode($rule), $rule);
        }
        foreach (['access_change', 'signin_reset', 'security_settings', 'payroll_run'] as $rule) {
            config(["security.policy.stepup.{$rule}.two" => 'enforce']);
            SecuritySettings::forget();
            $this->assertSame('enforce', $c->mode($rule), $rule);
        }
        config(['security.policy.stepup.access_change.two' => 'maybe']);
        SecuritySettings::forget();
        $this->assertSame('off', $c->mode('access_change'));
    }

    public function test_the_emergency_switch_puts_it_to_sleep(): void
    {
        config(['security.policy.kill_switch' => true]);
        $this->assertSame('off', app(Council::class)->mode('access_change'));
    }

    // ------------------------------------------------------------ the whole way through

    public function test_the_action_waits_for_the_second_person_and_then_goes_through_once(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id, , $a] = $this->waiting();

        // answered by the first person only: the action is still held, and the answer says so
        $this->retry($ta, $id)->assertStatus(403)->assertJsonPath('step_up.pending', $id)->assertJsonPath('step_up.second.state', 'waiting');
        $this->assertCount(1, AuthPendingAction::all());                                          // asking again did not pile up a new question
        $held = $this->as($ta)->getJson("/api/auth/step-up/{$id}")->assertOk();
        $held->assertJsonPath('second.state', 'waiting')->assertJsonPath('second.by', null);

        // the second person sees it, with the facts and the reason, and answers
        $list = $this->as($tb)->getJson('/api/auth/council')->assertOk();
        $list->assertJsonPath('ready', true)->assertJsonCount(1, 'data');
        $card = $list->json('data.0');
        $this->assertSame($id, $card['id']);
        $this->assertSame('access_change', $card['rule']);
        $this->assertStringContainsString('Alice Asker', $card['asked_by']);
        $this->assertStringContainsString($a->email, $card['asked_by']);
        $this->assertSame('Giving the new accountant access', $card['their_reason']);
        $this->assertTrue($card['reason_required']);
        $this->assertTrue($card['has_passkey']);
        $this->assertContains('Who', array_column($card['facts'], 'label'));
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');                 // answered: no longer waiting for anyone, even before the first person goes ahead

        $this->as($ta)->getJson("/api/auth/step-up/{$id}")->assertOk()->assertJsonPath('second.state', 'approved')->assertJsonPath('second.by', 'Bola Backer')->assertJsonPath('second.note', 'I checked with the owner');
        $this->retry($ta, $id)->assertOk()->assertJsonPath('ok', true);
        $this->retry($ta, $id)->assertStatus(403);                                                // once only
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');                 // and it is no longer waiting
    }

    public function test_everything_is_written_down_with_who_how_and_why(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id, , $a] = $this->waiting();
        $this->secondAnswer($tb, $id, $db, 'Looked at the role it gives')->assertOk();

        $asked = SecurityEvent::where('event', 'council_asked')->first();
        $this->assertSame($a->id, $asked->subject_id);
        $this->assertSame($id, $asked->detail['pending']);
        $this->assertSame(1, $asked->detail['approvers']);
        $done = SecurityEvent::where('event', 'council_approved')->first();
        $this->assertSame($b->id, $done->subject_id);
        $this->assertSame($a->id, $done->detail['asked_by']);
        $this->assertSame('passkey', $done->detail['with']);
        $this->assertSame('Looked at the role it gives', $done->detail['reason']);
        $row = AuthPendingAction::find($id);
        $this->assertSame($b->id, $row->second_user_id);
        $this->assertSame('passkey', $row->second_with);
        $this->assertNotNull($row->second_credential_id);
        $this->assertSame('Looked at the role it gives', $row->second_note);
        $this->assertNotNull($row->second_approved_at);
    }

    public function test_the_second_person_is_told_and_the_first_is_told_the_answer(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        $c = $this->person('admin', 'Chao Admin');                                                // an admin holds the access permission too
        $none = $this->person('sales_rep', 'Nobody Special');                                     // this one does not
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id, , $a] = $this->waiting();

        $told = $this->ofType('council_request');
        $this->assertEqualsCanonicalizing([$b->id, $c->id], array_column($told, 'to'));          // everyone who could answer, not the one who asked, not someone who could not
        $this->assertStringContainsString('Alice Asker has asked to', $told[0]['message']);
        $this->assertStringContainsString('Change who may do what', $told[0]['message']);
        $this->assertSame('/admin/security/approvals', $told[0]['options']['action_url']);
        $this->assertStringContainsString('30 minutes', $told[0]['message']);
        $this->assertNotContains($none->id, array_column($told, 'to'));
        $this->assertSame(2, SecurityEvent::where('event', 'council_asked')->first()->detail['approvers']);

        $this->secondAnswer($tb, $id, $db)->assertOk();
        $back = $this->ofType('council_answer');
        $this->assertCount(1, $back);
        $this->assertSame($a->id, $back[0]['to']);
        $this->assertStringContainsString('Bola Backer approved', $back[0]['message']);
        $this->assertSame('A second person approved', $back[0]['title']);
    }

    public function test_the_messages_are_sent_even_when_the_alerts_switch_is_off(): void
    {
        config(['security.alerts_email' => false]);
        $this->person('super_admin', 'Bola Backer');
        $this->waiting();
        $this->assertCount(1, $this->ofType('council_request'));
    }

    // ------------------------------------------------------------ the second person says no, or the first gives up

    public function test_the_second_person_can_decline_and_the_action_does_not_go_through(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb] = $this->withPasskey($b);
        [$ta, $id, , $a] = $this->waiting();

        $this->as($tb)->postJson("/api/auth/council/{$id}/reject", ['reason' => 'Not what we agreed'])->assertOk();
        $this->as($ta)->getJson("/api/auth/step-up/{$id}")->assertOk()->assertJsonPath('second.state', 'declined')->assertJsonPath('second.by', 'Bola Backer')->assertJsonPath('second.note', 'Not what we agreed');
        $this->retry($ta, $id)->assertStatus(403);
        $e = SecurityEvent::where('event', 'council_declined')->first();
        $this->assertSame($b->id, $e->subject_id);
        $this->assertSame('Not what we agreed', $e->detail['reason']);
        $this->assertStringContainsString('Bola Backer declined', $this->ofType('council_answer')[0]['message']);
        $this->assertSame('A second person declined', $this->ofType('council_answer')[0]['title']);
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');
        // and it can not be approved afterwards
        $this->as($tb)->postJson("/api/auth/council/{$id}/options")->assertStatus(404);
    }

    public function test_a_declined_request_is_not_reused_by_asking_again(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb] = $this->withPasskey($b);
        [$ta, $id] = $this->waiting();
        $this->as($tb)->postJson("/api/auth/council/{$id}/reject")->assertOk();
        $fresh = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $this->assertNotSame($id, $fresh);
    }

    public function test_the_first_person_can_give_up_while_waiting(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id] = $this->waiting();
        $this->as($ta)->deleteJson("/api/auth/step-up/{$id}")->assertOk();
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');
        $this->secondAnswer($tb, $id, $db)->assertStatus(404);
        $this->retry($ta, $id)->assertStatus(403);
        $this->assertNotNull(AuthPendingAction::find($id)->cancelled_at);
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_cancelled')->count());
    }

    // ------------------------------------------------------------ who may be the second person

    public function test_the_first_person_can_never_be_the_second(): void
    {
        [$ta, $id, $da] = $this->waiting();
        $this->as($ta)->getJson('/api/auth/council')->assertOk()->assertJsonCount(0, 'data');
        $this->as($ta)->postJson("/api/auth/council/{$id}/options")->assertStatus(404);
        $this->as($ta)->postJson("/api/auth/council/{$id}/reject")->assertStatus(404);
        $this->secondAnswer($ta, $id, $da)->assertStatus(404);
        $this->retry($ta, $id)->assertStatus(403);
    }

    public function test_the_same_person_in_another_sign_in_is_still_the_same_person(): void
    {
        [, $id, $da, $a] = $this->waiting();
        $other = $this->signIn($a);
        $this->as($other)->getJson('/api/auth/council')->assertJsonCount(0, 'data');
        $this->secondAnswer($other, $id, $da)->assertStatus(404);
    }

    public function test_someone_who_could_not_do_it_themselves_can_not_approve_it(): void
    {
        $rep = $this->person('sales_rep', 'Sam Rep');
        [$tr, $dr] = $this->withPasskey($rep);
        [, $id] = $this->waiting();
        $this->as($tr)->getJson('/api/auth/council')->assertOk()->assertJsonCount(0, 'data');
        $this->secondAnswer($tr, $id, $dr)->assertStatus(404);
        $this->as($tr)->postJson("/api/auth/council/{$id}/reject")->assertStatus(404);
        $this->assertNull(AuthPendingAction::find($id)->second_approved_at);
    }

    public function test_each_request_goes_to_people_who_hold_the_permission_for_that_thing(): void
    {
        $admin = $this->person('admin', 'Chao Admin');                                            // may change access, may not run payroll
        $accountant = $this->person('senior_accountant', 'Ann Accountant');                       // may run payroll, may not change access
        [$tAdmin] = $this->withPasskey($admin);
        [$tAcc] = $this->withPasskey($accountant);
        $a = $this->person('super_admin', 'Alice Asker');
        [$ta, $da] = $this->withPasskey($a);
        $one = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $one, $da)->assertOk();
        $two = $this->ask($ta, 1, '/api/_payroll')->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $two, $da)->assertOk();

        $this->assertSame([$one], array_column($this->as($tAdmin)->getJson('/api/auth/council')->json('data'), 'id'));
        $this->assertSame([$two], array_column($this->as($tAcc)->getJson('/api/auth/council')->json('data'), 'id'));
        $this->as($tAdmin)->postJson("/api/auth/council/{$two}/options")->assertStatus(404);
        $this->as($tAcc)->postJson("/api/auth/council/{$one}/options")->assertStatus(404);
    }

    public function test_a_suspended_account_is_not_asked_and_can_not_answer(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        $b->forceFill(['status' => 'suspended'])->save();
        [, $id] = $this->waiting();
        $this->assertSame([], $this->ofType('council_request'));
        $this->assertFalse(app(Council::class)->eligible($b->fresh(), 'access_change', null));
        $this->secondAnswer($tb, $id, $db)->assertStatus(401);                                    // (their sign-in no longer works at all)
        $this->assertNull(AuthPendingAction::find($id)->second_approved_at);
    }

    public function test_the_approvers_are_everyone_who_could_but_never_the_one_asking(): void
    {
        $a = $this->person('super_admin', 'Alice');
        $b = $this->person('super_admin', 'Bola');
        $c = $this->person('admin', 'Chao');
        $this->person('sales_rep', 'Sam');
        $council = app(Council::class);
        $this->assertEqualsCanonicalizing([$b->id, $c->id], $council->approvers('access_change', $a)->pluck('id')->all());
        $this->assertEqualsCanonicalizing([$a->id, $b->id, $c->id], $council->approvers('access_change', null)->pluck('id')->all());
        $this->assertSame([$b->id], $council->approvers('security_settings', $a)->pluck('id')->all());
        $this->assertSame([], $council->approvers('payment_keys', $a)->all());                    // not a two-person action: nobody
        $this->assertTrue($council->eligible($b, 'access_change', $a));
        $this->assertFalse($council->eligible($a, 'access_change', $a));
        $this->assertFalse($council->eligible($b, 'payment_keys', $a));                           // not a two-person action: nobody is eligible
    }

    // ------------------------------------------------------------ how the second person proves it

    public function test_a_serious_action_asks_the_second_person_why_as_well(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [, $id] = $this->waiting();
        $this->secondAnswer($tb, $id, $db, null)->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->secondAnswer($tb, $id, $db, 'ok')->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->assertNull(AuthPendingAction::find($id)->second_approved_at);
        $this->secondAnswer($tb, $id, $db, 'Checked the details')->assertOk();
    }

    public function test_a_second_person_with_a_passkey_can_not_answer_with_a_password(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb] = $this->withPasskey($b);
        [, $id] = $this->waiting();
        $this->as($tb)->postJson("/api/auth/council/{$id}/approve", ['reason' => 'Looks right', 'current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'passkey_needed');
        $this->assertNull(AuthPendingAction::find($id)->second_approved_at);
    }

    public function test_a_second_person_with_no_passkey_yet_may_use_their_password(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        $tb = $this->signIn($b);
        [, $id] = $this->waiting();
        $this->as($tb)->postJson("/api/auth/council/{$id}/approve", ['reason' => 'Looks right', 'current_password' => 'wrong'])->assertStatus(422)->assertJsonPath('reason', 'wrong_password');
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_failed')->where('detail->as', 'second')->count());
        $this->as($tb)->postJson("/api/auth/council/{$id}/approve", ['reason' => 'Looks right', 'current_password' => 'Right-password-1'])->assertOk();
        $this->assertSame('password', AuthPendingAction::find($id)->second_with);
    }

    public function test_with_the_password_fallback_off_a_second_person_without_a_passkey_could_not_answer_and_is_not_asked(): void
    {
        config(['security.stepup.password_fallback' => false]);
        $b = $this->person('super_admin', 'Bola Backer');
        $tb = $this->signIn($b);
        [, $id] = $this->waiting();
        $this->assertSame([], $this->ofType('council_request'));
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');
        $this->as($tb)->postJson("/api/auth/council/{$id}/approve", ['reason' => 'Looks right', 'current_password' => 'Right-password-1'])->assertStatus(404);
    }

    public function test_a_passkey_added_today_can_not_approve_a_serious_action_for_someone_else(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b, false);
        [, $id] = $this->waiting();
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');                 // not even shown: they could not answer it yet
        $this->secondAnswer($tb, $id, $db)->assertStatus(404);
        AuthCredential::where('user_id', $b->id)->update(['created_at' => now()->subDays(2)]);
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(1, 'data');
        $this->secondAnswer($tb, $id, $db)->assertOk();
    }

    public function test_the_answer_belongs_to_that_request_and_to_that_person(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        $c = $this->person('admin', 'Chao Admin');
        [$tb, $db] = $this->withPasskey($b);
        [$tc, $dc] = $this->withPasskey($c);
        $a = $this->person('super_admin', 'Alice Asker');
        [$ta, $da] = $this->withPasskey($a);
        $one = $this->ask($ta, 1)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $one, $da)->assertOk();
        $two = $this->ask($ta, 2)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $two, $da)->assertOk();

        // a signed answer to the first request, handed in for the second
        $q = $this->as($tb)->postJson("/api/auth/council/{$one}/options")->assertOk();
        $answer = $db->assert($q->json('options'));
        $this->as($tb)->postJson("/api/auth/council/{$two}/approve", ['reason' => 'Looks right', 'challenge_id' => $q->json('challenge_id'), 'credential' => $answer])->assertStatus(422)->assertJsonPath('reason', 'wrong_context');
        $this->assertNull(AuthPendingAction::find($two)->second_approved_at);
        // the question made for the first person's own answer is no use to the second person either
        $mine = $this->as($ta)->postJson('/api/auth/step-up/'.$this->ask($ta, 3)->json('step_up.pending').'/options')->assertOk();
        $this->as($tb)->postJson("/api/auth/council/{$one}/approve", ['reason' => 'Looks right', 'challenge_id' => $mine->json('challenge_id'), 'credential' => $db->assert($mine->json('options'))])->assertStatus(422);
        // and one person's challenge for a request is not another person's
        $qb = $this->as($tb)->postJson("/api/auth/council/{$one}/options")->assertOk();
        $this->as($tc)->postJson("/api/auth/council/{$one}/approve", ['reason' => 'Looks right', 'challenge_id' => $qb->json('challenge_id'), 'credential' => $dc->assert($qb->json('options'))])->assertStatus(422);
        $this->assertNull(AuthPendingAction::find($one)->second_approved_at);
        $this->secondAnswer($tb, $one, $db)->assertOk();
    }

    public function test_the_first_persons_own_question_can_not_be_answered_by_the_second_person_through_the_old_door(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [, $id] = $this->waiting();
        $this->as($tb)->postJson("/api/auth/step-up/{$id}/options")->assertStatus(404);
        $this->as($tb)->postJson("/api/auth/step-up/{$id}/approve", ['reason' => 'Mine now', 'current_password' => 'Right-password-1'])->assertStatus(404);
    }

    // ------------------------------------------------------------ it is this action, once, for a while

    public function test_a_different_action_does_not_ride_on_the_approval(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id] = $this->waiting();
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->retry($ta, $id, 2)->assertStatus(403);                                             // another value
        $this->retry($ta, $id, 1, '/api/_payroll')->assertStatus(403);                            // another door
        $this->retry($ta, $id)->assertOk();
    }

    public function test_another_sign_in_of_the_first_person_can_not_use_it(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [, $id, , $a] = $this->waiting();
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->retry($this->signIn($a), $id)->assertStatus(403);
    }

    public function test_the_second_person_waits_a_while_and_then_the_request_runs_out(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id] = $this->waiting();
        $this->assertEqualsWithDelta(30 * 60, now()->diffInSeconds(AuthPendingAction::find($id)->expires_at, false), 5);

        $this->travel(29)->minutes();
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(1, 'data');
        $this->travel(2)->minutes();
        $this->as($tb)->getJson('/api/auth/council')->assertJsonCount(0, 'data');
        $this->secondAnswer($tb, $id, $db)->assertStatus(404);
        $this->retry($ta, $id)->assertStatus(403);
        $this->as($ta)->getJson("/api/auth/step-up/{$id}")->assertJsonPath('second.state', 'expired');
    }

    public function test_after_the_second_answer_the_first_person_has_a_few_minutes_to_go_ahead(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [$ta, $id] = $this->waiting();
        $this->travel(20)->minutes();
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->assertEqualsWithDelta(5 * 60, now()->diffInSeconds(AuthPendingAction::find($id)->expires_at, false), 5);
        $this->travel(4)->minutes();
        $this->retry($ta, $id)->assertOk();

        [$ta2, $id2] = $this->waiting();
        $this->secondAnswer($tb, $id2, $db)->assertOk();
        $this->travel(6)->minutes();
        $this->retry($ta2, $id2)->assertStatus(403);
    }

    public function test_two_answers_at_once_only_one_wins(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        $c = $this->person('admin', 'Chao Admin');
        [$tb, $db] = $this->withPasskey($b);
        [$tc, $dc] = $this->withPasskey($c);
        [$ta, $id] = $this->waiting();
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->secondAnswer($tc, $id, $dc)->assertStatus(404);                                    // already answered
        $this->as($tc)->postJson("/api/auth/council/{$id}/reject")->assertStatus(404);
        $this->assertSame($b->id, AuthPendingAction::find($id)->second_user_id);
        $this->assertSame(1, SecurityEvent::where('event', 'council_approved')->count());
        $this->assertSame(0, SecurityEvent::where('event', 'council_declined')->count());
    }

    public function test_the_second_person_can_not_answer_the_same_request_twice(): void
    {
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb, $db] = $this->withPasskey($b);
        [, $id] = $this->waiting();
        $this->secondAnswer($tb, $id, $db)->assertOk();
        $this->secondAnswer($tb, $id, $db)->assertStatus(404);
    }

    // ------------------------------------------------------------ rules that are not two-person are untouched

    public function test_a_rule_without_a_second_person_goes_through_as_before_even_when_asked_to_have_one(): void
    {
        config(['security.policy.stepup.payment_keys.two' => 'enforce']);
        SecuritySettings::forget();
        $a = $this->person();
        [$ta, $da] = $this->withPasskey($a);
        $id = $this->as($ta)->putJson('/api/_keys')->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $id, $da)->assertOk()->assertJsonPath('waiting_for_second', false);
        $this->as($ta)->withHeader('X-Step-Up', $id)->putJson('/api/_keys')->assertOk();
        $this->assertFalse(AuthPendingAction::find($id)->second_required);
    }

    // ------------------------------------------------------------ before script 129

    public function test_before_the_script_is_run_one_person_is_enough_and_nothing_breaks(): void
    {
        Schema::table('auth_pending_actions', function ($t) {
            $t->dropColumn(['second_required', 'second_user_id', 'second_approved_at', 'second_with', 'second_credential_id', 'second_note', 'second_rejected_at']);
        });
        Council::forget();
        $this->assertFalse(Council::ready());
        $this->assertSame('off', app(Council::class)->mode('access_change'));
        $b = $this->person('super_admin', 'Bola Backer');
        [$tb] = $this->withPasskey($b);
        $a = $this->person();
        [$ta, $da] = $this->withPasskey($a);
        $id = $this->ask($ta)->assertStatus(403)->json('step_up.pending');
        $this->firstAnswer($ta, $id, $da)->assertOk()->assertJsonPath('waiting_for_second', false);
        $this->retry($ta, $id)->assertOk();
        $this->as($tb)->getJson('/api/auth/council')->assertOk()->assertJsonPath('ready', false)->assertJsonCount(0, 'data');
        $this->as($ta)->deleteJson('/api/auth/step-up/'.$this->ask($ta, 5)->json('step_up.pending'))->assertOk();
    }

    public function test_the_routes_are_behind_the_sign_in_and_the_speed_limit(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/auth/council'));
        $this->assertCount(4, $routes);
        foreach ($routes as $r) {
            $this->assertContains('throttle:step-up', $r->gatherMiddleware(), $r->uri());
            $this->assertContains('auth:sanctum', $r->gatherMiddleware(), $r->uri());
        }
        $this->getJson('/api/auth/council')->assertStatus(401);
        $this->postJson('/api/auth/council/abc/options')->assertStatus(401);
        $this->postJson('/api/auth/council/abc/approve')->assertStatus(401);
        $this->postJson('/api/auth/council/abc/reject')->assertStatus(401);
    }
}
