<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard on the kind of account: Route::middleware('account:customer'). Customers, vendors and applicants are portal accounts that only ever
 * see their own things; this keeps a route for one kind. (What staff may do is a permission, see CheckPermission.)
 */
class CheckAccount
{
    public function handle(Request $request, Closure $next, string ...$kinds): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }
        if (! in_array($user->portalType(), $kinds, true)) {
            return response()->json(['message' => 'Forbidden. You do not have permission to access this resource.'], 403);
        }

        return $next($request);
    }
}
