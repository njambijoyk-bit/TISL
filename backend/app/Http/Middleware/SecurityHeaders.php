<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Safe-by-default headers on everything the server sends (config/security.php → headers). A header a controller has already set is left alone.
 *
 *  - every response: no content sniffing, no referrer, no camera/microphone/location for this origin
 *  - JSON (the API): may not be framed or load anything; sign-in and security answers are never stored by a browser or a cache
 *  - over HTTPS: tell browsers to keep using HTTPS (HSTS)
 * Files, images and pages the API hands out (a PDF, a ticket, a label) are not given the framing and loading limits, so they still open where they are shown.
 */
class SecurityHeaders
{
    /** Answers that carry a token, a person or a security decision: never kept. */
    private const NEVER_STORED = ['api/auth/*', 'api/admin/security/*'];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if (! config('security.headers.enabled', true)) {
            return $response;
        }
        $h = $response->headers;
        $set = function (string $name, string $value) use ($h) {
            if (! $h->has($name)) {
                $h->set($name, $value);
            }
        };

        $set('X-Content-Type-Options', 'nosniff');
        $set('Referrer-Policy', 'no-referrer');
        $set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        if (str_contains((string) $h->get('Content-Type'), 'json')) {
            $set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
            $set('X-Frame-Options', 'DENY');
        }
        if ($request->is(...self::NEVER_STORED)) {
            $h->set('Cache-Control', 'no-store, private');
        }
        if ($request->isSecure() && config('security.headers.hsts', true)) {
            $set('Strict-Transport-Security', 'max-age='.(int) config('security.headers.hsts_seconds', 31536000).'; includeSubDomains');
        }

        return $response;
    }
}
