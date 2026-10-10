<?php

namespace Tests\Feature;

use App\Models\Security\SecurityEvent;
use App\Models\User;
use App\Services\Security\RateLimits;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** How fast anyone may knock on the sign-in doors: counted per email AND address, and per address; never by email alone. */
class SecurityRateLimitTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Cache::flush();
        config(['security.login.free_tries' => 10000]);   // these tests are about the speed limits; the wait after wrong passwords has its own tests
    }

    /** A knock on the sign-in door from one address with one email. */
    private function knock(string $email = 'someone@example.com', string $ip = '41.80.1.1', string $path = '/api/auth/login', array $extra = [])
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson($path, ['email' => $email, 'password' => 'wrong'] + $extra);
    }

    private function knockTimes(int $n, string $email = 'someone@example.com', string $ip = '41.80.1.1', string $path = '/api/auth/login'): array
    {
        $codes = [];
        for ($i = 0; $i < $n; $i++) {
            $codes[] = $this->knock($email, $ip, $path)->getStatusCode();
        }

        return $codes;
    }

    public function test_the_eleventh_wrong_try_in_a_minute_for_one_email_from_one_address_is_refused_with_a_wait(): void
    {
        $codes = $this->knockTimes(10);
        $this->assertNotContains(429, $codes, 'ten tries are allowed');
        $r = $this->knock();
        $r->assertStatus(429);
        $this->assertGreaterThan(0, $r->json('retry_after'));
        $this->assertLessThanOrEqual(60, $r->json('retry_after'));
        $this->assertStringContainsString('Too many attempts. Please wait', $r->json('message'));
        $this->assertNotEmpty($r->headers->get('Retry-After'));
    }

    public function test_a_stranger_hammering_a_real_persons_email_does_not_block_the_real_person(): void
    {
        $this->knockTimes(11, 'amina@example.com', '203.0.113.9');   // the stranger, from their own address
        $this->assertSame(429, $this->knock('amina@example.com', '203.0.113.9')->getStatusCode());
        $this->assertNotSame(429, $this->knock('amina@example.com', '41.80.1.1')->getStatusCode(), 'the real person, from their own address, is untouched');
    }

    public function test_one_address_cycling_through_emails_is_stopped_by_the_address_limit(): void
    {
        $codes = [];
        for ($i = 0; $i < 31; $i++) {
            $codes[] = $this->knock("user{$i}@example.com", '198.51.100.7')->getStatusCode();
        }
        $this->assertNotContains(429, array_slice($codes, 0, 30), 'thirty different emails in a minute are allowed');
        $this->assertSame(429, $codes[30], 'the thirty-first is not');
        $this->assertNotSame(429, $this->knock('user0@example.com', '41.80.1.1')->getStatusCode(), 'other addresses are untouched');
    }

    public function test_the_wait_is_over_when_the_minute_is_over(): void
    {
        $this->knockTimes(11);
        $this->assertSame(429, $this->knock()->getStatusCode());
        $this->travel(61)->seconds();
        $this->assertNotSame(429, $this->knock()->getStatusCode());
    }

    public function test_a_slow_burn_is_caught_by_the_hourly_count(): void
    {
        // 30 tries an hour for one email and address, even when each minute stays under its own limit
        for ($i = 0; $i < 30; $i++) {
            $this->assertNotSame(429, $this->knock()->getStatusCode(), "try {$i}");
            $this->travel(7)->seconds();
        }
        $this->assertSame(429, $this->knock()->getStatusCode());
    }

    public function test_the_email_is_counted_however_it_is_typed(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->knock($i % 2 ? '  Someone@Example.COM ' : 'someone@example.com');
        }
        $this->assertSame(429, $this->knock('SOMEONE@example.com')->getStatusCode());
    }

    public function test_the_email_is_read_the_same_way_whatever_the_request_looked_like(): void
    {
        $email = fn ($v) => RateLimits::email(Request::create('/x', 'POST', ['email' => $v]));
        $this->assertSame('a@b.com', $email('  A@B.com '));
        $this->assertSame('', $email(['a@b.com']));
        $this->assertSame('', $email(null));
        $this->assertSame('', RateLimits::email(Request::create('/x', 'POST')));
    }

    public function test_an_email_that_is_not_text_is_not_a_way_around_the_limit(): void
    {
        $codes = [];
        for ($i = 0; $i < 31; $i++) {
            $codes[] = $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.8'])->postJson('/api/auth/login', ['email' => ['a', 'b'], 'password' => 'x'])->getStatusCode();
        }
        $this->assertSame(429, $codes[30]);
        $this->assertNotContains(500, $codes);
    }

    public function test_a_forged_forwarding_header_is_not_a_way_around_the_limit(): void
    {
        $codes = [];
        for ($i = 0; $i < 12; $i++) {
            $codes[] = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.50'])->withHeader('X-Forwarded-For', "10.9.8.{$i}")->postJson('/api/auth/login', ['email' => 'someone@example.com', 'password' => 'x'])->getStatusCode();
        }
        $this->assertSame(429, $codes[10], 'the address that connected is the one counted');
    }

    public function test_forgot_password_allows_three_in_fifteen_minutes(): void
    {
        $codes = $this->knockTimes(4, 'someone@example.com', '41.80.1.1', '/api/auth/forgot-password');
        $this->assertNotContains(429, array_slice($codes, 0, 3));
        $this->assertSame(429, $codes[3]);
    }

    public function test_sign_up_allows_five_an_hour_for_one_email_and_address(): void
    {
        $codes = $this->knockTimes(6, 'new@example.com', '41.80.1.1', '/api/auth/register');
        $this->assertNotContains(429, array_slice($codes, 0, 5));
        $this->assertSame(429, $codes[5]);
    }

    public function test_the_reset_and_force_change_doors_allow_ten_in_fifteen_minutes(): void
    {
        foreach (['/api/auth/reset-password', '/api/auth/force-change-password'] as $path) {
            Cache::flush();
            $codes = $this->knockTimes(11, 'someone@example.com', '41.80.1.1', $path);
            $this->assertNotContains(429, array_slice($codes, 0, 10), $path);
            $this->assertSame(429, $codes[10], $path);
        }
    }

    public function test_every_door_that_takes_a_password_a_code_or_an_email_carries_a_limit(): void
    {
        $limit = fn (string $method, string $uri) => collect(Route::getRoutes()->getRoutes())->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods()))?->gatherMiddleware() ?? [];
        $expect = [
            ['POST', 'api/auth/login', 'throttle:sign-in'], ['POST', 'api/auth/register', 'throttle:sign-up'], ['POST', 'api/auth/forgot-password', 'throttle:password-forgot'],
            ['POST', 'api/auth/reset-password', 'throttle:password-reset'], ['POST', 'api/auth/force-change-password', 'throttle:password-force'],
            ['POST', 'api/careers/auth/login', 'throttle:sign-in'], ['POST', 'api/careers/auth/register', 'throttle:sign-up'], ['POST', 'api/careers/forgot-password', 'throttle:password-forgot'],
            ['POST', 'api/careers/reset-password', 'throttle:password-reset'], ['POST', 'api/dev/auth', 'throttle:sign-in'],
            ['POST', 'api/auth/change-password', 'throttle:guess'], ['POST', 'api/customer/phone/verify', 'throttle:guess'], ['POST', 'api/customer/phone/send-otp', 'throttle:5,15'],
            ['POST', 'api/careers/portal/change-password', 'throttle:guess'], ['POST', 'api/careers/portal/password', 'throttle:guess'],
        ];
        foreach ($expect as [$method, $uri, $mw]) {
            $this->assertContains($mw, $limit($method, $uri), "{$method} {$uri} should carry {$mw}");
        }
    }

    public function test_someone_signed_in_cannot_guess_their_current_password_at_speed(): void
    {
        $u = User::forceCreate(['name' => 'Amina', 'email' => 'amina@example.com', 'password' => Hash::make('Old-password-1'), 'role' => 'customer']);
        $other = User::forceCreate(['name' => 'Baraka', 'email' => 'baraka@example.com', 'password' => Hash::make('Old-password-1'), 'role' => 'customer']);
        $token = app(Sessions::class)->issue($u, Request::create('/x', 'POST'));
        $otherToken = app(Sessions::class)->issue($other, Request::create('/x', 'POST'));
        $try = function (string $token) {
            $this->app['auth']->forgetGuards();
            $this->flushSession();

            return $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/auth/change-password', ['current_password' => 'wrong', 'new_password' => 'Brand-new-pass-9', 'new_password_confirmation' => 'Brand-new-pass-9'])->getStatusCode();
        };
        $codes = [];
        for ($i = 0; $i < 9; $i++) {
            $codes[] = $try($token);
        }
        $this->assertNotContains(429, array_slice($codes, 0, 8), 'eight tries are allowed');
        $this->assertSame(429, $codes[8]);
        $this->assertNotSame(429, $try($otherToken), 'another person is counted on their own');
    }

    public function test_a_refusal_is_written_to_the_security_log_once_not_once_per_refused_request(): void
    {
        $this->knockTimes(10);
        for ($i = 0; $i < 6; $i++) {
            $this->assertSame(429, $this->knock()->getStatusCode());
        }
        $rows = SecurityEvent::where('event', 'rate_limited')->get();
        $this->assertCount(1, $rows->where('detail.bucket', 'email_ip:1'));
        $row = $rows->firstWhere('detail.bucket', 'email_ip:1');
        $this->assertSame('warning', $row->severity);
        $this->assertSame('someone@example.com', $row->email_tried);
        $this->assertSame('41.80.1.1', $row->ip);
        $this->assertSame('sign-in', $row->detail['door']);
    }

    public function test_the_wait_is_put_in_plain_words(): void
    {
        $this->assertSame('1 second', RateLimits::waitWords(1));
        $this->assertSame('45 seconds', RateLimits::waitWords(45));
        $this->assertSame('about 2 minutes', RateLimits::waitWords(100));
        $this->assertSame('about 15 minutes', RateLimits::waitWords(900));
        $this->assertSame('about 2 hours', RateLimits::waitWords(7200));
    }

    public function test_the_numbers_come_from_the_settings(): void
    {
        config(['security.rate_limits.sign_in.email_ip' => [[2, 1]]]);
        $codes = $this->knockTimes(3);
        $this->assertNotContains(429, array_slice($codes, 0, 2));
        $this->assertSame(429, $codes[2]);
    }
}
