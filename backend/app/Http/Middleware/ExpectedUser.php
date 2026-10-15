<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * The website says who it believes is signed in (`X-Expected-User`). The sign-in is a cookie, shared by every window of the same browser, so another account may have signed in from another window since:
 * the menus in this window are then the old account's, while the request would be made as the new one. Such a request is stopped before it does anything, with 409, and the website refreshes itself.
 * A request that does not say (a script, the test suite, a page before sign-in) is left alone.
 */
class ExpectedUser
{
    /** Doors a person goes through to sign in or to be told who they are: the website may be wrong about who is signed in when it uses them. */
    private const OPEN = ['api/auth/me', 'api/auth/login', 'api/auth/register', 'api/auth/forgot-password', 'api/auth/reset-password', 'api/auth/force-change-password', 'api/auth/seal',
        'api/auth/passkeys/options', 'api/auth/passkeys/login', 'api/auth/secure-account', 'api/auth/email-link', 'api/auth/email-link/*'];

    public function handle(Request $request, Closure $next): Response
    {
        $expected = trim((string) $request->header('X-Expected-User', ''));
        if ($expected === '' || $request->is(...self::OPEN)) {
            return $next($request);
        }
        $user = Auth::guard('sanctum')->user();   // the route's own sign-in check comes later: this only asks who it is
        if ($user instanceof User && (string) $user->getKey() !== $expected) {
            return response()->json(['message' => 'Another account was signed in from another window. This page needs refreshing.', 'code' => 'identity_changed'], 409);
        }

        return $next($request);
    }
}
