<?php

namespace App\Http\Middleware;

use App\Models\ExchangeKey;
use Closure;
use Illuminate\Http\Request;

/** The pull endpoint's door: `Authorization: Bearer <keyId>.<secret>` made in Books > Other companies > Keys. Read-only, rate limited, and the key can be revoked at any time. */
class ExchangeKeyAuth
{
    public function handle(Request $request, Closure $next)
    {
        $key = ExchangeKey::fromBearer($request->bearerToken());
        if (! $key) {
            usleep(250000);   // a wrong key costs a guesser time

            return response()->json(['message' => 'A valid exchange key is needed.'], 401);
        }
        $request->attributes->set('exchange_key', $key);

        return $next($request);
    }
}
