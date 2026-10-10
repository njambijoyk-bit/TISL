<?php

namespace Tests\Feature;

use App\Models\Security\AuthSession;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\DeviceInfo;
use App\Services\Security\SecurityLog;
use App\Services\Security\SessionPolicy;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Signed-in browsers: they end when idle too long or too old, when the person ends them, when the password changes, and when the account is suspended. */
class SecuritySessionsTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
    }

    private function person(string $role = 'customer', array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina', 'email' => $role . '@example.com', 'password' => Hash::make('Old-password-1'), 'role' => $role]);
    }

    private function signIn(User $u, string $ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', string $ip = '41.80.1.1'): string
    {
        $r = Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => $ua, 'REMOTE_ADDR' => $ip]);

        return app(Sessions::class)->issue($u, $r);
    }

    private function as(string $token): self
    {
        return $this->withHeader('Authorization', 'Bearer ' . $token);
    }

    private function httpStatus(string $token): int
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();   // a browser that signed in with a token carries no cookie into its next request

        return $this->as($token)->getJson('/api/auth/sessions')->getStatusCode();
    }

    // ------------------------------------------------------------ how long a session lives

    public function test_a_session_ends_by_the_policy_for_the_kind_of_account(): void
    {
        $staff = $this->person('admin');
        $customer = $this->person('customer');
        $this->signIn($staff);
        $this->signIn($customer);
        $ends = fn (User $u) => (int) now()->diffInMinutes($u->tokens()->first()->expires_at, false);
        $this->assertEqualsWithDelta(720, $ends($staff), 1, 'staff: 12 hours');
        $this->assertEqualsWithDelta(43200, $ends($customer), 1, 'customers: 30 days');
    }

    public function test_an_idle_staff_session_ends_but_a_customers_goes_on(): void
    {
        $staff = $this->signIn($this->person('admin'));
        $customer = $this->signIn($this->person('customer'));
        $this->assertSame([200, 200], [$this->httpStatus($staff), $this->httpStatus($customer)]);
        $this->travel(13)->hours();
        $this->assertSame([401, 200], [$this->httpStatus($staff), $this->httpStatus($customer)], 'twelve hours idle ends a staff session');
    }

    public function test_using_a_session_keeps_it_alive_and_the_end_moves_forward_only_every_few_minutes(): void
    {
        $u = $this->person('admin');
        $t = $this->signIn($u);
        $this->travel(2)->minutes();
        $this->httpStatus($t);
        $first = $u->tokens()->first()->expires_at;
        $this->assertEqualsWithDelta(718, now()->diffInMinutes($first, false), 0.5, 'a use within five minutes writes nothing: the end is still twelve hours from sign-in');
        $this->travel(8)->hours();
        $this->assertSame(200, $this->httpStatus($t));
        $moved = $u->tokens()->first()->expires_at;
        $this->assertEqualsWithDelta(720, now()->diffInMinutes($moved, false), 1, 'after eight busy hours it has twelve more');
        $this->travel(8)->hours();
        $this->assertSame(200, $this->httpStatus($t), 'still alive: eight hours later it was used again, sixteen after sign-in');
    }

    public function test_a_session_never_outlives_its_absolute_limit_however_busy(): void
    {
        $staff = $this->person('admin');
        $created = now()->subDays(13)->subHours(20);
        $now = now();
        $this->assertSame(0, (int) SessionPolicy::expiry($staff, $created, $now)->diffInSeconds($created->copy()->addDays(14)), 'four hours left of the fourteen days beat twelve idle hours');
        $this->assertSame(0, (int) SessionPolicy::expiry($staff, $now->copy()->subDay(), $now)->diffInSeconds($now->copy()->addMinutes(720)), 'a young session gets its idle time');
    }

    public function test_a_session_made_before_expiry_existed_gets_an_end_the_first_time_it_is_used(): void
    {
        $u = $this->person('admin');
        $plain = $u->createToken('old')->plainTextToken;   // the old way: no end date at all
        $this->assertNull($u->tokens()->first()->expires_at);
        $this->assertSame(200, $this->httpStatus($plain));
        $this->assertNotNull($u->tokens()->first()->expires_at);
    }

    public function test_a_suspended_account_is_out_at_once_not_at_its_next_sign_in(): void
    {
        $u = $this->person('admin');
        $t = $this->signIn($u);
        $this->assertSame(200, $this->httpStatus($t));
        $u->forceFill(['status' => 'suspended'])->save();
        $this->assertSame(401, $this->httpStatus($t));
        $u->forceFill(['status' => 'active'])->save();
        $this->assertSame(200, $this->httpStatus($t));
    }

    // ------------------------------------------------------------ the person's own list

    public function test_the_list_shows_each_browser_once_with_where_it_came_from_and_which_is_this_one(): void
    {
        $u = $this->person('customer');
        $a = $this->signIn($u, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', '41.80.1.1');
        $this->signIn($u, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', '105.9.9.9');
        $this->person('manager');
        $rows = $this->as($a)->getJson('/api/auth/sessions')->json('data');
        $this->assertCount(2, $rows);
        $this->assertEqualsCanonicalizing(['Chrome on Windows', 'Safari on iPhone'], array_column($rows, 'label'));
        $this->assertSame(['Chrome on Windows'], array_column(array_filter($rows, fn ($r) => $r['current']), 'label'));
        $this->assertContains('105.9.9.9', array_column($rows, 'ip'));
    }

    public function test_ending_one_device_ends_only_that_one_and_never_somebody_elses(): void
    {
        $mine = $this->person('customer');
        $theirs = $this->person('manager');
        $a = $this->signIn($mine);
        $b = $this->signIn($mine);
        $other = $this->signIn($theirs);
        $bId = $mine->tokens()->orderByDesc('id')->first()->id;
        $otherId = $theirs->tokens()->first()->id;
        $this->app['auth']->forgetGuards();
        $this->as($a)->deleteJson("/api/auth/sessions/{$otherId}")->assertStatus(404);
        $this->assertSame(200, $this->httpStatus($other), 'somebody else\'s session is untouched');
        $this->app['auth']->forgetGuards();
        $this->as($a)->deleteJson("/api/auth/sessions/{$bId}")->assertOk();
        $this->assertSame([200, 401], [$this->httpStatus($a), $this->httpStatus($b)]);
        $this->assertSame('revoked', AuthSession::where('token_id', $bId)->value('revoked_reason'));
    }

    public function test_sign_out_everywhere_keeps_this_one_or_ends_it_too(): void
    {
        $u = $this->person('customer');
        [$a, $b, $c] = [$this->signIn($u), $this->signIn($u), $this->signIn($u)];
        $this->as($a)->postJson('/api/auth/sessions/revoke-others')->assertOk()->assertJsonPath('ended', 2);
        $this->assertSame([200, 401, 401], [$this->httpStatus($a), $this->httpStatus($b), $this->httpStatus($c)]);
        $this->app['auth']->forgetGuards();
        $this->as($a)->postJson('/api/auth/sessions/revoke-all')->assertOk();
        $this->assertSame(401, $this->httpStatus($a));
        $this->assertSame(0, $u->tokens()->count());
        $this->assertSame(3, AuthSession::whereNotNull('revoked_at')->count());
    }

    public function test_signing_out_marks_the_session_as_ended_by_the_person(): void
    {
        $u = $this->person('customer');
        $t = $this->signIn($u);
        $id = $u->tokens()->first()->id;
        $this->as($t)->postJson('/api/auth/logout')->assertOk();
        $this->assertSame('logout', AuthSession::where('token_id', $id)->value('revoked_reason'));
        $this->assertSame(401, $this->httpStatus($t));
    }

    // ------------------------------------------------------------ a new password ends the old sessions

    public function test_changing_the_password_signs_everyone_else_out_and_keeps_this_browser(): void
    {
        $u = $this->person('customer');
        [$mine, $stolen, $laptop] = [$this->signIn($u), $this->signIn($u), $this->signIn($u)];
        $r = $this->as($mine)->postJson('/api/auth/change-password', ['current_password' => 'Old-password-1', 'new_password' => 'A-much-better-pass-9', 'new_password_confirmation' => 'A-much-better-pass-9']);
        $r->assertOk();
        $this->assertStringContainsString('2 other devices were signed out', $r->json('message'));
        $this->assertSame([200, 401, 401], [$this->httpStatus($mine), $this->httpStatus($stolen), $this->httpStatus($laptop)]);
        $this->assertSame(2, AuthSession::where('revoked_reason', 'password_changed')->count());
        $e = SecurityEvent::where('event', 'password_changed')->first();
        $this->assertSame([$u->id, 2, 'notice'], [$e->subject_id, $e->detail['sessions_ended'], $e->severity]);
    }

    public function test_a_wrong_current_password_ends_nothing(): void
    {
        $u = $this->person('customer');
        [$a, $b] = [$this->signIn($u), $this->signIn($u)];
        $this->as($a)->postJson('/api/auth/change-password', ['current_password' => 'nope', 'new_password' => 'A-much-better-pass-9', 'new_password_confirmation' => 'A-much-better-pass-9'])->assertStatus(401);
        $this->assertSame([200, 200], [$this->httpStatus($a), $this->httpStatus($b)]);
    }

    public function test_a_password_reset_by_email_ends_every_session(): void
    {
        Schema::create('password_reset_tokens', function ($t) { $t->string('email')->primary(); $t->string('token'); $t->timestamp('created_at')->nullable(); });
        $u = $this->person('customer');
        [$a, $b] = [$this->signIn($u), $this->signIn($u)];
        $token = app('auth.password.broker')->createToken($u);
        $this->postJson('/api/auth/reset-password', ['token' => $token, 'email' => $u->email, 'password' => 'A-much-better-pass-9', 'password_confirmation' => 'A-much-better-pass-9'])->assertOk();
        $this->assertSame([401, 401], [$this->httpStatus($a), $this->httpStatus($b)]);
        $this->assertTrue(Hash::check('A-much-better-pass-9', $u->fresh()->password));
        $this->assertSame('warning', SecurityEvent::where('event', 'password_reset')->value('severity'));
    }

    public function test_the_forced_password_change_ends_old_sessions_and_gives_a_new_one(): void
    {
        $u = $this->person('customer', ['force_password_change' => true]);
        $old = $this->signIn($u);
        $r = $this->postJson('/api/auth/force-change-password', ['email' => $u->email, 'current_password' => 'Old-password-1', 'new_password' => 'A-much-better-pass-9', 'new_password_confirmation' => 'A-much-better-pass-9']);
        $r->assertOk();
        $this->assertSame(401, $this->httpStatus($old));
        $this->assertSame(200, $this->httpStatus($r->json('token')));
        $this->assertSame(1, $u->tokens()->count());
    }

    // ------------------------------------------------------------ small things

    public function test_the_kind_of_browser_is_named_in_plain_words(): void
    {
        $cases = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' => 'Chrome on Windows',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0' => 'Edge on Windows',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Mobile Safari/604.1' => 'Safari on iPhone',
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' => 'Chrome on Android',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/121.0' => 'Firefox on Mac',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 OPR/105.0' => 'Opera on Linux',
            '' => 'A browser on an unknown device',
        ];
        foreach ($cases as $ua => $label) {
            $this->assertSame($label, DeviceInfo::describe($ua)['label'], $ua);
        }
        $this->assertNotSame(DeviceInfo::describe('Firefox/1 Windows')['key'], DeviceInfo::describe('Chrome/1 Windows')['key']);
        $this->assertSame(DeviceInfo::describe('Chrome/119 Windows')['key'], DeviceInfo::describe('Chrome/120 Windows')['key'], 'a new version of the same browser is the same kind');
    }

    public function test_the_security_log_never_gets_in_the_way(): void
    {
        Schema::drop('security_events');
        SecurityLog::forget();
        SecurityLog::record('login_ok', $this->person('customer'), Request::create('/x'));   // no table: quietly does nothing
        $this->assertFalse(SecurityLog::ready());
        Schema::drop('auth_sessions');
        Sessions::forget();
        $u = $this->person('admin', ['email' => 'second@example.com']);
        $t = $this->signIn($u);   // no record kept, but the token still ends by policy
        $this->assertNotNull($u->tokens()->first()->expires_at);
        $this->assertSame(200, $this->httpStatus($t), 'and it works without the record');
    }

    public function test_a_first_sign_in_is_not_new_and_a_different_kind_of_browser_is(): void
    {
        $u = $this->person('customer');
        $sessions = app(Sessions::class);
        $req = fn (string $ua) => Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => $ua]);
        $this->assertFalse($sessions->hasHistory($u));
        $this->signIn($u, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36');
        $this->assertTrue($sessions->hasHistory($u));
        $this->assertTrue($sessions->seenBefore($u, $req('Mozilla/5.0 (Windows NT 10.0) Chrome/121.0 Safari/537.36')));
        $this->assertFalse($sessions->seenBefore($u, $req('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/121.0')));
    }
}
