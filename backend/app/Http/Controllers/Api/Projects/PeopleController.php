<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectGrowth;
use App\Services\Projects\ProjectChecklists;
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

    public function growth(Request $request, int $user): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(ProjectGrowth::class)->page($request->user(), $user)));
    }

    public function goal(Request $request, int $user, ?int $goal = null): JsonResponse
    {
        return $this->guard(function () use ($request, $user, $goal) {
            app(ProjectGrowth::class)->saveGoal($request->user(), $user, $goal, $request->only(['title', 'measure', 'due_on', 'progress', 'state']));

            return $this->growth($request, $user);
        });
    }

    public function review(Request $request, int $user, ?int $review = null): JsonResponse
    {
        return $this->guard(function () use ($request, $user, $review) {
            app(ProjectGrowth::class)->saveReview($request->user(), $user, $review, $request->only(['period', 'body', 'share', 'comment', 'acknowledge']));

            return $this->growth($request, $user);
        });
    }

    public function oneToOne(Request $request, int $user, ?int $meeting = null): JsonResponse
    {
        return $this->guard(function () use ($request, $user, $meeting) {
            app(ProjectGrowth::class)->saveOneToOne($request->user(), $user, $meeting, $request->only(['held_on', 'notes', 'actions', 'private_note']));

            return $this->growth($request, $user);
        });
    }

    public function actionTask(Request $request, int $user, int $meeting, int $index): JsonResponse
    {
        return $this->guard(function () use ($request, $user, $meeting, $index) {
            $task = app(ProjectGrowth::class)->actionToTask($request->user(), $user, $meeting, $index, (int) $request->input('project_id'));

            return response()->json(['task_id' => $task] + app(ProjectGrowth::class)->page($request->user(), $user), 201);
        });
    }

    public function checklists(Request $request, int $user): JsonResponse
    {
        return $this->guard(fn () => response()->json(['checklists' => app(ProjectChecklists::class)->forPerson($request->user(), $user), 'templates' => $request->user()->hasPermission('projects.team.checklists') ? app(ProjectChecklists::class)->templates() : []]));
    }

    public function startChecklist(Request $request, int $user): JsonResponse
    {
        return $this->guard(function () use ($request, $user) {
            app(ProjectChecklists::class)->start($request->user(), $user, (int) $request->input('template_id'), (string) $request->input('on_date'));

            return $this->checklists($request, $user);
        });
    }

    public function tick(Request $request, int $item): JsonResponse
    {
        return $this->guard(function () use ($request, $item) {
            $note = app(ProjectChecklists::class)->tick($request->user(), $item, $request->boolean('done'));

            return response()->json(['message' => $note ?? 'Saved', 'mine' => app(ProjectChecklists::class)->mine($request->user())]);
        });
    }

    public function cancelChecklist(Request $request, int $checklist): JsonResponse
    {
        return $this->guard(function () use ($request, $checklist) {
            app(ProjectChecklists::class)->cancel($request->user(), $checklist);

            return response()->json(['message' => 'Cancelled']);
        });
    }

    public function templates(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json(['templates' => app(ProjectChecklists::class)->templates(true), 'who' => ProjectChecklists::WHO, 'kinds' => ProjectChecklists::KINDS,
            'staff' => app(\App\Services\Notify\Staff::class)->holding('projects.use')->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all(),
            'can' => ['change' => $request->user()->hasPermission('projects.config.manage')]]));
    }

    public function saveTemplate(Request $request, ?int $template = null): JsonResponse
    {
        return $this->guard(function () use ($request, $template) {
            app(ProjectChecklists::class)->saveTemplate($template, $request->all(), $request->user());

            return $this->templates($request);
        });
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
