<?php

namespace App\Http\Middleware;

use App\Services\Security\SessionCookie;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Turns the session cookie into the sign-in the rest of the app already understands (an `Authorization: Bearer` header), once the request has proved it was meant:
 *
 *  - a change (POST, PUT, PATCH, DELETE) must carry `X-CSRF-Token` equal to the session's CSRF code, and, if the browser says where it came from, an `Origin` we allow;
 *  - otherwise the cookie is ignored and the request is treated as not signed in (a page on another site can make a browser send the cookie, but can not know the code);
 *  - a request that already has an Authorization header is left exactly as it is.
 */
class CookieSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! SessionCookie::enabled() || $request->headers->has('Authorization')) {
            return $next($request);
        }
        $code = SessionCookie::read($request);
        if ($code === null) {
            return $next($request);
        }
        if (! $request->isMethodSafe()) {
            $given = (string) $request->header('X-CSRF-Token');
            if (! hash_equals(SessionCookie::csrf($code), $given) || ! $this->originAllowed($request)) {
                $request->attributes->set('csrf_failed', true);

                return $next($request);
            }
        }
        $request->headers->set('Authorization', 'Bearer '.$code);
        $request->attributes->set('session_via_cookie', true);

        return $next($request);
    }

    /** A browser says where a request came from; if it says, it must be one of the websites allowed to call the API. Not saying is fine (the CSRF code still has to match). */
    private function originAllowed(Request $request): bool
    {
        $origin = $request->headers->get('Origin');
        if ($origin === null || $origin === '') {
            return true;
        }
        $allowed = array_map(fn ($o) => rtrim((string) $o, '/'), (array) config('cors.allowed_origins', []));
        if (in_array(rtrim($origin, '/'), $allowed, true) || rtrim($origin, '/') === rtrim((string) config('app.frontend_url'), '/')) {
            return true;
        }
        foreach ((array) config('cors.allowed_origins_patterns', []) as $pattern) {
            if (@preg_match($pattern, $origin) === 1) {
                return true;
            }
        }

        return false;
    }
}
