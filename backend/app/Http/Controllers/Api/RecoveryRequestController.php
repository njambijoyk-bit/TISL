<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\AssistedRecovery;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Assisted recovery, from the locked-out person's side: ask for help, see where it stands, give it up, and start it once it has been approved and has cooled off.
 * Reachable from the restricted sign-in (the "add or use a passkey" screen), because that is where this person is stuck.
 */
class RecoveryRequestController extends Controller
{
    public function __construct(private AssistedRecovery $recovery)
    {
    }

    private function token(Request $request): PersonalAccessToken
    {
        $t = $request->user()->currentAccessToken();
        if (! $t instanceof PersonalAccessToken) {
            abort(403, 'Please sign in again to do this.');
        }

        return $t;
    }

    private function refuse(StepUpException $e): JsonResponse
    {
        return response()->json(['message' => $e->getMessage(), 'reason' => $e->reason], $e->httpStatus);
    }

    /** GET /auth/recovery-requests/mine */
    public function mine(Request $request): JsonResponse
    {
        return response()->json($this->recovery->status($request->user()));
    }

    /** POST /auth/recovery-requests {note} */
    public function store(Request $request): JsonResponse
    {
        $request->validate(['note' => 'nullable|string|max:300']);
        try {
            $this->recovery->request($request->user(), $request->input('note'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Asked. Two administrators will check with you another way and approve; then there is a waiting day.'] + $this->recovery->status($request->user()), 201);
    }

    /** DELETE /auth/recovery-requests/{id} */
    public function destroy(Request $request, string $id): JsonResponse
    {
        try {
            $this->recovery->cancelMine($request->user(), $id, $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Cancelled.'] + $this->recovery->status($request->user()));
    }

    /** POST /auth/recovery-requests/{id}/start */
    public function start(Request $request, string $id): JsonResponse
    {
        try {
            $this->recovery->start($request->user(), $this->token($request), $id, $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Recovery started. You can add a new passkey now.', 'minutes' => \App\Services\Security\Sessions::RECOVERY_MINUTES]);
    }
}
