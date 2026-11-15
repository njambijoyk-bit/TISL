<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLog;
use App\Services\Projects\ProjectPhases;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectTrash;
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

    // ------------------------------------------------------------------ the log and the trash

    public function log(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project, 'log');

            return response()->json(app(\App\Services\Projects\ProjectActivity::class)->forProject($p, $request->only(['result', 'q', 'page', 'per_page'])));
        });
    }

    public function logAll(Request $request): JsonResponse
    {
        return response()->json(app(\App\Services\Projects\ProjectActivity::class)->all($request->user(), $request->only(['result', 'q', 'page', 'per_page'])));
    }

    public function destroy(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            app(ProjectTrash::class)->deleteProject($this->projects->findFor($request->user(), $project), $request->user());

            return response()->json(['message' => 'In the trash.']);
        });
    }

    public function trash(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['items' => app(ProjectTrash::class)->list($user), 'days' => (int) app(\App\Services\Projects\ProjectSettings::class)->get('general')['trash_days'], 'can' => ['purge' => $user->hasPermission('projects.purge')]]);
    }

    public function restore(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|in:project,phase', 'id' => 'required|integer']);

        return $this->guard(function () use ($request, $data) {
            app(ProjectTrash::class)->restore($data['type'], (int) $data['id'], $request->user());

            return $this->trash($request);
        });
    }

    public function purge(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|in:project,phase', 'id' => 'required|integer']);

        return $this->guard(function () use ($request, $data) {
            app(ProjectTrash::class)->purge($data['type'], (int) $data['id'], $request->user());

            return $this->trash($request);
        });
    }

    // ------------------------------------------------------------------ phases

    public function phases(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => $this->phaseList($request, $this->projects->findFor($request->user(), $project)));
    }

    public function addPhase(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectPhases::class)->create($p, $request->all(), $request->user());

            return $this->phaseList($request, $p, 201);
        });
    }

    public function changePhase(Request $request, int $project, int $phase): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $phase) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectPhases::class)->update($p, $phase, $request->all(), $request->user());

            return $this->phaseList($request, $p);
        });
    }

    public function removePhase(Request $request, int $project, int $phase): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $phase) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectPhases::class)->delete($p, $phase, $request->user());

            return $this->phaseList($request, $p);
        });
    }

    private function phaseList(Request $request, object $p, int $status = 200): JsonResponse
    {
        $phases = app(ProjectPhases::class)->tree($p);
        $paths = [];
        foreach ($phases as &$phase) {
            $id = $phase['cost_centre_id'];
            $phase['cost_centre_path'] = $id ? ($paths[$id] ??= app(\App\Services\Projects\ProjectCostCentres::class)->path($id)) : null;
        }

        return response()->json(['phases' => $phases, 'can' => ['phases' => app(\App\Services\Projects\ProjectAccess::class)->allows($request->user(), 'phases', $p), 'delete' => $request->user()->hasPermission('projects.delete')]], $status);
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
