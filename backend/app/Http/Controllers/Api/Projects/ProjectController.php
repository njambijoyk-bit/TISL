<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Projects: the list, starting one, opening it and changing it. The routes ask for the permission; whether this person may do it ON THIS
 * project is asked of ProjectAccess inside the service, which also writes every refusal to the log.
 */
class ProjectController extends Controller
{
    public function __construct(private ProjectService $projects) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->projects->list($request->user(), $request->only(['scope', 'state', 'type_id', 'stage_id', 'lead_user_id', 'customer_id', 'industry', 'q', 'page', 'per_page'])));
    }

    public function options(Request $request): JsonResponse
    {
        return response()->json($this->projects->options($request->user()));
    }

    public function customers(Request $request): JsonResponse
    {
        return response()->json(['customers' => $this->projects->customers((string) $request->query('q', ''))]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $p = $this->projects->create($request->all(), $request->user());

            return response()->json(['project' => $this->projects->show($request->user(), $p)], 201);
        });
    }

    public function show(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            if ($p->confidential) {
                ProjectLog::record((int) $p->id, $request->user(), 'project.opened', 'project', (int) $p->id);   // who looked at a confidential project is always recorded
            }

            return response()->json(['project' => $this->projects->show($request->user(), $p)]);
        });
    }

    public function update(Request $request, int $project): JsonResponse
    {
        return $this->change($request, $project, fn ($p) => $this->projects->update($p, $request->all(), $request->user()));
    }

    public function stage(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['stage_id' => 'required|integer']);

        return $this->change($request, $project, fn ($p) => $this->projects->moveStage($p, (int) $data['stage_id'], $request->user()));
    }

    public function state(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['action' => 'required|string|in:hold,resume,cancel,reopen', 'reason' => 'nullable|string|max:200']);

        return $this->change($request, $project, fn ($p) => $this->projects->setState($p, $data['action'], $request->user(), $data['reason'] ?? null));
    }

    public function freeze(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['frozen' => 'required|boolean']);

        return $this->change($request, $project, fn ($p) => $this->projects->freeze($p, (bool) $data['frozen'], $request->user()));
    }

    private function change(Request $request, int $project, callable $do): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $do) {
            $p = $do($this->projects->findFor($request->user(), $project));

            return response()->json(['project' => $this->projects->show($request->user(), $p)]);
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
