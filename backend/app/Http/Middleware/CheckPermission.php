<?php

namespace App\Http\Middleware;

use App\Services\Access\Authorizer;
use App\Services\Access\Decision;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route guard on a permission:  Route::middleware('permission:books.view')  or any of several: 'permission:menus.view,menus.manage'.
 * If the request names a branch (location_id or location in the query, body or route) it is checked against the person's branch scope
 * too, in the mode set in config/access.php (off, log or on).
 */
class CheckPermission
{
    public function __construct(private Authorizer $access) {}

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $ctx = ['ip' => $request->ip()];
        $loc = $request->route('location_id') ?? $request->input('location_id') ?? $request->query('location');
        if (is_numeric($loc)) {
            $ctx['location_id'] = (int) $loc;
        }

        $last = Decision::deny('no_permission');
        foreach ($permissions as $permission) {
            $last = $this->access->can($user, $permission, $ctx);
            if ($last->allowed) {
                return $next($request);
            }
        }

        return response()->json(['message' => $last->message(), 'reason' => $last->reason], 403);
    }
}
