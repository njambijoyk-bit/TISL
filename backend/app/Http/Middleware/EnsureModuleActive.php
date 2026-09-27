<?php

namespace App\Http\Middleware;

use App\Services\Licensing\LicenseManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate a route group behind an active module.
 *
 *   Route::middleware('module:listings')->group(...)
 *
 * A module is active only when the license handshake passes AND the client's
 * switch is on. Core routes never carry this. 404 (not 403) so an unlicensed
 * module is indistinguishable from one that was never installed.
 */
class EnsureModuleActive
{
    public function __construct(private LicenseManager $manager) {}

    public function handle(Request $request, Closure $next, string $module): Response
    {
        if (!$this->manager->isActive($module)) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return $next($request);
    }
}
