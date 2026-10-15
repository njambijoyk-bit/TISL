<?php

namespace App\Services\Security;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * The sign-in code kept in a cookie scripts can not read (`HttpOnly`), instead of in the page's storage where any script that ever runs on the page could copy it.
 *
 *  - The cookie holds the same opaque session code as before; sessions, expiry and ending them (Phase 0) work exactly as they did.
 *  - Over https it is a `__Host-` cookie: only this exact host sets and sends it (a sibling subdomain can not plant one).
 *  - A cookie is sent by the browser on its own, so every change must also carry a CSRF code the page learned at sign-in and an allowed `Origin` (see Http/Middleware/CookieSession).
 *  - Clients that are not a browser (a script, the test suite) ask for the code in the answer with `X-Token-In-Body: 1` and send it as a header, as before.
 */
final class SessionCookie
{
    public const USER = 'user';
    public const APPLICANT = 'applicant';

    public static function enabled(): bool
    {
        return (bool) config('security.cookie.enabled', true);
    }

    /** Which cookie a request is about: job applicants have their own, so a customer and an applicant can both be signed in in one browser. */
    public static function kindFor(Request $request): string
    {
        return $request->is('api/careers', 'api/careers/*') ? self::APPLICANT : self::USER;
    }

    public static function kindOf(Model $tokenable): string
    {
        return $tokenable instanceof \App\Models\Applicant ? self::APPLICANT : self::USER;
    }

    public static function secure(Request $request): bool
    {
        $forced = config('security.cookie.secure');

        return $forced === null ? ($request->isSecure() || str_starts_with((string) config('app.url'), 'https://')) : (bool) $forced;
    }

    public static function name(string $kind, bool $secure, string $site = ''): string
    {
        return ($secure ? '__Host-' : '').(string) config("security.cookie.names.{$kind}", $kind === self::APPLICANT ? 'tisl_applicant' : 'tisl_session').($site !== '' ? '_'.$site : '');
    }

    /**
     * A short code for the website a request comes from (its `Origin`), or '' when each website is not to have its own sign-in (the default) or the request does not say where it is from.
     * A browser keeps cookies per host, not per port, so several websites on one host (the development servers on localhost:5173, :5174 ...) would otherwise share one sign-in and the last person
     * to sign in would replace the others. With SECURITY_COOKIE_PER_SITE the cookie's name carries this code, so each website keeps its own. With one website per domain it changes nothing.
     */
    public static function site(Request $request): string
    {
        return self::siteOf($request->headers->get('Origin'));
    }

    /** The same code for a web address (an Origin, or where a redirect goes). */
    public static function siteOf(?string $address): string
    {
        if (! config('security.cookie.per_site', false)) {
            return '';
        }
        $p = parse_url(trim((string) $address));
        if (! is_array($p) || empty($p['scheme']) || empty($p['host'])) {
            return '';
        }
        $scheme = strtolower((string) $p['scheme']);
        $port = isset($p['port']) && ! (($scheme === 'http' && (int) $p['port'] === 80) || ($scheme === 'https' && (int) $p['port'] === 443)) ? ':'.(int) $p['port'] : '';

        return substr(sha1($scheme.'://'.strtolower((string) $p['host']).$port), 0, 8);
    }

    /** The session code the browser sent, if any. */
    public static function read(Request $request): ?string
    {
        $value = $request->cookies->get(self::name(self::kindFor($request), self::secure($request), self::site($request)));

        return is_string($value) && $value !== '' ? $value : null;
    }

    /** @param ?string $address where the person is being sent when the request itself does not say which website it is for (a redirect after Google sign-in) */
    public static function make(string $plainToken, Model $tokenable, Request $request, ?string $address = null): Cookie
    {
        $kind = self::kindOf($tokenable);
        $secure = self::secure($request);
        $site = $address !== null ? self::siteOf($address) : self::site($request);

        return Cookie::create(self::name($kind, $secure, $site), $plainToken, now()->addDays(SessionPolicy::maxDays($tokenable))->getTimestamp(), '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
    }

    public static function forget(Request $request, ?string $kind = null): Cookie
    {
        $secure = self::secure($request);

        return Cookie::create(self::name($kind ?? self::kindFor($request), $secure, self::site($request)), '', 1, '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
    }

    /** The CSRF code for a session: it can only be worked out by someone who holds the session code (or the server). */
    public static function csrf(string $plainToken): string
    {
        return hash_hmac('sha256', $plainToken, (string) config('app.key'));
    }

    /** The CSRF code of the session this request came in on (null for a request that did not come in on a cookie). */
    public static function csrfOf(Request $request): ?string
    {
        return $request->attributes->get('session_via_cookie') ? self::csrf((string) self::read($request)) : null;
    }

    /** Does the browser want the code in the answer (a client that is not a browser), or is the cookie not in use at all? */
    public static function codeInBody(Request $request): bool
    {
        return ! self::enabled() || (bool) $request->header('X-Token-In-Body');
    }

    /**
     * Finish a sign-in answer. A browser gets the cookie and the CSRF code and never the session code itself; a client that asked for the code gets it.
     *
     * @param array<string, mixed> $body
     */
    public static function respond(Request $request, array $body, int $status, string $plainToken, Model $tokenable): JsonResponse
    {
        if (self::codeInBody($request)) {
            return response()->json($body + ['token' => $plainToken], $status);
        }
        $response = response()->json($body + ['csrf' => self::csrf($plainToken)], $status);
        $response->headers->setCookie(self::make($plainToken, $tokenable, $request));
        self::noteDevice($response, $request, $tokenable);

        return $response;
    }

    /** Remember in this browser that it has signed in as this person (see KnownDevice): it is what lets the sign-in page show them their seal phrase. */
    private static function noteDevice(\Symfony\Component\HttpFoundation\Response $response, Request $request, Model $tokenable): void
    {
        if ($tokenable instanceof \App\Models\User) {
            $response->headers->setCookie(KnownDevice::remember($request, $tokenable));
        }
    }

    /** A sign-in answer that sends the person on to a page (Google sign-in): the cookie rides on the redirect. */
    public static function attach(\Symfony\Component\HttpFoundation\Response $response, Request $request, string $plainToken, Model $tokenable): \Symfony\Component\HttpFoundation\Response
    {
        $response->headers->setCookie(self::make($plainToken, $tokenable, $request, $response instanceof \Illuminate\Http\RedirectResponse ? $response->getTargetUrl() : null));
        self::noteDevice($response, $request, $tokenable);

        return $response;
    }
}
