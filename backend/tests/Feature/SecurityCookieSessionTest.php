<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\User;
use App\Services\Security\SessionCookie;
use App\Services\Security\Sessions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Cookie;
use Tests\TestCase;

/** The sign-in code in a cookie scripts can not read, and what it takes for a change to be accepted on it. */
class SecurityCookieSessionTest extends TestCase
{
    use Concerns\CreatesSecurityTables;

    private const WEBSITE = 'https://targetisl.co.ke';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createSecurityTables();
        Schema::create('applicants', function ($t) {
            $t->id(); $t->string('first_name')->nullable(); $t->string('last_name')->nullable(); $t->string('email')->unique(); $t->string('password'); $t->string('status')->default('active');
            $t->boolean('must_change_password')->default(false); $t->timestamp('email_verified_at')->nullable(); $t->string('remember_token', 100)->nullable(); $t->softDeletes(); $t->timestamps();
        });
        Cache::flush();
        config(['security.cookie.enabled' => true, 'cors.allowed_origins' => [self::WEBSITE, 'http://localhost:5199'], 'app.frontend_url' => self::WEBSITE, 'app.url' => 'http://localhost',
            'security.rate_limits.sign_in' => ['email_ip' => [[1000, 1]], 'ip' => [[1000, 1]]]]);
    }

    private function person(array $o = []): User
    {
        return User::forceCreate($o + ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'password' => Hash::make('Right-password-1'), 'role' => 'customer']);
    }

    /** Sign in as a browser does; returns [the response, the cookie, the csrf code]. */
    private function browserSignIn(string $url = '/api/auth/login', string $email = 'amina@example.com'): array
    {
        $r = $this->postJson($url, ['email' => $email, 'password' => 'Right-password-1']);
        $r->assertOk();
        $cookie = $this->cookieOf($r);

        return [$r, $cookie, $r->json('csrf')];
    }

    private function cookieOf($response, ?string $name = null): ?Cookie
    {
        foreach ($response->headers->getCookies() as $c) {
            if ($name === null ? str_contains($c->getName(), 'tisl_') : $c->getName() === $name) {
                return $c;
            }
        }

        return null;
    }

    /** A request the way a page makes it: the cookie, and optionally the CSRF code and where it came from. */
    private function asBrowser(Cookie $cookie, ?string $csrf = null, ?string $origin = self::WEBSITE): self
    {
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->unencryptedCookies = [];   // the test client remembers cookies and headers between requests; a browser would only send what it holds
        $this->defaultHeaders = [];
        $self = $this->withCredentials()->withUnencryptedCookie($cookie->getName(), $cookie->getValue());
        $headers = array_filter(['X-CSRF-Token' => $csrf, 'Origin' => $origin]);

        return $self->withHeaders($headers);
    }

    // ------------------------------------------------------------ what sign-in hands out

    public function test_a_browser_gets_a_protected_cookie_and_a_csrf_code_but_never_the_session_code(): void
    {
        $this->person();
        [$r, $cookie, $csrf] = $this->browserSignIn();
        $this->assertArrayNotHasKey('token', $r->json());
        $this->assertNotEmpty($csrf);
        $this->assertSame('tisl_session', $cookie->getName());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertFalse($cookie->isSecure(), 'plain http: no Secure flag, no __Host- name');
        $this->assertSame('lax', $cookie->getSameSite());
        $this->assertSame('/', $cookie->getPath());
        $this->assertNull($cookie->getDomain());
        $this->assertNotNull(PersonalAccessToken::findToken($cookie->getValue()), 'it holds a real session code');
        $this->assertStringNotContainsString($cookie->getValue(), $r->getContent());
    }

    public function test_over_https_it_is_a_host_only_secure_cookie(): void
    {
        $this->person();
        $r = $this->postJson('https://api.targetisl.co.ke/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $r->assertOk();
        $c = $this->cookieOf($r);
        $this->assertSame('__Host-tisl_session', $c->getName());
        $this->assertTrue($c->isSecure());
        $this->assertTrue($c->isHttpOnly());
        $this->assertNull($c->getDomain(), 'no Domain: only this exact host');
        $this->assertSame('/', $c->getPath());
    }

    public function test_the_cookie_lives_as_long_as_the_longest_a_session_may(): void
    {
        $customer = $this->person();
        $vendor = $this->person(['role' => 'vendor', 'email' => 'vendor@example.com']);
        $days = fn (User $u) => round((SessionCookie::make('1|x', $u, Request::create('/x'))->getExpiresTime() - time()) / 86400);
        $this->assertSame(90.0, $days($customer), 'customers');
        $this->assertSame(30.0, $days($vendor), 'vendors, drivers and the like');
        $this->assertSame(90.0, round((SessionCookie::make('1|x', $customer, Request::create('/x'))->getExpiresTime() - time()) / 86400));
        $r = $this->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $this->assertSame(90.0, round(($this->cookieOf($r)->getExpiresTime() - time()) / 86400), 'and that is what sign-in hands out');
    }

    public function test_a_client_that_is_not_a_browser_can_ask_for_the_code_instead(): void
    {
        $this->person();
        $r = $this->withHeader('X-Token-In-Body', '1')->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $this->assertNotEmpty($r->json('token'));
        $this->assertArrayNotHasKey('csrf', $r->json());
        $this->assertNull($this->cookieOf($r));
    }

    public function test_with_cookie_sessions_switched_off_the_code_is_handed_over_as_before(): void
    {
        config(['security.cookie.enabled' => false]);
        $this->person();
        $r = $this->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $this->assertNotEmpty($r->json('token'));
        $this->assertNull($this->cookieOf($r));
    }

    // ------------------------------------------------------------ using it

    public function test_the_cookie_signs_a_reading_request_in_and_me_repeats_the_csrf_code(): void
    {
        $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $me = $this->asBrowser($cookie, null, null)->getJson('/api/auth/me');
        $me->assertOk();
        $this->assertSame('amina@example.com', $me->json('user.email'));
        $this->assertSame($csrf, $me->json('csrf'));
    }

    public function test_a_change_needs_the_csrf_code_and_an_allowed_origin(): void
    {
        $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $change = fn (?string $code, ?string $origin) => $this->asBrowser($cookie, $code, $origin)->postJson('/api/auth/sessions/revoke-others');
        $this->assertSame(419, $change(null, self::WEBSITE)->getStatusCode(), 'no code');
        $this->assertSame(419, $change('wrong', self::WEBSITE)->getStatusCode(), 'wrong code');
        $this->assertSame(419, $change($csrf, 'https://evil.example')->getStatusCode(), 'another website');
        $this->assertSame(419, $change($csrf, 'null')->getStatusCode(), 'a sandboxed page');
        $this->assertSame(200, $change($csrf, self::WEBSITE)->getStatusCode());
        $this->assertSame(200, $change($csrf, 'http://localhost:5199')->getStatusCode(), 'the development site');
        $this->assertSame(200, $change($csrf, null)->getStatusCode(), 'a request that does not say where it came from still needs the code');
    }

    public function test_the_website_address_is_an_allowed_origin_even_when_not_in_the_list_and_patterns_can_allow_more(): void
    {
        $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $change = fn (string $origin) => $this->asBrowser($cookie, $csrf, $origin)->postJson('/api/auth/sessions/revoke-others')->getStatusCode();
        config(['cors.allowed_origins' => []]);
        $this->assertSame(200, $change(self::WEBSITE), 'FRONTEND_URL itself');
        $this->assertSame(200, $change(self::WEBSITE.'/'), 'with a slash on the end');
        $this->assertSame(419, $change('https://shop.targetisl.co.ke'));
        config(['cors.allowed_origins_patterns' => ['#^https://[a-z]+\.targetisl\.co\.ke$#']]);
        $this->assertSame(200, $change('https://shop.targetisl.co.ke'));
        $this->assertSame(419, $change('https://shop.evil.example'));
        $this->assertSame(419, $change('https://shop.targetisl.co.ke.evil.example'));
        config(['cors.allowed_origins' => ['http://localhost:5199']]);
        $this->assertSame(200, $change('http://localhost:5199/'), 'a slash on the end of a listed origin');
    }

    public function test_a_forced_password_change_signs_in_by_cookie_too(): void
    {
        $this->person(['force_password_change' => true]);
        $r = $this->postJson('/api/auth/force-change-password', ['email' => 'amina@example.com', 'current_password' => 'Right-password-1', 'new_password' => 'purple-giraffe-lantern', 'new_password_confirmation' => 'purple-giraffe-lantern']);
        $r->assertOk();
        $this->assertArrayNotHasKey('token', $r->json());
        $this->assertNotEmpty($r->json('csrf'));
        $this->assertNotNull($this->cookieOf($r));
        $this->assertNotNull($r->json('access'));
    }

    public function test_every_kind_of_change_needs_the_code_not_only_posts(): void
    {
        \Illuminate\Support\Facades\Route::middleware(['api', 'auth:sanctum'])->group(function () {
            \Illuminate\Support\Facades\Route::put('/api/test-put', fn () => response()->json(['ok' => 1]));
            \Illuminate\Support\Facades\Route::patch('/api/test-patch', fn () => response()->json(['ok' => 1]));
        });
        $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        foreach (['putJson' => '/api/test-put', 'patchJson' => '/api/test-patch', 'deleteJson' => '/api/auth/sessions/999999', 'postJson' => '/api/auth/sessions/revoke-others'] as $method => $url) {
            $this->assertSame(419, $this->asBrowser($cookie, null)->{$method}($url)->getStatusCode(), "{$method} without the code");
            $this->assertNotSame(419, $this->asBrowser($cookie, $csrf)->{$method}($url)->getStatusCode(), "{$method} with the code");
        }
    }

    public function test_an_empty_cookie_is_no_cookie_and_the_csrf_code_is_only_given_to_a_cookie_session(): void
    {
        $u = $this->person();
        $this->assertNull(SessionCookie::read(Request::create('/api/auth/me', 'GET', [], ['tisl_session' => ''])));
        $this->assertSame('abc|def', SessionCookie::read(Request::create('/api/auth/me', 'GET', [], ['tisl_session' => 'abc|def'])));
        $token = app(Sessions::class)->issue($u, Request::create('/x'));
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->assertNull($this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/auth/me')->json('csrf'), 'a client that sends the code itself has no use for a CSRF code');
    }

    public function test_a_cookie_is_ignored_while_cookie_sessions_are_switched_off(): void
    {
        $this->person();
        [, $cookie] = $this->browserSignIn();
        config(['security.cookie.enabled' => false]);
        $this->asBrowser($cookie, null, null)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_a_header_beats_a_cookie_even_for_a_reading_request(): void
    {
        $u = $this->person();
        $token = app(Sessions::class)->issue($u, Request::create('/x'));
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $this->unencryptedCookies = [];
        $this->withCredentials()->withUnencryptedCookie('tisl_session', 'garbage|value')->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/auth/me')->assertOk();
    }

    public function test_an_applicant_signing_out_clears_their_own_cookie(): void
    {
        $app = Applicant::forceCreate(['first_name' => 'Job', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $plain = app(Sessions::class)->issue($app, Request::create('/x'), 'applicant-token');
        $request = Request::create('/api/careers/auth/logout', 'POST');
        $app->withAccessToken(PersonalAccessToken::findToken($plain));
        $request->setUserResolver(fn () => $app);
        $r = app(\App\Http\Controllers\Api\Careers\ApplicantAuthController::class)->logout($request);
        $cookie = $r->headers->getCookies()[0];
        $this->assertSame('tisl_applicant', $cookie->getName());
        $this->assertLessThan(time(), $cookie->getExpiresTime());
        $this->assertSame(0, $app->tokens()->count());
    }

    public function test_the_csrf_code_of_a_request_is_known_only_when_it_came_in_on_the_cookie(): void
    {
        $careers = Request::create('/api/careers/auth/me', 'GET', [], ['tisl_applicant' => '5|abc']);
        $this->assertNull(SessionCookie::csrfOf($careers), 'not marked as signed in by the cookie');
        $careers->attributes->set('session_via_cookie', true);
        $this->assertSame(SessionCookie::csrf('5|abc'), SessionCookie::csrfOf($careers));
        $user = Request::create('/api/auth/me', 'GET', [], ['tisl_session' => '5|abc']);
        $user->attributes->set('session_via_cookie', true);
        $this->assertSame(SessionCookie::csrf('5|abc'), SessionCookie::csrfOf($user));
    }

    public function test_the_refusal_says_the_session_needs_refreshing_so_the_page_can_fetch_a_new_code(): void
    {
        $this->person();
        [, $cookie] = $this->browserSignIn();
        $r = $this->asBrowser($cookie, null)->postJson('/api/auth/sessions/revoke-others');
        $r->assertStatus(419);
        $this->assertTrue($r->json('csrf'));
        $this->assertStringContainsString('refreshing', $r->json('message'));
    }

    public function test_reading_needs_no_code(): void
    {
        $this->person();
        [, $cookie] = $this->browserSignIn();
        $this->asBrowser($cookie, null, 'https://evil.example')->getJson('/api/auth/sessions')->assertOk();
    }

    public function test_one_sessions_code_does_not_work_for_another_session(): void
    {
        $this->person();
        $this->person(['email' => 'baraka@example.com', 'name' => 'Baraka']);
        [, $a, $csrfA] = $this->browserSignIn();
        [, $b, $csrfB] = $this->browserSignIn('/api/auth/login', 'baraka@example.com');
        $this->assertNotSame($csrfA, $csrfB);
        $this->assertSame(419, $this->asBrowser($b, $csrfA)->postJson('/api/auth/sessions/revoke-others')->getStatusCode());
        $this->assertSame(200, $this->asBrowser($b, $csrfB)->postJson('/api/auth/sessions/revoke-others')->getStatusCode());
    }

    public function test_a_request_with_an_authorization_header_is_left_alone_even_beside_a_cookie(): void
    {
        $u = $this->person();
        $token = app(Sessions::class)->issue($u, Request::create('/x'));
        $this->app['auth']->forgetGuards();
        $this->flushSession();
        $r = $this->withCredentials()->withUnencryptedCookie('tisl_session', 'garbage')->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/sessions/revoke-others');
        $r->assertOk();
    }

    public function test_a_stale_cookie_does_not_stand_in_the_way_of_signing_in_again(): void
    {
        $this->person();
        $this->app['auth']->forgetGuards();
        $r = $this->withCredentials()->withUnencryptedCookie('tisl_session', 'stale|code')->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']);
        $r->assertOk();
        $this->assertNotNull($this->cookieOf($r));
    }

    public function test_an_unknown_visitor_gets_the_plain_not_signed_in_answer_not_a_refresh_request(): void
    {
        $this->postJson('/api/auth/sessions/revoke-others')->assertStatus(401);
        $this->unencryptedCookies = [];
        $this->withCredentials()->withUnencryptedCookie('tisl_session', 'stale|code')->postJson('/api/auth/sessions/revoke-others', [], ['X-CSRF-Token' => 'x'])->assertStatus(419);
    }

    public function test_a_session_that_has_ended_does_not_sign_anyone_in_even_with_the_right_code(): void
    {
        $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $this->travel(91)->days();
        $this->asBrowser($cookie, $csrf)->getJson('/api/auth/me')->assertStatus(401);
    }

    // ------------------------------------------------------------ the host-only name

    public function test_over_https_only_the_host_only_cookie_counts_a_cookie_planted_by_a_sibling_site_does_not(): void
    {
        $u = $this->person();
        $token = app(Sessions::class)->issue($u, Request::create('/x'));
        $this->app['auth']->forgetGuards();
        $planted = $this->withCredentials()->withUnencryptedCookie('tisl_session', $token)->getJson('https://api.targetisl.co.ke/api/auth/me');
        $planted->assertStatus(401);
        $this->app['auth']->forgetGuards();
        $real = $this->withCredentials()->withUnencryptedCookie('__Host-tisl_session', $token)->getJson('https://api.targetisl.co.ke/api/auth/me');
        $real->assertOk();
    }

    public function test_the_secure_flag_can_be_forced_for_a_server_behind_a_proxy_that_is_not_trusted(): void
    {
        config(['security.cookie.secure' => true]);
        $this->person();
        $c = $this->cookieOf($this->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']));
        $this->assertSame(['__Host-tisl_session', true], [$c->getName(), $c->isSecure()]);
        config(['security.cookie.secure' => null, 'app.url' => 'https://api.targetisl.co.ke']);
        $c = $this->cookieOf($this->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']));
        $this->assertTrue($c->isSecure(), 'an https APP_URL is enough');
    }

    public function test_the_same_site_setting_is_used(): void
    {
        config(['security.cookie.same_site' => 'strict']);
        $this->person();
        $this->assertSame('strict', $this->cookieOf($this->postJson('/api/auth/login', ['email' => 'amina@example.com', 'password' => 'Right-password-1']))->getSameSite());
    }

    // ------------------------------------------------------------ signing out

    public function test_signing_out_ends_the_session_and_clears_the_cookie(): void
    {
        $u = $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $r = $this->asBrowser($cookie, $csrf)->postJson('/api/auth/logout');
        $r->assertOk();
        $gone = $this->cookieOf($r, 'tisl_session');
        $this->assertSame('', $gone->getValue());
        $this->assertLessThan(time(), $gone->getExpiresTime());
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_sign_out_everywhere_clears_the_cookie_and_ending_another_device_does_not(): void
    {
        $u = $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $other = app(Sessions::class)->issue($u, Request::create('/x'));
        $otherId = (int) explode('|', $other)[0];
        $ended = $this->asBrowser($cookie, $csrf)->deleteJson("/api/auth/sessions/{$otherId}");
        $ended->assertOk();
        $this->assertNull($this->cookieOf($ended), 'another device: this browser stays signed in');
        $all = $this->asBrowser($cookie, $csrf)->postJson('/api/auth/sessions/revoke-all');
        $all->assertOk();
        $this->assertLessThan(time(), $this->cookieOf($all, 'tisl_session')->getExpiresTime());
        $this->assertSame(0, $u->tokens()->count());
    }

    public function test_ending_this_very_session_from_the_list_clears_the_cookie(): void
    {
        $u = $this->person();
        [, $cookie, $csrf] = $this->browserSignIn();
        $id = (int) explode('|', $cookie->getValue())[0];
        $r = $this->asBrowser($cookie, $csrf)->deleteJson("/api/auth/sessions/{$id}");
        $r->assertOk();
        $this->assertLessThan(time(), $this->cookieOf($r, 'tisl_session')->getExpiresTime());
    }

    // ------------------------------------------------------------ job applicants

    public function test_an_applicant_has_a_cookie_of_their_own_and_the_two_never_mix(): void
    {
        Applicant::forceCreate(['first_name' => 'Job', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $u = $this->person();
        $c = app(Sessions::class)->issue($u, Request::create('/x'));
        $applicantRequest = new class {
        };
        $a = SessionCookie::make('1|x', Applicant::first(), Request::create('/x'));
        $this->assertSame('tisl_applicant', $a->getName());
        $this->assertSame('tisl_session', SessionCookie::make($c, $u, Request::create('/x'))->getName());
        $this->assertSame(SessionCookie::APPLICANT, SessionCookie::kindFor(Request::create('/api/careers/auth/me')));
        $this->assertSame(SessionCookie::USER, SessionCookie::kindFor(Request::create('/api/auth/me')));
        $this->assertSame(SessionCookie::USER, SessionCookie::kindFor(Request::create('/api/careersomething')));
        // a user's cookie does not sign an applicant request in, and the reverse
        $this->app['auth']->forgetGuards();
        $this->withCredentials()->withUnencryptedCookie('tisl_session', $c)->getJson('/api/careers/auth/me')->assertStatus(401);
        $this->app['auth']->forgetGuards();
        $this->unencryptedCookies = [];
        $this->withCredentials()->withUnencryptedCookie('tisl_applicant', $c)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_an_applicant_signs_in_and_out_by_cookie(): void
    {
        config(['security.cookie.enabled' => true]);
        $app = Applicant::forceCreate(['first_name' => 'Job', 'last_name' => 'Seeker', 'email' => 'job@example.com', 'password' => Hash::make('Right-password-1')]);
        $r = app(\App\Http\Controllers\Api\Careers\ApplicantAuthController::class)->login(Request::create('/api/careers/auth/login', 'POST', ['email' => 'job@example.com', 'password' => 'Right-password-1']));
        $body = $r->getData(true);
        $this->assertArrayNotHasKey('token', $body);
        $this->assertNotEmpty($body['csrf']);
        $cookie = $r->headers->getCookies()[0];
        $this->assertSame(['tisl_applicant', true], [$cookie->getName(), $cookie->isHttpOnly()]);
        $this->assertSame(1, $app->tokens()->count());
    }

    // ------------------------------------------------------------ the Google sign-in redirect

    public function test_a_redirect_can_carry_the_cookie_so_no_code_appears_in_an_address(): void
    {
        $u = $this->person();
        $token = app(Sessions::class)->issue($u, Request::create('/x'));
        $redirect = SessionCookie::attach(redirect()->away(self::WEBSITE.'/auth/callback?ok=1'), Request::create('/x'), $token, $u);
        $this->assertStringNotContainsString($token, $redirect->getTargetUrl());
        $this->assertSame($token, $redirect->headers->getCookies()[0]->getValue());
    }

    // ------------------------------------------------------------ what the csrf code is made of

    public function test_the_csrf_code_depends_on_the_session_and_the_servers_key(): void
    {
        $a = SessionCookie::csrf('1|secretA');
        $this->assertSame($a, SessionCookie::csrf('1|secretA'));
        $this->assertNotSame($a, SessionCookie::csrf('1|secretB'));
        config(['app.key' => 'base64:'.base64_encode(str_repeat('q', 32))]);
        $this->assertNotSame($a, SessionCookie::csrf('1|secretA'), 'a different server key makes a different code');
    }
}
