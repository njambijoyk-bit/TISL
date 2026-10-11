<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\AssistedRecovery;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/** Assisted recovery, from the administrators' side: what they may look at, and approving, declining or cancelling it. Nothing here works for a request the administrator is not allowed to answer. */
class RecoveryApprovalController extends Controller
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

    /** GET /auth/recovery-approvals */
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        return response()->json(['ready' => AssistedRecovery::ready(), 'data' => $this->recovery->forApprover($me)->map(fn ($r) => $this->recovery->describeFor($r, $me))->values()]);
    }

    /** POST /auth/recovery-approvals/{id}/options */
    public function options(Request $request, string $id): JsonResponse
    {
        try {
            $q = $this->recovery->options($request->user(), $id, $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** POST /auth/recovery-approvals/{id}/approve */
    public function approve(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300', 'challenge_id' => 'nullable|string|size:40', 'credential' => 'nullable|array', 'current_password' => 'nullable|string|max:200']);
        try {
            $r = $this->recovery->approve($request->user(), $this->token($request), $id, $request->only(['challenge_id', 'credential', 'current_password']), $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => $r->release_at ? 'Approved. That was the last approval: the person can start the recovery after the waiting day.' : 'Approved. One more administrator has to approve it.', 'state' => $r->state()]);
    }

    /** POST /auth/recovery-approvals/{id}/decline */
    public function decline(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300']);
        try {
            $this->recovery->decline($request->user(), $id, $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Declined. Nothing was changed.']);
    }

    /** POST /auth/recovery-approvals/{id}/cancel: stop one that is still going, including during the waiting day. */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300']);
        try {
            $this->recovery->adminCancel($request->user(), $id, $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Cancelled. Nothing was changed.']);
    }
}
