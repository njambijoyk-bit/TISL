<?php

namespace App\Http\Middleware;

use App\Services\Security\Sessions;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/** After a signed-in request has been answered, push the session's end forward: a session ends when it has been idle too long, not while it is in use. */
class SlideSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        try {
            $token = $request->user()?->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                app(Sessions::class)->slide($token);
            }
        } catch (\Throwable $e) {
            report($e);   // never let bookkeeping spoil an answer that was already given
        }

        return $response;
    }
}
