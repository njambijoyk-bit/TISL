<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/** "Where you are signed in": the person's own list of signed-in browsers, ending one, ending all the others, and signing out everywhere. */
class SessionController extends Controller
{
    public function __construct(private Sessions $sessions)
    {
    }

    private function currentId(Request $request): ?int
    {
        $t = $request->user()->currentAccessToken();

        return $t instanceof PersonalAccessToken ? (int) $t->id : null;
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->sessions->list($request->user(), $this->currentId($request))]);
    }

    /** DELETE /auth/sessions/{id}: end one browser (it is not necessarily this one). */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (! $this->sessions->revokeOne($request->user(), $id, 'revoked')) {
            return response()->json(['message' => 'That session was not found.'], 404);
        }
        SecurityLog::record('session_ended', $request->user(), $request, ['session' => $id, 'was_current' => $id === $this->currentId($request)], SecurityLog::NOTICE);

        return response()->json(['message' => 'That device is signed out.']);
    }

    /** POST /auth/sessions/revoke-others: every browser but this one. */
    public function revokeOthers(Request $request): JsonResponse
    {
        $n = $this->sessions->revokeAll($request->user(), $this->currentId($request), 'signed_out_everywhere');
        SecurityLog::record('sessions_ended', $request->user(), $request, ['count' => $n, 'kept_current' => true], SecurityLog::NOTICE);

        return response()->json(['message' => $n === 0 ? 'You are not signed in anywhere else.' : "Signed out of {$n} other " . ($n === 1 ? 'device' : 'devices') . '.', 'ended' => $n]);
    }

    /** POST /auth/sessions/revoke-all: every browser including this one. */
    public function revokeAll(Request $request): JsonResponse
    {
        $n = $this->sessions->revokeAll($request->user(), null, 'signed_out_everywhere');
        SecurityLog::record('sessions_ended', $request->user(), $request, ['count' => $n, 'kept_current' => false], SecurityLog::NOTICE);

        return response()->json(['message' => 'Signed out everywhere.', 'ended' => $n]);
    }
}
