<?php

namespace App\Http\Middleware;

use App\Services\Projects\ProjectSecurity;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * On every Projects route: is this person's access to Projects paused, or cooling off, by Projects security (docs/PROJECTS_STAGE2_SPEC.md,
 * build 2.5)? Paused: nothing in Projects answers until someone releases them. Cooling off: they can read, not change.
 * The words a screen needs (`/names`) are always answered so the page can still say what happened.
 */
class ProjectsHold
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $hold = $user && ! $request->is('*/projects/names') ? app(ProjectSecurity::class)->holdOn((int) $user->id) : null;
        if ($hold && $hold['kind'] === 'pause') {
            return response()->json(['message' => 'Your access to Projects is paused after unusual activity. Someone who looks after Projects security can release it. The rest of TISL still works.', 'paused' => true], 403);
        }
        if ($hold && ! $request->isMethodSafe()) {
            $at = \Carbon\Carbon::parse($hold['until'])->format('H:i');

            return response()->json(['message' => "After unusual activity you can read but not change anything in Projects until {$at}.", 'cooling_off' => ['until' => $hold['until']]], 429);
        }

        return $next($request);
    }
}
