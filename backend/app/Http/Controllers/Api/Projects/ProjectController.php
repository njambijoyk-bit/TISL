<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectLinks;
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
        return response()->json($this->projects->list($request->user(), $request->only(['scope', 'state', 'type_id', 'stage_id', 'lead_user_id', 'customer_id', 'industry', 'health', 'q', 'page', 'per_page'])));
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

            app(\App\Services\Projects\ProjectSecurity::class)->noteOpened($request->user(), (int) $p->id);

            return response()->json(['project' => $this->projects->show($request->user(), $p)]);
        });
    }

    public function update(Request $request, int $project): JsonResponse
    {
        return $this->change($request, $project, function ($p) use ($request) {
            $done = fn () => null;
            if ($p->confidential && $request->has('confidential') && ! $request->boolean('confidential')) {   // opening up a confidential project can be marked serious
                $this->access()->authorize($request->user(), 'confidential', $p);
                $done = $this->serious()->gate($request, 'project.open_up', $p, ['project' => (int) $p->id], "Make {$p->number} ({$p->title}) open to everyone who sees all projects");
            }
            $out = $this->projects->update($p, $request->all(), $request->user());
            $done();

            return $out;
        });
    }

    public function stage(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['stage_id' => 'required|integer']);

        return $this->change($request, $project, function ($p) use ($request, $data) {
            $done = fn () => null;
            // a closed project moved back to an open stage is being reopened
            if ($p->state === 'closed' && \Illuminate\Support\Facades\DB::table('project_stages')->where('id', $data['stage_id'])->where('type_id', $p->type_id)->where('state', '!=', 'closed')->exists()) {
                $this->access()->authorize($request->user(), 'close', $p);
                $done = $this->serious()->gate($request, 'project.reopen', $p, ['project' => (int) $p->id], "Reopen {$p->number} ({$p->title})");
            }
            $out = $this->projects->moveStage($p, (int) $data['stage_id'], $request->user());
            $done();

            return $out;
        });
    }

    public function state(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['action' => 'required|string|in:hold,resume,cancel,reopen', 'reason' => 'nullable|string|max:200']);

        return $this->change($request, $project, function ($p) use ($request, $data) {
            $done = fn () => null;
            if ($data['action'] === 'reopen') {
                $this->access()->authorize($request->user(), 'close', $p);
                $done = $this->serious()->gate($request, 'project.reopen', $p, ['project' => (int) $p->id], "Reopen {$p->number} ({$p->title})");
            }
            $out = $this->projects->setState($p, $data['action'], $request->user(), $data['reason'] ?? null);
            $done();

            return $out;
        });
    }

    public function freeze(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['frozen' => 'required|boolean']);

        return $this->change($request, $project, function ($p) use ($request, $data) {
            $done = fn () => null;
            if (! $data['frozen'] && $p->frozen_at !== null) {
                $this->access()->authorize($request->user(), 'freeze', $p);
                $done = $this->serious()->gate($request, 'project.unfreeze', $p, ['project' => (int) $p->id], "Unfreeze {$p->number} ({$p->title}) so it can be changed again");
            }
            $out = $this->projects->freeze($p, (bool) $data['frozen'], $request->user());
            $done();

            return $out;
        });
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
            $p = $this->projects->findFor($request->user(), $project, 'edit');
            $done = $this->serious()->gate($request, 'project.delete', $p, ['project' => (int) $p->id], "Put {$p->number} ({$p->title}) in the trash");
            app(ProjectTrash::class)->deleteProject($p, $request->user());
            $done();

            return response()->json(['message' => 'In the trash.']);
        });
    }

    public function trash(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['items' => app(ProjectTrash::class)->list($user), 'days' => (int) app(\App\Services\Projects\ProjectSettings::class)->get('general')['trash_days'], 'can' => ['purge' => $user->hasPermission('projects.purge')]]);   // (what a purge needs is asked when it is tried)
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
            $done = fn () => null;
            if ($data['type'] === 'project' && ($p = \Illuminate\Support\Facades\DB::table('projects')->where('id', $data['id'])->whereNotNull('deleted_at')->first())) {
                $done = $this->serious()->gate($request, 'project.purge', $p, ['project' => (int) $p->id], "Delete {$p->number} ({$p->title}) for good");
            }
            app(ProjectTrash::class)->purge($data['type'], (int) $data['id'], $request->user());
            $done();

            return $this->trash($request);
        });
    }

    // ------------------------------------------------------------------ links to other modules

    public function links(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            app(\App\Services\Projects\ProjectLocks::class)->need($p, 'links', $request->user());

            return $this->linkList($request, $p);
        });
    }

    public function findLinkable(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|max:80', 'q' => 'nullable|string|max:80']);

        return $this->guard(function () use ($request, $project, $data) {
            $p = $this->projects->findFor($request->user(), $project);
            app(\App\Services\Projects\ProjectAccess::class)->authorize($request->user(), 'links', $p);

            return response()->json(['found' => app(ProjectLinks::class)->search($request->user(), $data['type'], (string) ($data['q'] ?? ''))]);
        });
    }

    public function addLink(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|max:80', 'linked_id' => 'required|integer', 'note' => 'nullable|string|max:200', 'role' => 'nullable|string|max:30']);

        return $this->guard(function () use ($request, $project, $data) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectLinks::class)->add($p, $data['type'], (int) $data['linked_id'], $data['note'] ?? null, $request->user(), $data['role'] ?? null);

            return $this->linkList($request, $p, 201);
        });
    }

    public function removeLink(Request $request, int $project, int $link): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $link) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectLinks::class)->remove($p, $link, $request->user());

            return $this->linkList($request, $p);
        });
    }

    public function changeLink(Request $request, int $project, int $link): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $link) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectLinks::class)->change($p, $link, $request->only(['role', 'note']), $request->user());

            return $this->linkList($request, $p);
        });
    }

    public function restoreLink(Request $request, int $project, int $link): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $link) {
            $p = $this->projects->findFor($request->user(), $project);
            app(ProjectLinks::class)->restore($p, $link, $request->user());

            return $this->linkList($request, $p);
        });
    }

    public function linkRoles(Request $request): JsonResponse
    {
        return response()->json(['roles' => app(ProjectLinks::class)->roles(true), 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveLinkRole(Request $request, ?int $role = null): JsonResponse
    {
        return $this->guard(function () use ($request, $role) {
            app(ProjectLinks::class)->saveRole($role, $request->all(), $request->user());

            return $this->linkRoles($request);
        });
    }

    /** For another module's page: the projects one of its records is attached to. */
    public function linkedTo(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|max:80', 'id' => 'required|integer']);

        $links = app(ProjectLinks::class);

        return response()->json(['projects' => $links->projectsOf($request->user(), $data['type'], (int) $data['id']), 'can_add' => $links->mayAddFrom($request->user(), $data['type'])]);
    }

    /** From a module's own page (build 7.4): the pieces of work this record could be added to. */
    public function linkTargets(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|max:80', 'id' => 'required|integer', 'q' => 'nullable|string|max:80']);

        return response()->json(['projects' => app(ProjectLinks::class)->targets($request->user(), $data['type'], (int) $data['id'], (string) ($data['q'] ?? ''))]);
    }

    /** From a module's own page: add this record to a piece of work. */
    public function linkFrom(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => 'required|string|max:80', 'id' => 'required|integer', 'project_id' => 'required|integer', 'role' => 'nullable|string|max:30', 'note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($request, $data) {
            $p = $this->projects->findFor($request->user(), (int) $data['project_id']);
            app(ProjectLinks::class)->add($p, $data['type'], (int) $data['id'], $data['note'] ?? null, $request->user(), $data['role'] ?? null);

            return $this->linkedTo($request);
        });
    }

    private function linkList(Request $request, object $p, int $status = 200): JsonResponse
    {
        return response()->json(app(ProjectLinks::class)->forProject($p, $request->user()) + ['can' => ['links' => app(\App\Services\Projects\ProjectAccess::class)->allows($request->user(), 'links', $p)]], $status);
    }

    // ------------------------------------------------------------------ phases

    public function phases(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            app(\App\Services\Projects\ProjectLocks::class)->need($p, 'phases', $request->user());

            return $this->phaseList($request, $p);
        });
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

    private function serious(): \App\Services\Projects\ProjectSerious
    {
        return app(\App\Services\Projects\ProjectSerious::class);
    }

    private function access(): \App\Services\Projects\ProjectAccess
    {
        return app(\App\Services\Projects\ProjectAccess::class);
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
            return response()->json(['message' => $e->getMessage()] + $e->extra, $e->status);
        }
    }
}
