<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Careers\ApplicantAuthController;
use App\Models\Applicant;
use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\SignInGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** What sign-in says and does about wrong passwords: one answer for every way of being wrong, a wait that grows for the typist, and no lock a stranger can put on someone else. */
class SecuritySignInTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const IP = '41.80.1.1';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        config(['security.rate_limits.sign_in' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]]]);   // the speed limits have their own tests
    }

    private function person(array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina', 'email' => 'amina@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    /** A hasher that works as usual and remembers every check it was asked to make. */
    private function countingHasher(): object
    {
        $hasher = new class($this->app) extends \Illuminate\Hashing\HashManager {
            public array $calls = [];

            public function check($value, $hashedValue, array $options = [])
            {
                $this->calls[] = [$value, $hashedValue];

                return parent::check($value, $hashedValue, $options);
            }
        };
        Hash::swap($hasher);

        return $hasher;
    }

    private function signIn(string $email = 'amina@example.com', string $password = 'wrong', string $ip = self::IP)
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/auth/login', ['email' => $email, 'password' => $password]);
    }

    private function wrongTimes(int $n, string $email = 'amina@example.com', string $ip = self::IP): void
    {
        for ($i = 0; $i < $n; $i++) {
            $this->signIn($email, 'wrong', $ip);
        }
    }

    // ------------------------------------------------------------ one answer for every way of being wrong

    public function test_a_wrong_password_and_an_unknown_email_get_exactly_the_same_answer(): void
    {
        $this->person();
        $wrong = $this->signIn('amina@example.com', 'wrong');
        $unknown = $this->signIn('nobody@example.com', 'wrong');
        $this->assertSame(401, $wrong->getStatusCode());
        $this->assertSame(401, $unknown->getStatusCode());
        $this->assertSame($wrong->getContent(), $unknown->getContent());
    }

    public function test_a_suspended_account_is_not_given_away_to_someone_who_does_not_know_the_password(): void
    {
        $this->person(['status' => 'suspended']);
        $wrong = $this->signIn('amina@example.com', 'wrong');
        $this->assertSame(401, $wrong->getStatusCode());
        $this->assertSame($this->signIn('nobody@example.com', 'wrong')->getContent(), $wrong->getContent());
        $right = $this->signIn('amina@example.com', 'Right-password-1');
        $right->assertStatus(403);
        $this->assertStringContainsString('suspended', $right->json('message'));
        $this->assertArrayNotHasKey('token', $right->json());
    }

    public function test_an_account_locked_by_an_administrator_says_so_only_to_someone_with_the_right_password(): void
    {
        $this->person(['locked_until' => now()->addHour()]);
        $this->assertSame(401, $this->signIn('amina@example.com', 'wrong')->getStatusCode(), 'no 423 for strangers');
        $right = $this->signIn('amina@example.com', 'Right-password-1');
        $right->assertStatus(403);
        $this->assertStringContainsString('locked', $right->json('message'));
    }

    public function test_an_unknown_email_pays_for_one_real_password_check_like_everyone_else(): void
    {
        $this->person();
        $hasher = $this->countingHasher();
        $this->signIn('amina@example.com', 'typed-1');
        $this->signIn('nobody@example.com', 'typed-2');
        $this->assertCount(2, $hasher->calls, 'one check each, known email or not');
        $this->assertSame('typed-2', $hasher->calls[1][0]);
        $this->assertNotEmpty($hasher->calls[1][1], 'a real hash was checked against');
    }

    public function test_the_stand_in_hash_is_made_once_and_kept(): void
    {
        $this->signIn('nobody@example.com');
        $first = Cache::get('security:decoy-hash');
        $this->assertNotEmpty($first);
        $this->signIn('nobody2@example.com');
        $this->assertSame($first, Cache::get('security:decoy-hash'));
    }

    public function test_a_stored_value_that_is_not_a_password_hash_is_just_a_wrong_password(): void
    {
        $this->person(['email' => 'odd@example.com']);
        \Illuminate\Support\Facades\DB::table('users')->where('email', 'odd@example.com')->update(['password' => 'not-a-hash']);   // the model would hash it; the table can hold anything
        $this->assertSame(401, $this->signIn('odd@example.com', 'not-a-hash')->getStatusCode());
    }

    // ------------------------------------------------------------ the growing wait

    public function test_four_wrong_passwords_are_free_the_fifth_earns_a_wait_even_the_right_password_must_sit_out(): void
    {
        $this->person();
        $this->wrongTimes(4);
        $this->assertSame(401, $this->signIn('amina@example.com', 'wrong')->getStatusCode(), 'the fifth is still just wrong');
        $r = $this->signIn('amina@example.com', 'Right-password-1');
        $r->assertStatus(429);
        $this->assertSame(30, $r->json('retry_after'));
        $this->assertSame('30', $r->headers->get('Retry-After'));
        $this->assertStringContainsString('Too many wrong passwords. Please wait 30 seconds', $r->json('message'));
    }

    public function test_after_the_wait_the_right_password_gets_in_and_the_count_starts_again(): void
    {
        $this->person();
        $this->wrongTimes(5);
        $this->assertSame(429, $this->signIn('amina@example.com', 'Right-password-1')->getStatusCode());
        $this->travel(31)->seconds();
        $this->signIn('amina@example.com', 'Right-password-1')->assertOk();
        $this->wrongTimes(4);
        $this->assertSame(401, $this->signIn('amina@example.com', 'wrong')->getStatusCode(), 'four free tries again, and no wait yet');
        $this->assertSame(429, $this->signIn('amina@example.com', 'wrong')->getStatusCode());
    }

    public function test_the_waits_grow_and_the_last_one_repeats(): void
    {
        config(['security.login.wait_seconds' => [30, 60, 300]]);
        $waits = [];
        for ($i = 0; $i < 8; $i++) {
            $waits[] = SignInGuard::failed('a@b.com', '1.1.1.1');
        }
        $this->assertSame([0, 0, 0, 0, 30, 60, 300, 300], $waits);
    }

    public function test_an_unknown_email_earns_the_same_waits_so_the_wait_gives_nothing_away(): void
    {
        $this->person();
        $pattern = fn (string $email) => collect(range(1, 7))->map(fn () => $this->signIn($email)->getStatusCode())->all();
        $known = $pattern('amina@example.com');
        Cache::flush();
        $unknown = $pattern('nobody@example.com');
        $this->assertSame($known, $unknown);
        $this->assertSame([401, 401, 401, 401, 401, 429, 429], $known);
    }

    public function test_a_quiet_hour_forgets_the_count(): void
    {
        $this->person();
        $this->wrongTimes(4);
        $this->travel(61)->minutes();
        $this->wrongTimes(4);
        $this->assertSame(401, $this->signIn('amina@example.com', 'wrong')->getStatusCode(), 'counting started over, so no wait yet');
    }

    public function test_the_same_email_typed_in_capitals_or_with_spaces_is_the_same_typist(): void
    {
        $this->person();
        foreach (['amina@example.com', 'AMINA@example.com', 'Amina@Example.com', 'amina@example.com', 'AMINA@EXAMPLE.COM'] as $typed) {
            $this->signIn($typed);
        }
        $this->assertSame(429, $this->signIn('amina@example.com', 'Right-password-1')->getStatusCode());
    }

    public function test_the_numbers_come_from_the_settings(): void
    {
        config(['security.login.free_tries' => 1, 'security.login.wait_seconds' => [7]]);
        $this->person();
        $this->wrongTimes(1);
        $this->assertSame(401, $this->signIn('amina@example.com', 'wrong')->getStatusCode());
        $this->assertSame(7, $this->signIn('amina@example.com', 'wrong')->json('retry_after'));
    }

    // ------------------------------------------------------------ a stranger can not lock the real person out

    public function test_a_stranger_hammering_a_real_persons_email_does_not_lock_or_delay_the_real_person(): void
    {
        $u = $this->person();
        $this->wrongTimes(12, 'amina@example.com', '203.0.113.9');
        $this->assertSame(429, $this->signIn('amina@example.com', 'wrong', '203.0.113.9')->getStatusCode(), 'the stranger waits');
        $this->signIn('amina@example.com', 'Right-password-1', self::IP)->assertOk();
        $this->assertNull($u->fresh()->locked_until, 'nobody is locked out by wrong passwords');
    }

    public function test_wrong_passwords_only_count_up_for_the_account_they_never_lock_it(): void
    {
        $u = $this->person();
        for ($i = 0; $i < 12; $i++) {
            $this->signIn('amina@example.com', 'wrong', "198.51.100.{$i}");   // twelve different addresses, each with a free try
        }
        $u = $u->fresh();
        $this->assertSame(12, $u->failed_login_attempts);
        $this->assertNull($u->locked_until);
        $this->assertFalse($u->isLocked());
        $this->signIn('amina@example.com', 'Right-password-1')->assertOk();
        $this->assertSame(0, $u->fresh()->failed_login_attempts, 'a good sign-in clears the count');
    }

    // ------------------------------------------------------------ the security log

    public function test_a_wait_is_logged_once_not_once_per_refused_try(): void
    {
        $this->person();
        $this->wrongTimes(5);
        for ($i = 0; $i < 4; $i++) {
            $this->assertSame(429, $this->signIn()->getStatusCode());
        }
        $rows = SecurityEvent::where('event', 'sign_in_blocked')->get();
        $this->assertCount(1, $rows);
        $this->assertSame('warning', $rows[0]->severity);
        $this->assertSame('amina@example.com', $rows[0]->email_tried);
        $this->assertSame(self::IP, $rows[0]->ip);
    }

    public function test_a_lot_of_wrong_passwords_for_one_email_from_anywhere_raises_one_alert(): void
    {
        config(['security.login.per_email_alert' => 5]);
        $this->person();
        for ($i = 0; $i < 8; $i++) {
            $this->signIn('amina@example.com', 'wrong', "198.51.100.{$i}");
        }
        $rows = SecurityEvent::where('event', 'sign_in_under_attack')->get();
        $this->assertCount(1, $rows);
        $this->assertSame('alert', $rows[0]->severity);
        $this->assertSame('amina@example.com', $rows[0]->email_tried);
        $this->assertSame(5, $rows[0]->detail['wrong_passwords_in_an_hour']);
    }

    // ------------------------------------------------------------ the temporary-password door

    private function force(string $email, string $current, string $ip = self::IP)
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/auth/force-change-password', ['email' => $email, 'current_password' => $current, 'new_password' => 'Brand-new-pass-9', 'new_password_confirmation' => 'Brand-new-pass-9']);
    }

    public function test_the_temporary_password_door_gives_one_answer_for_no_such_email_no_flag_and_a_wrong_password(): void
    {
        $this->person(['email' => 'flagged@example.com', 'force_password_change' => true]);
        $this->person(['email' => 'plain@example.com']);
        $a = $this->force('flagged@example.com', 'wrong');
        $b = $this->force('plain@example.com', 'Right-password-1');   // the right password, but there is no temporary one waiting
        $c = $this->force('nobody@example.com', 'wrong');
        $this->assertSame(401, $a->getStatusCode());
        $this->assertSame($a->getContent(), $b->getContent());
        $this->assertSame($a->getContent(), $c->getContent());
        $this->assertSame('The email or the temporary password is not right.', $a->json('message'));
    }

    public function test_the_temporary_password_door_works_for_the_right_person_and_waits_like_sign_in_otherwise(): void
    {
        $this->person(['force_password_change' => true]);
        $this->assertSame(401, $this->force('amina@example.com', 'wrong')->getStatusCode());
        $ok = $this->force('amina@example.com', 'Right-password-1');
        $ok->assertOk();
        $this->assertNotEmpty($ok->json('token'));

        $this->person(['email' => 'baraka@example.com', 'force_password_change' => true]);
        for ($i = 0; $i < 5; $i++) {
            $this->force('baraka@example.com', 'wrong');
        }
        $this->assertSame(429, $this->force('baraka@example.com', 'Right-password-1')->getStatusCode());
    }

    public function test_a_suspended_account_does_not_get_a_session_through_the_temporary_password_door(): void
    {
        $this->person(['force_password_change' => true, 'status' => 'suspended']);
        $r = $this->force('amina@example.com', 'Right-password-1');
        $r->assertStatus(403);
        $this->assertArrayNotHasKey('token', $r->json());
        $this->assertSame(0, User::first()->tokens()->count());
    }

    // ------------------------------------------------------------ job applicants

    private function applicantLogin(string $email, string $password, string $ip = self::IP)
    {
        $request = Request::create('/api/careers/auth/login', 'POST', ['email' => $email, 'password' => $password], [], [], ['REMOTE_ADDR' => $ip]);

        return app(ApplicantAuthController::class)->login($request);
    }

    private function applicant(): Applicant
    {
        if (! Schema::hasTable('applicants')) {
            Schema::create('applicants', function ($t) {
                $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->unique(); $t->string('password'); $t->string('phone')->nullable();
                $t->string('status')->default('active'); $t->boolean('must_change_password')->default(false); $t->timestamp('email_verified_at')->nullable(); $t->string('remember_token', 100)->nullable(); $t->softDeletes(); $t->timestamps();
            });
        }

        return Applicant::forceCreate(['first_name' => 'Job', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
    }

    public function test_applicants_get_the_same_answer_and_the_same_waits(): void
    {
        $this->applicant();
        $wrong = $this->applicantLogin('job@example.com', 'wrong');
        $unknown = $this->applicantLogin('nobody@example.com', 'wrong');
        $this->assertSame(401, $wrong->getStatusCode());
        $this->assertSame($wrong->getContent(), $unknown->getContent());
        for ($i = 0; $i < 4; $i++) {
            $this->applicantLogin('job@example.com', 'wrong');
        }
        $this->assertSame(429, $this->applicantLogin('job@example.com', 'Right-password-1')->getStatusCode());
        $this->assertSame(200, $this->applicantLogin('job@example.com', 'Right-password-1', '203.0.113.77')->getStatusCode(), 'another address is untouched');
    }

    public function test_an_applicants_right_password_starts_the_count_again(): void
    {
        $this->applicant();
        for ($i = 0; $i < 3; $i++) {
            $this->applicantLogin('job@example.com', 'wrong');
        }
        $this->assertSame(200, $this->applicantLogin('job@example.com', 'Right-password-1')->getStatusCode());
        for ($i = 0; $i < 4; $i++) {
            $this->applicantLogin('job@example.com', 'wrong');
        }
        $this->assertSame(200, $this->applicantLogin('job@example.com', 'Right-password-1')->getStatusCode(), 'four more wrong ones after a good sign-in are still free');
    }

    public function test_the_guard_reads_an_email_the_same_way_however_it_is_written(): void
    {
        for ($i = 0; $i < 5; $i++) {
            SignInGuard::failed($i % 2 ? '  A@B.com ' : 'a@b.com', '1.1.1.1');
        }
        $this->assertGreaterThan(0, SignInGuard::wait('a@b.com', '1.1.1.1'));
        $this->assertGreaterThan(0, SignInGuard::wait(' A@B.COM  ', '1.1.1.1'));
        $this->assertSame(0, SignInGuard::wait('a@b.com', '2.2.2.2'));
    }

    public function test_an_applicants_unknown_email_pays_for_a_real_check_too(): void
    {
        $this->applicant();
        $hasher = $this->countingHasher();
        $this->applicantLogin('nobody@example.com', 'x');
        $this->assertCount(1, $hasher->calls);
    }
}
