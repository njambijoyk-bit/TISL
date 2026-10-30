<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Services\Events\EventException;
use Illuminate\Http\JsonResponse;

/** An EventException is something to tell the person (a 422 with its message), not a server error. */
trait GuardsEventErrors
{
    protected function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
