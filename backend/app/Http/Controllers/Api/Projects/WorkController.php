<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectService;
use App\Services\Projects\ProjectSettings;
use App\Services\Projects\ProjectsSetup;
use App\Services\Projects\ProjectTasks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Work and time (stage 5): tasks on the Work tab, and the work settings. Later builds add scope, key dates, changes and time. */
class WorkController extends Controller
{
    public function __construct(private ProjectTasks $tasks) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->tasks->list($this->project($request, $project), $request->user(), $request->only(['mine', 'status', 'overdue', 'phase_id', 'q']))));
    }

    public function show(Request $request, int $project, int $task): JsonResponse
    {
        return $this->guard(fn () => response()->json(['task' => $this->tasks->show($this->project($request, $project), $task, $request->user())]));
    }

    public function store(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $id = $this->tasks->create($p, $request->all(), $request->user());

            return response()->json(['task' => $this->tasks->show($p, $id, $request->user())], 201);
        });
    }

    public function update(Request $request, int $project, int $task): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task) {
            $p = $this->project($request, $project);
            $this->tasks->update($p, $task, $request->all(), $request->user());

            return response()->json(['task' => $this->tasks->show($p, $task, $request->user())]);
        });
    }

    public function move(Request $request, int $project, int $task): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task) {
            $p = $this->project($request, $project);
            $this->tasks->move($p, $task, (string) $request->input('status'), $request->user(), $request->input('reason'));

            return response()->json(['task' => $this->tasks->show($p, $task, $request->user())]);
        });
    }

    public function destroy(Request $request, int $project, int $task): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task) {
            $n = $this->tasks->delete($this->project($request, $project), $task, $request->user());

            return response()->json(['message' => $n > 1 ? "Deleted, with {$n} tasks under it." : 'Deleted.', 'deleted' => $n]);
        });
    }

    public function addCheck(Request $request, int $project, int $task): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task) {
            $p = $this->project($request, $project);
            $this->tasks->addCheck($p, $task, (string) $request->input('text'), $request->user());

            return response()->json(['task' => $this->tasks->show($p, $task, $request->user())], 201);
        });
    }

    public function tick(Request $request, int $project, int $task, int $check): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task, $check) {
            $p = $this->project($request, $project);
            $this->tasks->tick($p, $task, $check, $request->boolean('done'), $request->user());

            return response()->json(['task' => $this->tasks->show($p, $task, $request->user())]);
        });
    }

    public function removeCheck(Request $request, int $project, int $task, int $check): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $task, $check) {
            $p = $this->project($request, $project);
            $this->tasks->removeCheck($p, $task, $check, $request->user());

            return response()->json(['task' => $this->tasks->show($p, $task, $request->user())]);
        });
    }

    // ------------------------------------------------------------------ scope lines (5.3)

    public function scope(Request $request, int $project): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Projects\ProjectScope::class)->list($this->project($request, $project), $request->user())));
    }

    public function addScope(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->project($request, $project);
            $s = app(\App\Services\Projects\ProjectScope::class);
            $request->filled('copy_from') ? $s->copyOrder($p, $request->integer('copy_from'), $request->user()) : $s->create($p, $request->all(), $request->user());

            return response()->json($s->list($p, $request->user()), 201);
        });
    }

    public function changeScope(Request $request, int $project, int $line): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $line) {
            $p = $this->project($request, $project);
            $s = app(\App\Services\Projects\ProjectScope::class);
            $request->has('progress') ? $s->progress($p, $line, $request->input('progress'), $request->user(), $request->input('note')) : $s->update($p, $line, $request->all(), $request->user());

            return response()->json($s->list($p, $request->user()));
        });
    }

    public function deleteScope(Request $request, int $project, int $line): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $line) {
            $p = $this->project($request, $project);
            $s = app(\App\Services\Projects\ProjectScope::class);
            $s->delete($p, $line, $request->user());

            return response()->json($s->list($p, $request->user()));
        });
    }

    public function views(Request $request, string $place): JsonResponse
    {
        return $this->guard(fn () => response()->json(['views' => app(\App\Services\Projects\ProjectSavedViews::class)->of($request->user(), $place)]));
    }

    public function saveView(Request $request, string $place): JsonResponse
    {
        return $this->guard(function () use ($request, $place) {
            $v = app(\App\Services\Projects\ProjectSavedViews::class);
            $id = $v->save($request->user(), $place, (string) $request->input('name'), (array) $request->input('settings', []));

            return response()->json(['id' => $id, 'views' => $v->of($request->user(), $place)], 201);
        });
    }

    public function deleteView(Request $request, string $place, int $view): JsonResponse
    {
        return $this->guard(function () use ($request, $place, $view) {
            $v = app(\App\Services\Projects\ProjectSavedViews::class);
            $v->delete($request->user(), $view);

            return response()->json(['views' => $v->of($request->user(), $place)]);
        });
    }

    public function settings(Request $request): JsonResponse
    {
        return response()->json(['work' => app(ProjectSettings::class)->get('work'), 'ready' => ProjectsSetup::work(), 'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            app(ProjectSettings::class)->save('work', $request->only(array_keys(ProjectSettings::DEFAULTS['work'])), $request->user());

            return $this->settings($request);
        });
    }

    private function project(Request $request, int $id): object
    {
        return app(ProjectService::class)->findFor($request->user(), $id);
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
