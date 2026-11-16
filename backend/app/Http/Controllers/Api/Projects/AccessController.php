<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectAccessList;
use App\Services\Projects\ProjectApprovals;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectHours;
use App\Services\Projects\ProjectLocks;
use App\Services\Projects\ProjectSecurity;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The control room of a project (stage 2): who can get in and why, and the rules on top of the project roles. */
class AccessController extends Controller
{
    public function __construct(private ProjectService $projects, private ProjectAccess $access, private ProjectAccessList $list, private ProjectHours $hours, private ProjectLocks $locks) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            // the tab itself stays reachable when People is locked: it is where a lock is managed and a reset asked for. The names are left out until it is opened.
            $this->access->authorize($request->user(), 'members_view', $p, false);

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

    // ------------------------------------------------------------------ locked areas

    /** Enter an area's password. Anyone who can open the project may try. */
    public function unlock(Request $request, int $project, string $area): JsonResponse
    {
        $data = $request->validate(['password' => 'required|string|max:200']);

        return $this->guard(function () use ($request, $project, $area, $data) {
            $p = $this->projects->findFor($request->user(), $project);
            $until = $this->locks->open($p, $area, $data['password'], $request->user());

            return response()->json(['until' => $until, 'locks' => $this->locks->stateFor($p, $request->user())]);
        });
    }

    public function lockAgain(Request $request, int $project, string $area): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $area) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->locks->close($p, $area, $request->user());

            return response()->json(['locks' => $this->locks->stateFor($p, $request->user())]);
        });
    }

    /** Lock an area, change its password (with the current one), or after an approved reset set the new one. */
    public function setLock(Request $request, int $project, string $area): JsonResponse
    {
        $data = $request->validate(['password' => 'required|string|max:200', 'current' => 'nullable|string|max:200', 'after_reset' => 'sometimes|boolean']);

        return $this->guard(function () use ($request, $project, $area, $data) {
            $p = $this->projects->findFor($request->user(), $project, 'access');
            if (! empty($data['after_reset'])) {
                $this->locks->finishReset($p, $area, $data['password'], $request->user());
            } else {
                $this->locks->set($p, $area, $data['password'], $data['current'] ?? null, $request->user());
            }

            return response()->json(['locks' => $this->locks->listFor($p, $request->user())]);
        });
    }

    public function removeLock(Request $request, int $project, string $area): JsonResponse
    {
        $data = $request->validate(['password' => 'required|string|max:200']);

        return $this->guard(function () use ($request, $project, $area, $data) {
            $p = $this->projects->findFor($request->user(), $project, 'access');
            $this->locks->remove($p, $area, $data['password'], $request->user());

            return response()->json(['locks' => $this->locks->listFor($p, $request->user())]);
        });
    }

    public function askReset(Request $request, int $project, string $area): JsonResponse
    {
        $data = $request->validate(['reason' => 'required|string|max:300']);

        return $this->guard(function () use ($request, $project, $area, $data) {
            $p = $this->projects->findFor($request->user(), $project, 'access');
            $this->locks->askReset($p, $area, $data['reason'], $request->user());

            return response()->json(['locks' => $this->locks->listFor($p, $request->user())], 201);
        });
    }

    // ------------------------------------------------------------------ approvals

    public function approvals(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(app(ProjectApprovals::class)->page($user) + ['can' => ['answer' => $user->hasPermission('projects.approve') || $user->hasPermission('projects.locks.reset')]]);
    }

    public function answerApproval(Request $request, int $approval): JsonResponse
    {
        $data = $request->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $approval, $data) {
            app(ProjectApprovals::class)->answer($approval, (bool) $data['approve'], $data['note'] ?? null, $request->user());

            return $this->approvals($request);
        });
    }

    public function withdrawApproval(Request $request, int $approval): JsonResponse
    {
        return $this->guard(function () use ($request, $approval) {
            app(ProjectApprovals::class)->withdraw($approval, $request->user());

            return $this->approvals($request);
        });
    }

    // ------------------------------------------------------------------ security

    public function security(Request $request): JsonResponse
    {
        return response()->json(app(ProjectSecurity::class)->page($request->user()));
    }

    public function reviewEvent(Request $request, int $event): JsonResponse
    {
        $data = $request->validate(['note' => 'required|string|max:300', 'release' => 'sometimes|boolean']);

        return $this->guard(function () use ($request, $event, $data) {
            $security = app(ProjectSecurity::class);
            empty($data['release']) ? $security->review($event, $data['note'], $request->user()) : $security->release($event, $data['note'], $request->user());

            return $this->security($request);
        });
    }

    public function saveSecurity(Request $request): JsonResponse
    {
        $data = $request->validate(['settings' => 'required|array']);

        return $this->guard(function () use ($request, $data) {
            app(\App\Services\Projects\ProjectSettings::class)->save('security', $data['settings'], $request->user());

            return $this->security($request);
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
