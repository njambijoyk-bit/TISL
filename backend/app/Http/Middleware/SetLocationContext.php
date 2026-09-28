<?php

namespace App\Http\Middleware;

use App\Services\Location\LocationContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the client choose the branch in context via ?location=<id> or an
 * X-Location: <id> header. Unknown/inactive ids are ignored and the default
 * branch is used. Single-branch sites always resolve to "Main".
 */
class SetLocationContext
{
    public function __construct(private LocationContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->query('location') ?? $request->header('X-Location');

        if ($id !== null && is_numeric($id)) {
            $this->context->setById((int) $id);
        }

        return $next($request);
    }
}
