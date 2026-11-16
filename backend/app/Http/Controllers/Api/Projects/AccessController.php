<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectAccessList;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectHours;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The control room of a project (stage 2): who can get in and why, and the rules on top of the project roles. */
class AccessController extends Controller
{
    public function __construct(private ProjectService $projects, private ProjectAccess $access, private ProjectAccessList $list, private ProjectHours $hours) {}

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

    /** Hours of the project, or with `member_id` of one person's place on it. An empty list means any time. */
    public function setHours(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['member_id' => 'nullable|integer', 'days' => 'present|array|max:7', 'read_outside_hours' => 'sometimes|boolean']);

        return $this->guard(function () use ($request, $project, $data) {
            $p = $this->projects->findFor($request->user(), $project, 'access');
            $this->hours->set($p, (int) ($data['member_id'] ?? 0), $data['days'], $request->user());
            if (array_key_exists('read_outside_hours', $data)) {
                $this->hours->setReadOutside($p, (bool) $data['read_outside_hours'], $request->user());
            }

            return response()->json($this->list->for($p, $request->user()));
        });
    }

    /** Someone outside the hours asks to be let in for a short while. */
    public function askPass(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['reason' => 'nullable|string|max:200']);

        return $this->guard(function () use ($request, $project, $data) {
            $this->hours->ask($this->projects->find($project), $request->user(), $data['reason'] ?? null);

            return response()->json(['message' => 'Asked. You will be told when it is answered.'], 201);
        });
    }

    public function answerPass(Request $request, int $project, int $pass): JsonResponse
    {
        $data = $request->validate(['approve' => 'required|boolean']);

        return $this->guard(function () use ($request, $project, $pass, $data) {
            $p = $this->projects->findFor($request->user(), $project, 'access');
            $this->hours->answer($p, $pass, (bool) $data['approve'], $request->user());

            return response()->json($this->list->for($p, $request->user()));
        });
    }

    private function guard(callable $do): JsonResponse
    {
        try {
            return $do();
        } catch (ProjectException $e) {
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
