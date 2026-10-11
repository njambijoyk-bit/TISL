<?php

namespace Tests\Feature;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryApproval;
use App\Models\Security\AuthRecoveryRequest;
use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\AssistedRecovery;
use App\Services\Security\RecoveryCodes;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\SecuritySettings;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeAuthenticator;
use Tests\TestCase;

/** Assisted recovery: a member of staff with no passkey device and no recovery code asks, two other administrators approve, a day passes, and only then may one sign-in add a new passkey. */
class AssistedRecoveryTest extends TestCase
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
            'security.rate_limits.recovery_request' => ['user' => [[1000, 60]]], 'security.rate_limits.reset' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]],
            'security.policy.kill_switch' => false, 'security.stepup.password_fallback' => true, 'security.stepup.new_passkey_hours' => 24,
            'security.policy.passkeys.mode' => 'enforce', 'security.policy.passkeys.enforce_from' => now()->subDay()->toDateString(), 'security.policy.passkeys.roles' => ['admin', 'finance', 'super_admin'],
            'security.recovery.approvals' => 2, 'security.recovery.cooling_hours' => 24, 'security.recovery.request_hours' => 72, 'security.recovery.use_hours' => 48]);
        SecuritySettings::forget();
        AssistedRecovery::forget();
        Route::middleware(['api', 'auth:sanctum'])->get('/api/_probe', fn () => response()->json(['ok' => true]));
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

    private function person(string $role = 'admin', string $name = 'Someone'): User
    {
        static $n = 0;

        return User::forceCreate(['name' => $name, 'email' => 'r'.(++$n).'@example.com', 'password' => Hash::make('Right-password-1'), 'role' => $role]);
    }

    private function signIn(User $u): string
    {
        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'password');
    }

    private function as(string $token): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->defaultHeaders = [];
        $this->unencryptedCookies = [];

        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    /** A sign-in WITH the person's passkey (the way an administrator signs in once the passkey rule is on): strong, so the rule lets it through. */
    private function strong(User $u): string
    {
        $credential = AuthCredential::where('user_id', $u->id)->latest('id')->first();

        return app(Sessions::class)->issue($u, Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'REMOTE_ADDR' => '41.80.1.1']), 'auth-token', 'passkey', $credential->id, 2);
    }

    /** A passkey that has been on the account for a while, and a later sign-in with the password. @return array{0: string, 1: FakeAuthenticator} */
    private function withPasskey(User $u, bool $old = true): array
    {
        $t = $this->signIn($u);
        $d = new FakeAuthenticator();
        $q = $this->as($t)->postJson('/api/auth/passkeys/register/options');
        $this->as($t)->postJson('/api/auth/passkeys/register/verify', ['challenge_id' => $q->json('challenge_id'), 'credential' => $d->register($q->json('options')), 'name' => 'Old phone'])->assertStatus(201);
        if ($old) {
            AuthCredential::where('user_id', $u->id)->update(['created_at' => now()->subDays(3)]);
        }

        return [$this->strong($u), $d];                                                            // (a later sign-in with the passkey)
    }

    /** The person whose phone is lost: a passkey they can no longer use, and a password sign-in held at the passkey screen. @return array{0: User, 1: string} */
    private function locked(string $role = 'finance', string $name = 'Lena Locked'): array
    {
        $p = $this->person($role, $name);
        $this->withPasskey($p);                                                                    // the passkey on the lost phone
        $token = $this->signIn($p);                                                                // all they have now: the password

        return [$p, $token];
    }

    /** @return array<int, array{0: User, 1: string, 2: FakeAuthenticator}> two administrators, each with a passkey, in a sign-in of their own */
    private function admins(int $n = 2): array
    {
        $out = [];
        for ($i = 1; $i <= $n; $i++) {
            $u = $this->person('admin', 'Admin '.$i);
            [$t, $d] = $this->withPasskey($u);
            $out[] = [$u, $t, $d];
        }

        return $out;
    }

    private function ask(string $token, ?string $note = 'My phone was stolen on the bus')
    {
        return $this->as($token)->postJson('/api/auth/recovery-requests', ['note' => $note]);
    }

    private function approve(string $token, string $id, FakeAuthenticator $d, ?string $reason = 'Phoned them on their own number')
    {
        $q = $this->as($token)->postJson("/api/auth/recovery-approvals/{$id}/options");
        if ($q->status() !== 200) {
            return $q;
        }

        return $this->as($token)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => $reason, 'challenge_id' => $q->json('challenge_id'), 'credential' => $d->assert($q->json('options'))]);
    }

    /** A request asked and approved by both administrators. @return array{0: User, 1: string, 2: string, 3: array} the person, their sign-in, the request, the administrators */
    private function approved(): array
    {
        [$p, $tp] = $this->locked();
        $admins = $this->admins();
        $id = $this->ask($tp)->assertStatus(201)->json('request.id');
        foreach ($admins as [, $t, $d]) {
            $this->approve($t, $id, $d)->assertOk();
        }

        return [$p, $tp, $id, $admins];
    }

    // ------------------------------------------------------------ asking

    public function test_a_locked_out_person_can_ask_from_the_restricted_sign_in_and_nothing_else_opens(): void
    {
        [$p, $tp] = $this->locked();
        $this->admins();
        $this->as($tp)->getJson('/api/_probe')->assertStatus(403)->assertJsonPath('restricted.reason', 'passkey_needed');   // held at the passkey screen
        $r = $this->ask($tp, 'My phone was stolen on the bus')->assertStatus(201);
        $r->assertJsonPath('request.state', 'pending')->assertJsonPath('request.needed', 2)->assertJsonPath('request.approved', 0)->assertJsonPath('request.note', 'My phone was stolen on the bus');
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertOk()->assertJsonPath('request.id', $r->json('request.id'))->assertJsonPath('staff', true);
        $this->as($tp)->getJson('/api/_probe')->assertStatus(403);                                // still held: asking opens nothing
        $e = SecurityEvent::where('event', 'recovery_requested')->first();
        $this->assertSame($p->id, $e->subject_id);
        $this->assertSame('warning', $e->severity);
        $row = AuthRecoveryRequest::first();
        $this->assertSame($p->id, $row->user_id);
        $this->assertSame('self', $row->kind);
        $this->assertSame('127.0.0.1', $row->ip);
        $this->assertEqualsWithDelta(72 * 3600, now()->diffInSeconds($row->expires_at, false), 5);
    }

    public function test_only_one_request_is_open_at_a_time(): void
    {
        [, $tp] = $this->locked();
        $this->admins();
        $this->ask($tp)->assertStatus(201);
        $this->ask($tp)->assertStatus(409)->assertJsonPath('reason', 'already_open');
        $this->assertSame(1, AuthRecoveryRequest::count());
    }

    public function test_it_is_for_staff_only(): void
    {
        $customer = $this->person('customer', 'Carol Customer');
        $tc = $this->signIn($customer);
        $this->admins();
        $this->ask($tc)->assertStatus(403)->assertJsonPath('reason', 'not_staff');
        $this->assertSame(0, AuthRecoveryRequest::count());
        $this->as($tc)->getJson('/api/auth/recovery-requests/mine')->assertOk()->assertJsonPath('staff', false)->assertJsonPath('request', null);
    }

    public function test_it_needs_enough_administrators_who_could_approve_and_says_what_to_do_otherwise(): void
    {
        [, $tp] = $this->locked();
        $this->admins(1);
        $this->ask($tp)->assertStatus(422)->assertJsonPath('reason', 'not_enough_approvers');
        $this->assertStringContainsString('emergency recovery', $this->ask($tp)->json('message'));
        $this->assertSame(0, AuthRecoveryRequest::count());
        $this->assertSame([], $this->ofType('recovery_asked'));
    }

    public function test_someone_who_could_not_reset_a_sign_in_themselves_is_not_one_of_the_administrators(): void
    {
        [, $tp] = $this->locked();
        $this->admins(1);
        $rep = $this->person('cashier', 'Cass Cashier');
        $this->withPasskey($rep);
        $this->ask($tp)->assertStatus(422)->assertJsonPath('reason', 'not_enough_approvers');
    }

    public function test_a_new_passkey_or_a_missing_password_fallback_means_an_administrator_could_not_answer_and_does_not_count(): void
    {
        [, $tp] = $this->locked();
        $this->admins(1);
        $new = $this->person('admin', 'Newbie Admin');
        $this->withPasskey($new, false);                                                          // a passkey added today: not for a serious action
        $this->ask($tp)->assertStatus(422);
        AuthCredential::where('user_id', $new->id)->update(['created_at' => now()->subDays(2)]);
        $this->ask($tp)->assertStatus(201);
    }

    public function test_the_person_the_administrators_and_the_managers_are_each_told_in_their_own_words(): void
    {
        [$p, $tp] = $this->locked();
        $admins = $this->admins();
        $boss = $this->person('super_admin', 'Olive Owner');                                      // an owner can approve too, so is one of the administrators
        $this->withPasskey($boss);
        $this->ask($tp, 'My phone was stolen')->assertStatus(201);

        $own = $this->ofType('recovery_asked');
        $this->assertCount(1, $own);
        $this->assertSame($p->id, $own[0]['to']);
        $this->assertStringContainsString('My phone was stolen', $own[0]['message']);
        $this->assertStringContainsString('If this was NOT you', $own[0]['message']);
        $this->assertStringContainsString('This was not me', $own[0]['options']['action_text']);
        $this->assertStringStartsWith('/secure-account?', $own[0]['options']['action_url']);

        $told = $this->ofType('recovery_request');
        $this->assertEqualsCanonicalizing([$admins[0][0]->id, $admins[1][0]->id, $boss->id], array_column($told, 'to'));
        $this->assertStringContainsString('Lena Locked', $told[0]['message']);
        $this->assertStringContainsString('check it is really them another way', $told[0]['message']);
        $this->assertSame('/admin/security/approvals', $told[0]['options']['action_url']);
        $this->assertNotContains($p->id, array_column($told, 'to'));
    }

    public function test_it_can_be_switched_off_for_a_server_without_the_script(): void
    {
        Schema::drop('auth_recovery_approvals');
        AssistedRecovery::forget();
        [, $tp] = $this->locked();
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertOk()->assertJsonPath('ready', false)->assertJsonPath('request', null);
        $this->ask($tp)->assertStatus(409)->assertJsonPath('reason', 'not_ready');
        $a = $this->admins(1);
        $this->as($a[0][1])->getJson('/api/auth/recovery-approvals')->assertOk()->assertJsonPath('ready', false)->assertJsonCount(0, 'data');
    }

    // ------------------------------------------------------------ the administrators

    public function test_an_administrator_sees_who_asked_what_they_said_and_where_from(): void
    {
        [$p, $tp] = $this->locked();
        $admins = $this->admins();
        $id = $this->ask($tp, 'My phone was stolen')->json('request.id');
        $list = $this->as($admins[0][1])->getJson('/api/auth/recovery-approvals')->assertOk();
        $list->assertJsonPath('ready', true)->assertJsonCount(1, 'data');
        $c = $list->json('data.0');
        $this->assertSame($id, $c['id']);
        $this->assertSame('pending', $c['state']);
        $this->assertSame('Lena Locked', $c['person']['name']);
        $this->assertSame($p->email, $c['person']['email']);
        $this->assertSame('My phone was stolen', $c['note']);
        $this->assertStringContainsString('127.0.0.1', $c['from']);
        $this->assertSame(1, $c['passkeys']);                                                     // the passkey on the phone they say is lost
        $this->assertSame(0, $c['codes_left']);
        $this->assertSame(2, $c['needed']);
        $this->assertSame(0, $c['approved']);
        $this->assertTrue($c['can_approve']);
        $this->assertTrue($c['has_passkey']);
    }

    public function test_the_person_and_anyone_who_could_not_do_it_themselves_see_nothing_and_can_answer_nothing(): void
    {
        [, $tp] = $this->locked();
        $this->admins();
        $rep = $this->person('cashier', 'Cass Cashier');
        [$tr, $dr] = $this->withPasskey($rep);
        $id = $this->ask($tp)->json('request.id');
        $this->as($tr)->getJson('/api/auth/recovery-approvals')->assertOk()->assertJsonCount(0, 'data');
        foreach (['options', 'decline', 'cancel'] as $door) {
            $this->as($tr)->postJson("/api/auth/recovery-approvals/{$id}/{$door}")->assertStatus(404);
            $this->as($tp)->postJson("/api/auth/recovery-approvals/{$id}/{$door}")->assertStatus(403);   // the person is held at the passkey screen: not even the door is open to them
        }
        $this->as($tp)->getJson('/api/auth/recovery-approvals')->assertStatus(403);
        $this->approve($tr, $id, $dr)->assertStatus(404);
        $this->assertSame(0, AuthRecoveryApproval::count());
    }

    public function test_an_approval_needs_a_reason_and_the_administrators_own_passkey_bound_to_that_request(): void
    {
        [, $tp] = $this->locked();
        [[, $t1, $d1], [, $t2, $d2]] = $this->admins();
        $id = $this->ask($tp)->json('request.id');
        $this->approve($t1, $id, $d1, null)->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->approve($t1, $id, $d1, 'ok')->assertStatus(422)->assertJsonPath('reason', 'reason_needed');
        $this->as($t1)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => 'Phoned them', 'current_password' => 'Right-password-1'])->assertStatus(403)->assertJsonPath('reason', 'passkey_needed');   // they have a passkey: the password is not enough
        $this->assertSame(0, AuthRecoveryApproval::count());

        // an answer meant for another request is no use here
        $other = $this->person('finance', 'Fiona Finance');
        $this->withPasskey($other);
        $to = $this->signIn($other);
        $idOther = $this->ask($to, 'Also lost')->assertStatus(201)->json('request.id');
        $q = $this->as($t1)->postJson("/api/auth/recovery-approvals/{$idOther}/options")->assertOk();
        $this->as($t1)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => 'Phoned them', 'challenge_id' => $q->json('challenge_id'), 'credential' => $d1->assert($q->json('options'))])->assertStatus(422)->assertJsonPath('reason', 'wrong_context');
        // and one administrator's challenge is not another's
        $q1 = $this->as($t1)->postJson("/api/auth/recovery-approvals/{$id}/options")->assertOk();
        $this->as($t2)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => 'Phoned them', 'challenge_id' => $q1->json('challenge_id'), 'credential' => $d2->assert($q1->json('options'))])->assertStatus(422);
        $this->assertSame(0, AuthRecoveryApproval::count());
        $this->approve($t1, $id, $d1)->assertOk();
    }

    public function test_it_takes_two_different_administrators_then_the_waiting_day_starts(): void
    {
        config(['security.recovery.request_hours' => 30]);                                        // (a different number from the day plus two days after the last approval)
        [$p, $tp] = $this->locked();
        [[$a1, $t1, $d1], [$a2, $t2, $d2]] = $this->admins();
        $id = $this->ask($tp)->json('request.id');

        $first = $this->approve($t1, $id, $d1, 'Phoned them on their own number')->assertOk();
        $first->assertJsonPath('state', 'pending');
        $this->assertStringContainsString('One more administrator', $first->json('message'));
        $this->assertNull(AuthRecoveryRequest::find($id)->release_at);
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request.approved', 1)->assertJsonPath('request.approved_by', ['Admin 1'])->assertJsonPath('request.state', 'pending');
        $this->assertSame([], $this->ofType('recovery_approved'));                                // the person is told when it is approved, not at each step

        // the same administrator can not count twice
        $this->approve($t1, $id, $d1)->assertStatus(409)->assertJsonPath('reason', 'already_approved');
        $this->as($t1)->getJson('/api/auth/recovery-approvals')->assertJsonPath('data.0.approved_by_me', true)->assertJsonPath('data.0.can_approve', false);
        $this->assertSame(1, AuthRecoveryApproval::count());

        $second = $this->approve($t2, $id, $d2, 'Saw them in the office')->assertOk();
        $second->assertJsonPath('state', 'cooling');
        $row = AuthRecoveryRequest::find($id);
        $this->assertEqualsWithDelta(24 * 3600, now()->diffInSeconds($row->release_at, false), 5);
        $this->assertEqualsWithDelta(72 * 3600, now()->diffInSeconds($row->expires_at, false), 5);   // a day to wait, two days to use it: from the last approval, not from when it was asked
        $approvals = AuthRecoveryApproval::orderBy('id')->get();
        $this->assertSame([$a1->id, $a2->id], $approvals->pluck('user_id')->all());
        $this->assertSame(['Phoned them on their own number', 'Saw them in the office'], $approvals->pluck('note')->all());
        $this->assertSame(['passkey', 'passkey'], $approvals->pluck('approved_with')->all());
        $this->assertNotNull($approvals[0]->credential_id);
        $log = SecurityEvent::where('event', 'recovery_approved')->orderBy('id')->get();
        $this->assertCount(2, $log);
        $this->assertSame([1, 2], $log->map(fn ($e) => $e->detail['approvals'])->all());
        $this->assertSame($a1->id, $log[0]->subject_id);
    }

    public function test_when_it_is_approved_the_person_the_administrators_and_the_managers_are_told_the_time(): void
    {
        [$p, $tp, $id, $admins] = $this->approved();
        $own = $this->ofType('recovery_approved');
        $this->assertCount(1, $own);
        $this->assertSame($p->id, $own[0]['to']);
        $this->assertStringContainsString('Admin 1 and Admin 2 approved', $own[0]['message']);
        $this->assertStringContainsString(AuthRecoveryRequest::find($id)->release_at->timezone('Africa/Nairobi')->format('j M Y, H:i'), $own[0]['message']);
        $this->assertStringContainsString('This was not me', $own[0]['options']['action_text']);
        $others = $this->ofType('recovery_approved_other');
        $this->assertEqualsCanonicalizing([$admins[0][0]->id, $admins[1][0]->id], array_column($others, 'to'));
        $this->assertStringContainsString('may still cancel it', $others[0]['message']);
    }

    public function test_an_administrator_can_say_no_and_it_ends(): void
    {
        [$p, $tp] = $this->locked();
        [[, $t1], [, $t2, $d2]] = $this->admins();
        $id = $this->ask($tp)->json('request.id');
        $this->as($t1)->postJson("/api/auth/recovery-approvals/{$id}/decline", ['reason' => 'I could not reach them'])->assertOk();
        $row = AuthRecoveryRequest::find($id);
        $this->assertSame('declined', $row->state());
        $this->assertSame('I could not reach them', $row->decline_note);
        $this->assertNotNull($row->declined_by_id);
        $this->assertSame(1, AuthRecoveryRequest::where('declined_by_id', User::where('name', 'Admin 1')->value('id'))->count());
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request', null);   // nothing open any more
        $this->approve($t2, $id, $d2)->assertStatus(404);
        $this->as($t2)->getJson('/api/auth/recovery-approvals')->assertJsonCount(0, 'data');
        $e = SecurityEvent::where('event', 'recovery_declined')->first();
        $this->assertSame('I could not reach them', $e->detail['reason']);
        $told = $this->ofType('recovery_ended');
        $this->assertCount(1, $told);
        $this->assertSame($p->id, $told[0]['to']);
        $this->assertStringContainsString('declined', $told[0]['message']);
        $this->ask($tp)->assertStatus(201);                                                       // and they may ask again
    }

    // ------------------------------------------------------------ the waiting day

    public function test_the_person_can_not_start_it_before_the_waiting_day_is_over(): void
    {
        [$p, $tp, $id] = $this->approved();
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422)->assertJsonPath('reason', 'cooling');
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request.state', 'cooling');
        $this->travel(23)->hours();
        $tp = $this->signIn($p);                                                                   // (a day later: signed in again, with the password)
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422)->assertJsonPath('reason', 'cooling');
        $this->assertFalse(app(Sessions::class)->recoveryFresh(\Laravel\Sanctum\PersonalAccessToken::findToken($tp)));
        $this->assertNull(AuthRecoveryRequest::find($id)->used_at);
    }

    public function test_it_can_not_be_started_before_it_has_been_approved(): void
    {
        [, $tp] = $this->locked();
        $this->admins();
        $id = $this->ask($tp)->json('request.id');
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422)->assertJsonPath('reason', 'not_ready');
    }

    public function test_after_the_waiting_day_the_person_starts_it_and_this_sign_in_may_add_a_new_passkey(): void
    {
        [$p, $tp, $id] = $this->approved();
        $this->travel(25)->hours();
        $other = $this->signIn($p);                                                                // another sign-in of theirs (perhaps the thief's)
        $tp = $this->signIn($p);
        $others = $p->tokens()->count() - 1;                                                       // every sign-in of theirs but this one
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request.state', 'ready');

        // before: this sign-in has a passkey it can not use, so it may not add another
        $this->as($tp)->postJson('/api/auth/passkeys/register/options')->assertStatus(403);
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertOk()->assertJsonPath('minutes', Sessions::RECOVERY_MINUTES);

        $row = AuthRecoveryRequest::find($id);
        $this->assertNotNull($row->used_at);
        $this->assertSame('used', $row->state());
        $this->assertTrue(app(Sessions::class)->recoveryFresh(\Laravel\Sanctum\PersonalAccessToken::findToken($tp)));
        $this->as($tp)->postJson('/api/auth/passkeys/register/options')->assertOk();
        $this->as($tp)->getJson('/api/_probe')->assertStatus(403);                                // and nothing else opens
        $this->as($other)->getJson('/api/auth/me')->assertStatus(401);                            // every other sign-in of theirs ended
        $this->assertSame('recovery', AuthSession::where('tokenable_id', $p->id)->whereNotNull('revoked_at')->latest('id')->first()->revoked_reason);
        $e = SecurityEvent::where('event', 'recovery_started')->first();
        $this->assertSame('alert', $e->severity);
        $this->assertGreaterThanOrEqual(2, $others);
        $this->assertSame($others, $e->detail['other_sign_ins_ended']);
        $this->assertSame(1, $p->tokens()->count());
        $this->assertCount(1, $this->ofType('recovery_started'));
        $this->assertStringContainsString('15 minutes', $this->ofType('recovery_started')[0]['message']);

        // it works once
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422)->assertJsonPath('reason', 'not_ready');
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request', null);
    }

    public function test_the_approval_does_not_last_for_ever(): void
    {
        [$p, , $id] = $this->approved();
        $this->travel(24 + 49)->hours();                                                          // the day to wait, and then more than the two days to use it
        $tp = $this->signIn($p);
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422);
        $this->assertSame('expired', AuthRecoveryRequest::find($id)->state());
        $this->as($tp)->getJson('/api/auth/recovery-requests/mine')->assertJsonPath('request', null);
    }

    public function test_a_request_nobody_answers_runs_out(): void
    {
        [$p, $tp] = $this->locked();
        [[$a1, , $d1]] = $this->admins();
        $id = $this->ask($tp)->json('request.id');
        $this->travel(73)->hours();
        $t1 = $this->strong($a1);
        $tp = $this->signIn($p);
        $this->assertSame('expired', AuthRecoveryRequest::find($id)->state());
        $this->approve($t1, $id, $d1)->assertStatus(404);
        $this->as($t1)->getJson('/api/auth/recovery-approvals')->assertJsonCount(0, 'data');
        $this->ask($tp)->assertStatus(201);
    }

    public function test_nobody_else_can_start_it(): void
    {
        [, , $id, $admins] = $this->approved();
        $this->travel(25)->hours();
        $admins[0][1] = $this->strong($admins[0][0]);
        $this->as($admins[0][1])->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(404);
        $stranger = $this->person('finance', 'Stranger');
        $this->as($this->signIn($stranger))->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(404);
        $this->assertNull(AuthRecoveryRequest::find($id)->used_at);
    }

    // ------------------------------------------------------------ stopping it

    public function test_the_person_can_stop_it_at_any_time(): void
    {
        [$p, $tp, $id] = $this->approved();
        $this->as($tp)->deleteJson("/api/auth/recovery-requests/{$id}")->assertOk()->assertJsonPath('request', null);
        $row = AuthRecoveryRequest::find($id);
        $this->assertSame('cancelled', $row->state());
        $this->assertSame('person', $row->cancelled_by);
        $this->travel(25)->hours();
        $tp = $this->signIn($p);
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422);
        $this->assertSame('person', SecurityEvent::where('event', 'recovery_cancelled')->first()->detail['by']);
    }

    public function test_ending_one_twice_is_written_down_and_told_once_and_a_used_one_can_not_be_ended(): void
    {
        [$p, $tp, $id] = $this->approved();
        $service = app(AssistedRecovery::class);
        $row = AuthRecoveryRequest::find($id);
        $service->cancel($row, 'person', $p, null);
        $service->cancel($row->fresh(), 'admin', null, 'again');
        $this->assertSame(1, SecurityEvent::where('event', 'recovery_cancelled')->count());
        $this->assertSame('person', AuthRecoveryRequest::find($id)->cancelled_by);
        $this->assertCount(1, $this->ofType('recovery_ended'));

        // one that was already used is history: it can not be "cancelled" afterwards
        [$p2, $tp2, $id2] = $this->approved();
        $this->travel(25)->hours();
        $tp2 = $this->signIn($p2);
        $this->as($tp2)->postJson("/api/auth/recovery-requests/{$id2}/start")->assertOk();
        $service->cancel(AuthRecoveryRequest::find($id2), 'link', null, null);
        $this->assertNull(AuthRecoveryRequest::find($id2)->cancelled_at);
        $this->assertSame('used', AuthRecoveryRequest::find($id2)->state());
    }

    public function test_the_not_me_button_only_counts_what_it_really_stopped(): void
    {
        [$p, $tp] = $this->locked();
        [[, $t1]] = $this->admins();
        $id = $this->ask($tp)->json('request.id');
        $this->as($t1)->postJson("/api/auth/recovery-approvals/{$id}/decline", ['reason' => 'No'])->assertOk();    // already over
        parse_str(SecureAccountLink::query($p), $q);
        $this->postJson('/api/auth/secure-account', $q)->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'secure_account')->first()->detail['recovery_stopped']);
        $this->assertSame('declined', AuthRecoveryRequest::find($id)->state());
    }

    public function test_someone_elses_request_is_not_theirs_to_stop(): void
    {
        [, , $id] = $this->approved();
        $stranger = $this->person('finance', 'Stranger');
        $this->as($this->signIn($stranger))->deleteJson("/api/auth/recovery-requests/{$id}")->assertStatus(404);
        $this->assertSame('cooling', AuthRecoveryRequest::find($id)->state());
    }

    public function test_an_administrator_can_cancel_during_the_waiting_day(): void
    {
        [$p, $tp, $id, $admins] = $this->approved();
        $third = $this->person('admin', 'Admin Three');
        [$t3] = $this->withPasskey($third);
        $this->as($t3)->getJson('/api/auth/recovery-approvals')->assertJsonPath('data.0.state', 'cooling')->assertJsonPath('data.0.can_approve', false)->assertJsonPath('data.0.can_cancel', true);
        $this->as($t3)->postJson("/api/auth/recovery-approvals/{$id}/cancel", ['reason' => 'They told me it was not them'])->assertOk();
        $row = AuthRecoveryRequest::find($id);
        $this->assertSame('cancelled', $row->state());
        $this->assertSame('admin', $row->cancelled_by);
        $this->assertSame($third->id, $row->cancelled_by_id);
        $this->assertSame('They told me it was not them', SecurityEvent::where('event', 'recovery_cancelled')->first()->detail['note']);
        $this->travel(25)->hours();
        $tp = $this->signIn($p);
        $this->as($tp)->postJson("/api/auth/recovery-requests/{$id}/start")->assertStatus(422);
        $told = $this->ofType('recovery_ended');
        $this->assertSame($p->id, end($told)['to']);
        $this->assertStringContainsString('cancelled', end($told)['message']);
        $this->assertStringContainsString('Admin Three', end($told)['message']);
    }

    public function test_the_not_me_button_stops_a_request_for_help_as_well(): void
    {
        [$p, $tp, $id] = $this->approved();
        $this->assertSame('cooling', AuthRecoveryRequest::find($id)->state());
        parse_str(SecureAccountLink::query($p), $q);
        $this->postJson('/api/auth/secure-account', $q)->assertOk();
        $row = AuthRecoveryRequest::find($id);
        $this->assertSame('cancelled', $row->state());
        $this->assertSame('link', $row->cancelled_by);
        $this->assertSame(1, SecurityEvent::where('event', 'secure_account')->first()->detail['recovery_stopped']);
    }

    public function test_the_not_me_button_changes_nothing_for_someone_with_nothing_open(): void
    {
        $p = $this->person('finance', 'Fiona');
        parse_str(SecureAccountLink::query($p), $q);
        $this->postJson('/api/auth/secure-account', $q)->assertOk();
        $this->assertSame(0, SecurityEvent::where('event', 'secure_account')->first()->detail['recovery_stopped']);
    }

    // ------------------------------------------------------------ the numbers and the passwords

    public function test_one_approval_is_enough_when_the_owner_says_so(): void
    {
        config(['security.recovery.approvals' => 1]);
        [, $tp] = $this->locked();
        [[, $t1, $d1]] = $this->admins(1);
        $id = $this->ask($tp)->assertStatus(201)->json('request.id');
        $this->approve($t1, $id, $d1)->assertOk()->assertJsonPath('state', 'cooling');
        $this->assertSame(1, AuthRecoveryRequest::find($id)->needed);
    }

    public function test_an_administrator_with_no_passkey_yet_may_answer_with_their_password(): void
    {
        config(['security.policy.passkeys.mode' => 'off']);                                       // (with the rule on, an administrator without a passkey would be held at the passkey screen)
        SecuritySettings::forget();
        [, $tp] = $this->locked();
        [[, $t1, $d1]] = $this->admins(1);
        $plain = $this->person('admin', 'Plain Admin');
        $tpl = $this->signIn($plain);
        $id = $this->ask($tp)->assertStatus(201)->json('request.id');
        $this->as($tpl)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => 'Phoned them', 'current_password' => 'wrong'])->assertStatus(422)->assertJsonPath('reason', 'wrong_password');
        $this->assertSame(1, SecurityEvent::where('event', 'stepup_failed')->where('detail->as', 'recovery')->count());
        $this->as($tpl)->postJson("/api/auth/recovery-approvals/{$id}/approve", ['reason' => 'Phoned them', 'current_password' => 'Right-password-1'])->assertOk();
        $this->assertSame('password', AuthRecoveryApproval::first()->approved_with);
    }

    public function test_the_alerts_switch_stops_the_persons_email_but_not_the_messages_the_administrators_need(): void
    {
        config(['security.alerts_email' => false]);
        [, $tp] = $this->locked();
        $this->admins();
        $this->ask($tp)->assertStatus(201);
        $this->assertSame([], $this->ofType('recovery_asked'));
        $this->assertCount(2, $this->ofType('recovery_request'));
    }

    public function test_the_routes_are_behind_the_sign_in_and_the_speed_limits(): void
    {
        foreach (['get' => ['/api/auth/recovery-requests/mine', '/api/auth/recovery-approvals'], 'post' => ['/api/auth/recovery-requests', '/api/auth/recovery-requests/x/start', '/api/auth/recovery-approvals/x/approve', '/api/auth/recovery-approvals/x/decline', '/api/auth/recovery-approvals/x/cancel', '/api/auth/recovery-approvals/x/options'], 'delete' => ['/api/auth/recovery-requests/x']] as $method => $urls) {
            foreach ($urls as $url) {
                $this->{$method.'Json'}($url)->assertStatus(401);
            }
        }
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/auth/recovery-requests') || str_starts_with($r->uri(), 'api/auth/recovery-approvals'));
        $this->assertCount(9, $routes);
        foreach ($routes as $r) {
            if ($r->uri() === 'api/auth/recovery-requests/mine') {
                continue;                                                                          // (the person's own screen asks now and then; nothing is guessed there)
            }
            $expect = str_starts_with($r->uri(), 'api/auth/recovery-approvals') ? (in_array('GET', $r->methods(), true) ? 'throttle:approvals' : 'throttle:step-up') : (str_ends_with($r->uri(), 'recovery-requests') ? 'throttle:recovery-request' : 'throttle:passkey-manage');
            $this->assertContains($expect, $r->gatherMiddleware(), $r->uri());
        }
    }

    public function test_looking_at_the_list_never_uses_up_the_answers(): void
    {
        config(['security.rate_limits.step_up' => ['user' => [[3, 15]]], 'security.rate_limits.approvals' => ['user' => [[50, 15]]]]);
        [, $tp] = $this->locked();
        [[, $t1, $d1]] = $this->admins(2);
        $id = $this->ask($tp)->json('request.id');
        for ($i = 0; $i < 20; $i++) {
            $this->as($t1)->getJson('/api/auth/recovery-approvals')->assertOk();
        }
        $this->approve($t1, $id, $d1)->assertOk();
    }

    public function test_the_codes_the_person_has_left_are_shown_to_the_administrators(): void
    {
        [$p, $tp] = $this->locked();
        $admins = $this->admins();
        app(RecoveryCodes::class)->generate($p);
        $this->ask($tp)->assertStatus(201);
        $this->as($admins[0][1])->getJson('/api/auth/recovery-approvals')->assertJsonPath('data.0.codes_left', 10);
    }
}
