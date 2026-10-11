<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Security\AuthPendingAction;
use App\Services\Security\StepUp\StepUp;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/** "One more step": the question about a sensitive action, answering it, and giving it up. Every call is for the person's own question, from the sign-in that started it. */
class StepUpController extends Controller
{
    public function __construct(private StepUp $stepUp)
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

    /** GET /auth/step-up/{id}: the question as the screen shows it. */
    public function show(Request $request, string $id): JsonResponse
    {
        $p = AuthPendingAction::where('id', $id)->where('user_id', $request->user()->id)->where('token_id', $this->token($request)->id)->first();
        if (! $p) {
            return response()->json(['message' => 'That question was not found. Please try the action again.', 'reason' => 'unknown'], 404);
        }

        return response()->json($this->stepUp->describe($p, $request->user()));
    }

    /** POST /auth/step-up/{id}/options: the question the device signs. It belongs to this record alone. */
    public function options(Request $request, string $id): JsonResponse
    {
        try {
            $q = $this->stepUp->options($request->user(), $this->token($request), $id, $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** POST /auth/step-up/{id}/approve: the answer, with a passkey (challenge_id + credential) or the password where the rule allows it; critical actions also take a `reason`. */
    public function approve(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300', 'challenge_id' => 'nullable|string|size:40', 'credential' => 'nullable|array', 'current_password' => 'nullable|string|max:200']);
        try {
            $p = $this->stepUp->approve($request->user(), $this->token($request), $id, $request->only(['challenge_id', 'credential', 'current_password']), $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Confirmed. Now your action can go through.', 'pending' => $p->id, 'covers_until' => $p->covers_until?->toIso8601String(), 'expires_at' => $p->expires_at->toIso8601String()]);
    }

    /** DELETE /auth/step-up/{id}: never mind. */
    public function cancel(Request $request, string $id): JsonResponse
    {
        try {
            $this->stepUp->cancel($request->user(), $this->token($request), $id);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Cancelled.']);
    }
}
