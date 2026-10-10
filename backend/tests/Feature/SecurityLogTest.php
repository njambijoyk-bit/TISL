<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\SecurityLogController;
use App\Models\Applicant;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SecurityEvents;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The security log: what gets written at sign-in, and the admin page that reads it. */
class SecurityLogTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';
    private const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        config(['security.rate_limits.sign_in' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]]]);
    }

    private function person(array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    private function request(string $ua = self::CHROME, string $ip = '41.80.1.1'): Request
    {
        return Request::create('/x', 'POST', [], [], [], ['HTTP_USER_AGENT' => $ua, 'REMOTE_ADDR' => $ip]);
    }

    private function signIn(string $email, string $password, string $ua = self::CHROME, string $ip = '41.80.1.1')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip, 'HTTP_USER_AGENT' => $ua])->postJson('/api/auth/login', ['email' => $email, 'password' => $password]);
    }

    private function lines(string $event): \Illuminate\Support\Collection
    {
        return SecurityEvent::where('event', $event)->orderBy('id')->get();
    }

    private function ask(string $method, array $query = []): array
    {
        return app(SecurityLogController::class)->{$method}(Request::create('/x', 'GET', $query))->getData(true);
    }

    // ------------------------------------------------------------ what gets written

    public function test_every_sign_in_is_logged_with_how_and_from_what_and_whether_the_device_is_new(): void
    {
        $u = $this->person();
        app(Sessions::class)->issue($u, $this->request(), 'auth-token', 'password');
        app(Sessions::class)->issue($u, $this->request(self::PHONE, '102.1.1.1'), 'auth-token', 'password');
        app(Sessions::class)->issue($u, $this->request(self::PHONE, '102.1.1.1'), 'auth-token', 'reset');
        $rows = $this->lines('sign_in');
        $this->assertCount(3, $rows);
        $this->assertSame([false, true, false], $rows->map(fn ($r) => $r->detail['new_device'])->all(), 'the very first sign-in is not "new"; a different kind of browser is; the same one again is not');
        $this->assertSame(['Chrome on Windows', 'Safari on iPhone', 'Safari on iPhone'], $rows->map(fn ($r) => $r->detail['device'])->all());
        $this->assertSame(['password', 'password', 'reset'], $rows->map(fn ($r) => $r->detail['method'])->all());
        $this->assertSame([$u->id, 'user', '41.80.1.1', 'info'], [$rows[0]->subject_id, $rows[0]->subject_type, $rows[0]->ip, $rows[0]->severity]);
    }

    public function test_a_wrong_password_is_logged_for_a_known_email_and_an_unknown_one_alike_but_says_which(): void
    {
        $u = $this->person();
        $this->signIn('amina@example.com', 'wrong');
        $this->signIn('nobody@example.com', 'wrong');
        $rows = $this->lines('sign_in_failed');
        $this->assertCount(2, $rows);
        $this->assertSame(['wrong_password', $u->id, 'amina@example.com', 'notice'], [$rows[0]->detail['reason'], $rows[0]->subject_id, $rows[0]->email_tried, $rows[0]->severity]);
        $this->assertSame(['unknown_email', null, 'nobody@example.com'], [$rows[1]->detail['reason'], $rows[1]->subject_id, $rows[1]->email_tried]);
        $this->assertSame('41.80.1.1', $rows[1]->ip);
    }

    public function test_a_right_password_on_an_account_that_may_not_sign_in_is_logged_as_refused(): void
    {
        $this->person(['status' => 'suspended']);
        $this->signIn('amina@example.com', 'Right-password-1');
        $row = $this->lines('sign_in_refused')->first();
        $this->assertSame(['warning', 'not_allowed'], [$row->severity, $row->detail['reason']]);
        $this->assertCount(0, $this->lines('sign_in'), 'no session was made');
    }

    public function test_the_temporary_password_door_logs_a_wrong_one_and_a_refusal(): void
    {
        $this->person(['force_password_change' => true]);
        $door = fn (string $pw) => $this->withServerVariables(['REMOTE_ADDR' => '41.80.1.1'])->postJson('/api/auth/force-change-password', ['email' => 'amina@example.com', 'current_password' => $pw, 'new_password' => 'purple-giraffe-lantern', 'new_password_confirmation' => 'purple-giraffe-lantern']);
        $door('wrong');
        $failed = $this->lines('sign_in_failed')->first();
        $this->assertSame(['temporary_password', 'amina@example.com', 'notice'], [$failed->detail['reason'], $failed->email_tried, $failed->severity]);
        User::first()->forceFill(['status' => 'suspended'])->save();
        $door('Right-password-1');
        $refused = $this->lines('sign_in_refused')->first();
        $this->assertSame(['temporary_password', 'warning'], [$refused->detail['door'], $refused->severity]);
    }

    public function test_job_applicants_sign_ins_are_logged_the_same_way(): void
    {
        Schema::create('applicants', function ($t) {
            $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->unique(); $t->string('password'); $t->string('status')->default('active');
            $t->boolean('must_change_password')->default(false); $t->timestamp('email_verified_at')->nullable(); $t->string('remember_token', 100)->nullable(); $t->softDeletes(); $t->timestamps();
        });
        $a = Applicant::forceCreate(['first_name' => 'Job', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $login = fn (string $email, string $pw) => app(\App\Http\Controllers\Api\Careers\ApplicantAuthController::class)->login(Request::create('/x', 'POST', ['email' => $email, 'password' => $pw], [], [], ['REMOTE_ADDR' => '41.80.1.1']));
        $login('job@example.com', 'wrong');
        $login('nobody@example.com', 'wrong');
        $rows = $this->lines('sign_in_failed');
        $this->assertSame([['wrong_password', 'applicant', $a->id], ['unknown_email', null, null]], $rows->map(fn ($r) => [$r->detail['reason'], $r->subject_type, $r->subject_id])->all());
        $this->assertSame('applicant', $rows[0]->detail['door']);
        $login('job@example.com', 'Right-password-1');
        $this->assertSame('applicant', $this->lines('sign_in')->first()->subject_type);
        $a->forceFill(['status' => 'suspended'])->save();
        $login('job@example.com', 'Right-password-1');
        $refused = $this->lines('sign_in_refused')->first();
        $this->assertSame(['applicant', 'applicant', 'warning'], [$refused->subject_type, $refused->detail['door'], $refused->severity]);
    }

    public function test_a_good_sign_in_through_the_door_and_a_sign_out_are_both_logged(): void
    {
        $this->person();
        $token = $this->signIn('amina@example.com', 'Right-password-1')->json('token');
        $this->assertCount(1, $this->lines('sign_in'));
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/logout')->assertOk();
        $this->assertCount(1, $this->lines('sign_out'));
    }

    // ------------------------------------------------------------ the page's data

    private function seedLines(): void
    {
        $u = $this->person();
        $b = $this->person(['name' => 'Baraka Otieno', 'email' => 'baraka@example.com']);
        $now = now();
        $rows = [   // oldest first: the log only ever adds, so a later line has a later number
            ['sign_in', 'info', $b, null, '102.1.1.1', self::PHONE, $now->copy()->subDays(3)],
            ['sign_in', 'info', $u, null, '41.80.1.1', self::CHROME, $now->copy()->subMinutes(50)],
            ['sign_in_failed', 'notice', $u, 'amina@example.com', '203.0.113.9', self::CHROME, $now->copy()->subMinutes(40)],
            ['sign_in_failed', 'notice', null, 'nobody@example.com', '203.0.113.9', self::PHONE, $now->copy()->subMinutes(30)],
            ['sign_in_blocked', 'warning', null, 'nobody@example.com', '203.0.113.9', null, $now->copy()->subMinutes(20)],
            ['sign_in_under_attack', 'alert', null, 'amina@example.com', null, null, $now->copy()->subMinutes(10)],
        ];
        foreach ($rows as [$event, $sev, $subject, $email, $ip, $ua, $at]) {
            SecurityEvent::create(['event' => $event, 'severity' => $sev, 'subject_type' => $subject ? 'user' : null, 'subject_id' => $subject?->id, 'email_tried' => $email, 'ip' => $ip, 'user_agent' => $ua, 'detail' => ['x' => 1], 'created_at' => $at]);
        }
    }

    public function test_the_lines_come_newest_first_in_plain_words_with_who_where_and_on_what(): void
    {
        $this->seedLines();
        $r = $this->ask('index');
        $this->assertTrue($r['ready']);
        $this->assertSame(6, $r['total']);
        $this->assertSame(['sign_in_under_attack', 'sign_in_blocked', 'sign_in_failed', 'sign_in_failed', 'sign_in', 'sign_in'], array_column($r['data'], 'event'));
        $first = $r['data'][0];
        $this->assertSame(['Many wrong passwords for one email, from anywhere', 'alert'], [$first['label'], $first['severity']]);
        $this->assertNull($first['who']);
        $failed = $r['data'][3];
        $this->assertSame(['Amina Wanjiru', 'amina@example.com', 'user'], [$failed['who']['name'], $failed['who']['email'], $failed['who']['type']]);
        $this->assertSame(['203.0.113.9', 'Chrome on Windows', 'amina@example.com'], [$failed['ip'], $failed['device'], $failed['email_tried']]);
        $this->assertNull($r['data'][1]['device'], 'no browser recorded, none shown');
        $this->assertContains('sign_in_failed', array_column($r['events'], 'event'));
    }

    public function test_the_lines_can_be_narrowed_by_how_serious_which_kind_who_and_when(): void
    {
        $this->seedLines();
        $ids = fn (array $q) => array_column($this->ask('index', $q)['data'], 'event');
        $this->assertSame(['sign_in_under_attack'], $ids(['severity' => 'alert']));
        $this->assertSame(['sign_in_under_attack', 'sign_in_blocked'], $ids(['severity' => 'alert,warning']));
        $this->assertSame(['sign_in_failed', 'sign_in_failed'], $ids(['event' => 'sign_in_failed']));
        $this->assertSame(['sign_in_blocked', 'sign_in_failed', 'sign_in_failed'], $ids(['event' => 'sign_in_failed,sign_in_blocked']));
        $this->assertCount(3, $ids(['q' => '203.0.113']), 'by address: the two wrong passwords and the wait');
        $this->assertSame(['sign_in_under_attack', 'sign_in_failed', 'sign_in'], $ids(['q' => 'amina@example.com']), 'by the email typed, and by the email of the person a line is about');
        $this->assertSame(['sign_in'], $ids(['q' => 'Baraka']), 'by the name of the person');
        $this->assertSame(['sign_in'], $ids(['subject' => 'user:'.User::where('email', 'baraka@example.com')->value('id')]));
        $this->assertCount(5, $ids(['from' => now()->subDay()->toDateString()]));
        $this->assertCount(1, $ids(['to' => now()->subDay()->toDateString()]));
    }

    public function test_a_user_and_an_applicant_with_the_same_number_are_not_mixed_up(): void
    {
        Schema::create('applicants', function ($t) { $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email'); $t->softDeletes(); $t->timestamps(); });
        $u = $this->person();
        $a = Applicant::forceCreate(['first_name' => 'Job', 'last_name' => 'Seeker', 'email' => 'job@example.com']);
        $this->assertSame($u->id, $a->id);
        SecurityLog::record('sign_in', $u, $this->request());
        SecurityLog::record('sign_in', $a, $this->request());
        $this->assertSame(['Amina Wanjiru'], array_column(array_column($this->ask('index', ['subject' => "user:{$u->id}"])['data'], 'who'), 'name'));
        $this->assertSame(['Job Seeker'], array_column(array_column($this->ask('index', ['subject' => "applicant:{$a->id}"])['data'], 'who'), 'name'));
    }

    public function test_the_date_filters_take_in_the_whole_day(): void
    {
        $this->travelTo(now()->setTime(12, 0));
        SecurityEvent::create(['event' => 'early', 'severity' => 'info', 'created_at' => now()->startOfDay()->addMinutes(5)]);
        SecurityEvent::create(['event' => 'late', 'severity' => 'info', 'created_at' => now()->endOfDay()->subMinutes(5)]);
        $today = now()->toDateString();
        $this->assertEqualsCanonicalizing(['early', 'late'], array_column($this->ask('index', ['to' => $today])['data'], 'event'), 'up to and including that day');
        $this->assertEqualsCanonicalizing(['early', 'late'], array_column($this->ask('index', ['from' => $today.' 15:30'])['data'], 'event'), 'from that day, whatever time of day was typed');
        $this->assertSame([], $this->ask('index', ['from' => now()->addDay()->toDateString()])['data']);
    }

    public function test_an_unknown_severity_filter_matches_nothing_rather_than_everything(): void
    {
        $this->seedLines();
        $this->assertCount(6, $this->ask('index', ['severity' => 'nonsense'])['data'], 'a filter with nothing recognisable is no filter');
        $this->assertCount(1, $this->ask('index', ['severity' => 'nonsense,alert'])['data']);
    }

    public function test_searching_does_not_treat_percent_and_underscore_as_wildcards(): void
    {
        $this->seedLines();
        $this->assertCount(0, $this->ask('index', ['q' => '%'])['data']);
        $this->assertCount(0, $this->ask('index', ['q' => 'amina_example'])['data']);
    }

    public function test_the_page_size_is_capped_and_pages_work(): void
    {
        for ($i = 0; $i < 7; $i++) {
            SecurityLog::record('sign_in', null, null, []);
        }
        $r = $this->ask('index', ['per_page' => 3, 'page' => 2]);
        $this->assertSame([3, 7, 3, 2], [count($r['data']), $r['total'], $r['last_page'], $r['page']]);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->ask('index', ['per_page' => 500]);
    }

    public function test_a_line_about_a_job_applicant_names_them(): void
    {
        Schema::create('applicants', function ($t) { $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email'); $t->softDeletes(); $t->timestamps(); });
        $a = Applicant::forceCreate(['first_name' => 'Job', 'last_name' => 'Seeker', 'email' => 'job@example.com']);
        SecurityLog::record('sign_in', $a, $this->request());
        $row = $this->ask('index')['data'][0];
        $this->assertSame(['Job Seeker', 'job@example.com', 'applicant'], [$row['who']['name'], $row['who']['email'], $row['who']['type']]);
    }

    public function test_the_summary_counts_the_period_and_names_the_noisiest_addresses_and_emails(): void
    {
        $this->seedLines();
        SecurityEvent::create(['event' => 'rate_limited', 'severity' => 'warning', 'ip' => '203.0.113.9', 'created_at' => now()->subMinutes(5)]);   // turned away counts as made to wait; a warning is not an alert
        $s = $this->ask('summary', ['hours' => 24]);
        $this->assertSame([1, 2, 2, 0, 1], [$s['signed_in'], $s['wrong_passwords'], $s['made_to_wait'], $s['refused'], $s['alerts']], 'the line from three days ago is not counted');
        $this->assertSame([['ip' => '203.0.113.9', 'count' => 4]], $s['top_addresses']);
        $this->assertSame([['email' => 'nobody@example.com', 'count' => 2], ['email' => 'amina@example.com', 'count' => 1]], $s['top_emails']);
        $this->assertSame(1, $this->ask('summary', ['hours' => 24 * 7])['alerts']);
        $this->assertSame(2, $this->ask('summary', ['hours' => 24 * 7])['signed_in']);
    }

    public function test_the_summary_shows_the_five_noisiest_addresses_most_first(): void
    {
        foreach ([['1.1.1.1', 6], ['2.2.2.2', 5], ['3.3.3.3', 4], ['4.4.4.4', 3], ['5.5.5.5', 2], ['6.6.6.6', 1]] as [$ip, $n]) {
            for ($i = 0; $i < $n; $i++) {
                SecurityEvent::create(['event' => 'sign_in_failed', 'severity' => 'notice', 'ip' => $ip, 'email_tried' => "u{$ip}@example.com", 'created_at' => now()->subMinutes(2)]);
            }
        }
        $s = $this->ask('summary');
        $this->assertSame(['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5'], array_column($s['top_addresses'], 'ip'));
        $this->assertSame([6, 5, 4, 3, 2], array_column($s['top_addresses'], 'count'));
        $this->assertCount(5, $s['top_emails']);
    }

    public function test_the_summary_counts_only_sessions_still_alive(): void
    {
        $u = $this->person();
        app(Sessions::class)->issue($u, $this->request());
        app(Sessions::class)->issue($u, $this->request(self::PHONE));
        $this->assertSame(2, $this->ask('summary')['signed_in_now']);
        $u->tokens()->first()->forceFill(['expires_at' => now()->subMinute()])->save();
        $this->assertSame(1, $this->ask('summary')['signed_in_now']);
    }

    public function test_before_the_script_is_run_the_page_says_so_instead_of_failing(): void
    {
        Schema::drop('security_events');
        foreach (['index', 'summary'] as $m) {
            $r = $this->ask($m);
            $this->assertFalse($r['ready']);
            $this->assertStringContainsString('script 123', $r['message']);
        }
    }

    public function test_only_people_who_may_see_the_log_can(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/admin/security/'));
        $this->assertCount(2, $routes);
        foreach ($routes as $route) {
            $this->assertContains('permission:security.view', $route->gatherMiddleware(), $route->uri());
        }
    }

    public function test_an_event_with_no_wording_still_reads_sensibly(): void
    {
        $this->assertSame('Some new thing', SecurityEvents::label('some_new_thing'));
        $this->assertSame('Signed in', SecurityEvents::label('sign_in'));
        $this->assertContains('rate_limited', array_column(SecurityEvents::all(), 'event'));
    }

    // ------------------------------------------------------------ keeping it tidy

    public function test_old_lines_go_routine_ones_first_and_alerts_last(): void
    {
        foreach (['info' => 91, 'notice' => 181, 'warning' => 366, 'alert' => 731] as $severity => $days) {
            SecurityEvent::create(['event' => 'too_old', 'severity' => $severity, 'created_at' => now()->subDays($days)]);
            SecurityEvent::create(['event' => 'young_enough', 'severity' => $severity, 'created_at' => now()->subDays($days - 2)]);
        }
        Artisan::call('security:prune');
        $this->assertSame(4, SecurityEvent::count());
        $this->assertSame(['young_enough'], SecurityEvent::pluck('event')->unique()->values()->all());
        $this->assertSame(['alert', 'info', 'notice', 'warning'], SecurityEvent::orderBy('severity')->pluck('severity')->all());
    }

    public function test_a_keep_time_of_zero_keeps_those_lines_for_ever(): void
    {
        config(['security.log.keep_days.alert' => 0]);
        SecurityEvent::create(['event' => 'x', 'severity' => 'alert', 'created_at' => now()->subYears(9)]);
        Artisan::call('security:prune');
        $this->assertSame(1, SecurityEvent::count());
    }

    public function test_the_tidy_up_is_on_the_schedule(): void
    {
        $this->assertTrue(collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->contains(fn ($e) => str_contains($e->command, 'security:prune')));
    }
}
