<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectAccessList;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The control room of a project (stage 2): who can get in and why, and the rules on top of the project roles. */
class AccessController extends Controller
{
    public function __construct(private ProjectService $projects, private ProjectAccess $access, private ProjectAccessList $list) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->access->authorize($request->user(), 'members_view', $p);

            return response()->json($this->list->for($p, $request->user()));
        });
    }

    public function extend(Request $request, int $project, int $member): JsonResponse
    {
        $data = $request->validate(['ends_at' => 'present|nullable|string|max:25']);

        return $this->guard(function () use ($request, $project, $member, $data) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->list->extend($p, $member, $data['ends_at'], $request->user());

            return response()->json($this->list->for($p, $request->user()));
        });
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }
    }
}
