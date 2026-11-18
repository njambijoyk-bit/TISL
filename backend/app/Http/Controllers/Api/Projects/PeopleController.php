<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectTeam;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** People (stage 8): the team view and a person's page. Later builds add goals, reviews, one-to-ones, checklists and the casebook. */
class PeopleController extends Controller
{
    public function __construct(private ProjectTeam $team) {}

    public function team(Request $request): JsonResponse
    {
        return response()->json($this->team->page($request->user(), $request->only(['department', 'skill', 'project_id', 'late', 'over'])));
    }

    public function person(Request $request, int $user): JsonResponse
    {
        return $this->guard(fn () => response()->json(['person' => $this->team->person($request->user(), $user)]));
    }

    protected function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
