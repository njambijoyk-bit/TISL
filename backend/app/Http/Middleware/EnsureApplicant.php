<?php

namespace App\Http\Middleware;

use App\Models\Applicant;
use Closure;
use Illuminate\Http\Request;

class EnsureApplicant
{
    public function handle(Request $request, Closure $next)
    {
        if (!($request->user() instanceof Applicant)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return $next($request);
    }
}