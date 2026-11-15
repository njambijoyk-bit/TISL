<?php

namespace App\Http\Controllers\Api\Projects;

use App\Http\Controllers\Controller;
use App\Services\Projects\ProjectAccess;
use App\Services\Projects\ProjectException;
use App\Services\Projects\ProjectMembers;
use App\Services\Projects\ProjectRoles;
use App\Services\Projects\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The people on a project, invitations, transfer, and the project roles an owner defines. */
class MemberController extends Controller
{
    public function __construct(private ProjectService $projects, private ProjectMembers $members, private ProjectAccess $access, private ProjectRoles $roles) {}

    public function index(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->access->authorize($request->user(), 'members_view', $p);

            return $this->listOf($request, $p);
        });
    }

    public function invite(Request $request, int $project): JsonResponse
    {
        return $this->guard(function () use ($request, $project) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->members->invite($p, $request->only(['user_id', 'project_role_id', 'starts_at', 'ends_at']), $request->user());

            return $this->listOf($request, $p, 201);
        });
    }

    public function change(Request $request, int $project, int $member): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $member) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->members->change($p, $member, $request->only(['project_role_id', 'starts_at', 'ends_at']), $request->user());

            return $this->listOf($request, $p);
        });
    }

    public function remove(Request $request, int $project, int $member): JsonResponse
    {
        return $this->guard(function () use ($request, $project, $member) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->members->remove($p, $member, $request->user());

            return $this->listOf($request, $p);
        });
    }

    public function transfer(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['user_id' => 'required|integer', 'note' => 'nullable|string|max:200']);

        return $this->guard(function () use ($request, $project, $data) {
            $p = $this->projects->findFor($request->user(), $project);
            $this->members->transfer($p, (int) $data['user_id'], $data['note'] ?? null, $request->user());

            return response()->json(['project' => $this->projects->show($request->user(), $this->projects->find($project))]);
        });
    }

    /** The invitations waiting for the person signed in. */
    public function invitations(Request $request): JsonResponse
    {
        return response()->json(['invitations' => $this->members->invitationsFor($request->user())]);
    }

    /** Answer my own invitation. The project is not opened first: an invited person is not on it yet. */
    public function answer(Request $request, int $project): JsonResponse
    {
        $data = $request->validate(['accept' => 'required|boolean']);

        return $this->guard(function () use ($request, $project, $data) {
            $this->members->answer($this->projects->find($project), $request->user(), (bool) $data['accept']);

            return response()->json(['invitations' => $this->members->invitationsFor($request->user())]);
        });
    }

    // ------------------------------------------------------------------ project roles (configuration)

    public function roles(): JsonResponse
    {
        return response()->json(['roles' => $this->roles->all(), 'abilities' => ProjectRoles::ABILITIES]);
    }

    public function addRole(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->roles->create($request->only(['name', 'description', 'abilities']), $request->user());

            return response()->json(['roles' => $this->roles->all(), 'abilities' => ProjectRoles::ABILITIES], 201);
        });
    }

    public function changeRole(Request $request, int $role): JsonResponse
    {
        return $this->guard(function () use ($request, $role) {
            $this->roles->update($role, $request->only(['name', 'description', 'abilities', 'is_active']), $request->user());

            return response()->json(['roles' => $this->roles->all(), 'abilities' => ProjectRoles::ABILITIES]);
        });
    }

    private function listOf(Request $request, object $p, int $status = 200): JsonResponse
    {
        $user = $request->user();
        $can = $this->access->allows($user, 'members', $p);
        $d = $this->access->decide($user, 'members', $p);
        $mayTransfer = $user->hasPermission('projects.transfer') && ($can || (! $d['hidden'] && ! $p->confidential && $p->frozen_at === null && $user->hasPermission('projects.view_all')));

        return response()->json([
            'members' => $this->members->list($p),
            'roles' => array_values(array_map(fn ($r) => ['id' => $r['id'], 'name' => $r['name']], array_filter($this->roles->all(), fn ($r) => $r['is_active']))),
            // who could be asked is only sent to someone who may ask
            'candidates' => $can || $mayTransfer ? $this->members->candidates($p) : [],
            'can' => ['members' => $can, 'transfer' => $mayTransfer],
        ], $status);
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
