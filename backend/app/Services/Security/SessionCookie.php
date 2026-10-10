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

    public static function name(string $kind, bool $secure): string
    {
        return ($secure ? '__Host-' : '').(string) config("security.cookie.names.{$kind}", $kind === self::APPLICANT ? 'tisl_applicant' : 'tisl_session');
    }

    /** The session code the browser sent, if any. */
    public static function read(Request $request): ?string
    {
        $value = $request->cookies->get(self::name(self::kindFor($request), self::secure($request)));

        return is_string($value) && $value !== '' ? $value : null;
    }

    public static function make(string $plainToken, Model $tokenable, Request $request): Cookie
    {
        $kind = self::kindOf($tokenable);
        $secure = self::secure($request);

        return Cookie::create(self::name($kind, $secure), $plainToken, now()->addDays(SessionPolicy::maxDays($tokenable))->getTimestamp(), '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
    }

    public static function forget(Request $request, ?string $kind = null): Cookie
    {
        $secure = self::secure($request);

        return Cookie::create(self::name($kind ?? self::kindFor($request), $secure), '', 1, '/', null, $secure, true, false, (string) config('security.cookie.same_site', 'lax'));
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

        return $response;
    }

    /** A sign-in answer that sends the person on to a page (Google sign-in): the cookie rides on the redirect. */
    public static function attach(\Symfony\Component\HttpFoundation\Response $response, Request $request, string $plainToken, Model $tokenable): \Symfony\Component\HttpFoundation\Response
    {
        $response->headers->setCookie(self::make($plainToken, $tokenable, $request));

        return $response;
    }
}
