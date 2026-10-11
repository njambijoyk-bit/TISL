<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\StepUp\Council;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/** The Council of Two, from the second person's side: what is waiting for them, and approving or declining it. Nothing here can be reached for a request the person is not allowed to answer. */
class CouncilController extends Controller
{
    public function __construct(private Council $council)
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

    /** GET /auth/council: what is waiting for me to look at. */
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        return response()->json(['ready' => Council::ready(), 'data' => $this->council->waitingFor($me)->map(fn ($p) => $this->council->describeFor($p, $me))->values()]);
    }

    /** POST /auth/council/{id}/options: the question my device signs; it belongs to this request and to me. */
    public function options(Request $request, string $id): JsonResponse
    {
        try {
            $q = $this->council->options($request->user(), $id, $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** POST /auth/council/{id}/approve */
    public function approve(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300', 'challenge_id' => 'nullable|string|size:40', 'credential' => 'nullable|array', 'current_password' => 'nullable|string|max:200']);
        try {
            $this->council->approve($request->user(), $this->token($request), $id, $request->only(['challenge_id', 'credential', 'current_password']), $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Approved. The person who asked can go ahead now.']);
    }

    /** POST /auth/council/{id}/reject */
    public function reject(Request $request, string $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:300']);
        try {
            $this->council->reject($request->user(), $id, $request->input('reason'), $request);
        } catch (StepUpException $e) {
            return $this->refuse($e);
        }

        return response()->json(['message' => 'Declined. Nothing was done.']);
    }
}
