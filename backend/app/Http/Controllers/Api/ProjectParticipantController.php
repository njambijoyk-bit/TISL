<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Models\Customer;
use App\Models\Project;
use App\Models\ProjectParticipant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectParticipantController extends Controller
{
    use LogsProjectActivity;

    // Valid roles per participant type
    private const ADMIN_ROLES    = ['admin_owner', 'admin_manager', 'admin_finance', 'admin_support', 'admin_viewer'];
    private const CUSTOMER_ROLES = ['customer_owner', 'customer_editor', 'customer_viewer'];

    /**
     * GET /admin/projects/{project}/participants
     * GET /customer/projects/{project}/participants
     */
    public function index(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $participants = ProjectParticipant::where('project_id', $project->id)
            ->with([
                'customer:id,first_name,last_name,email',
                'adminUser:id,name,email',
                'invitedBy:id,name',
            ])
            ->get()
            ->map(function ($p) {
                $p->person; // resolve accessor
                return $p;
            });

        return response()->json(['data' => $participants]);
    }

    /**
     * POST /admin/projects/{project}/participants/add-admin
     * Admin adds a staff member to the project.
     */
    public function addAdmin(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        $validated = $request->validate([
            'admin_user_id'    => 'required|integer|exists:users,id',
            'role'             => 'required|in:' . implode(',', self::ADMIN_ROLES),
            'can_view_finance' => 'nullable|boolean',
            'can_comment'      => 'nullable|boolean',
            'can_upload_docs'  => 'nullable|boolean',
            'can_approve'      => 'nullable|boolean',
        ]);

        // Prevent duplicate active/invited participant
        $existing = ProjectParticipant::where('project_id', $project->id)
            ->where('participant_type', 'admin')
            ->where('admin_user_id', $validated['admin_user_id'])
            ->whereIn('status', ['invited', 'active'])
            ->first();

        if ($existing) {
            return response()->json(['message' => 'This user is already a participant.'], 422);
        }

        // Only one admin_owner allowed
        if ($validated['role'] === 'admin_owner') {
            ProjectParticipant::where('project_id', $project->id)
                ->where('role', 'admin_owner')
                ->update(['role' => 'admin_manager']);
        }

        $participant = ProjectParticipant::create([
            'project_id'       => $project->id,
            'participant_type' => 'admin',
            'admin_user_id'    => $validated['admin_user_id'],
            'role'             => $validated['role'],
            'status'           => 'active',
            'can_view_finance' => $validated['can_view_finance'] ?? ($validated['role'] === 'admin_finance'),
            'can_comment'      => $validated['can_comment'] ?? true,
            'can_upload_docs'  => $validated['can_upload_docs'] ?? true,
            'can_approve'      => $validated['can_approve'] ?? in_array($validated['role'], ['admin_owner', 'admin_manager']),
            'invited_by'       => auth()->id(),
            'invited_at'       => now(),
            'accepted_at'      => now(), // Admin invites are auto-accepted
        ]);

        $this->logActivity($project, 'PARTICIPANT_ADDED', 'project_participant', $participant->id, [
            'type' => 'admin',
            'user_id' => $validated['admin_user_id'],
            'role' => $validated['role'],
        ]);

        return response()->json([
            'message' => 'Admin participant added successfully.',
            'data'    => $participant->load('adminUser:id,name,email'),
        ], 201);
    }

    /**
     * POST /admin/projects/{project}/participants/add-customer
     * Admin adds a customer-side participant.
     */
    public function addCustomer(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        $validated = $request->validate([
            'customer_id'      => 'required|integer|exists:customers,id',
            'role'             => 'required|in:' . implode(',', self::CUSTOMER_ROLES),
            'can_view_finance' => 'nullable|boolean',
            'can_comment'      => 'nullable|boolean',
            'can_upload_docs'  => 'nullable|boolean',
            'can_approve'      => 'nullable|boolean',
        ]);

        // Prevent duplicate
        $existing = ProjectParticipant::where('project_id', $project->id)
            ->where('participant_type', 'customer')
            ->where('customer_id', $validated['customer_id'])
            ->whereIn('status', ['invited', 'active'])
            ->first();

        if ($existing) {
            return response()->json(['message' => 'This customer is already a participant.'], 422);
        }

        // Only one customer_owner allowed
        if ($validated['role'] === 'customer_owner') {
            ProjectParticipant::where('project_id', $project->id)
                ->where('role', 'customer_owner')
                ->update(['role' => 'customer_editor']);
        }

        $participant = ProjectParticipant::create([
            'project_id'       => $project->id,
            'participant_type' => 'customer',
            'customer_id'      => $validated['customer_id'],
            'role'             => $validated['role'],
            'status'           => 'invited',
            'can_view_finance' => $validated['can_view_finance'] ?? false,
            'can_comment'      => $validated['can_comment'] ?? true,
            'can_upload_docs'  => $validated['can_upload_docs'] ?? true,
            'can_approve'      => $validated['can_approve'] ?? ($validated['role'] === 'customer_owner'),
            'invited_by'       => auth()->id(),
            'invited_at'       => now(),
        ]);

        $this->logActivity($project, 'PARTICIPANT_INVITED', 'project_participant', $participant->id, [
            'type'        => 'customer',
            'customer_id' => $validated['customer_id'],
            'role'        => $validated['role'],
        ]);

        return response()->json([
            'message' => 'Customer participant invited successfully.',
            'data'    => $participant->load('customer:id,first_name,last_name,email'),
        ], 201);
    }

    /**
     * POST /customer/projects/{project}/participants/customer-invite
     * customer_owner invites another customer user (restricted to customer_roles only).
     */
    public function customerInvite(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
            'role'        => 'required|in:customer_editor,customer_viewer', // owner cannot grant owner
            'can_comment' => 'nullable|boolean',
        ]);

        $existing = ProjectParticipant::where('project_id', $project->id)
            ->where('participant_type', 'customer')
            ->where('customer_id', $validated['customer_id'])
            ->whereIn('status', ['invited', 'active'])
            ->first();

        if ($existing) {
            return response()->json(['message' => 'This customer is already a participant.'], 422);
        }

        $participant = ProjectParticipant::create([
            'project_id'       => $project->id,
            'participant_type' => 'customer',
            'customer_id'      => $validated['customer_id'],
            'role'             => $validated['role'],
            'status'           => 'invited',
            'can_view_finance' => false,
            'can_comment'      => $validated['can_comment'] ?? true,
            'can_upload_docs'  => false,
            'can_approve'      => false,
            'invited_by'       => auth()->id(),
            'invited_at'       => now(),
        ]);

        $this->logActivity($project, 'PARTICIPANT_INVITED', 'project_participant', $participant->id, [
            'type'        => 'customer',
            'customer_id' => $validated['customer_id'],
            'role'        => $validated['role'],
        ]);

        return response()->json([
            'message' => 'Invitation sent successfully.',
            'data'    => $participant->load('customer:id,first_name,last_name,email'),
        ], 201);
    }

    /**
     * PUT /admin/projects/{project}/participants/{participant}
     * Update role or capability flags.
     */
    public function update(Request $request, Project $project, ProjectParticipant $participant): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        if ($participant->project_id !== $project->id) {
            return response()->json(['message' => 'Participant does not belong to this project.'], 404);
        }

        $allowedRoles = $participant->participant_type === 'admin'
            ? implode(',', self::ADMIN_ROLES)
            : implode(',', self::CUSTOMER_ROLES);

        $validated = $request->validate([
            'role'             => 'sometimes|in:' . $allowedRoles,
            'status'           => 'sometimes|in:invited,active,removed',
            'can_view_finance' => 'sometimes|boolean',
            'can_comment'      => 'sometimes|boolean',
            'can_upload_docs'  => 'sometimes|boolean',
            'can_approve'      => 'sometimes|boolean',
        ]);

        $participant->update($validated);

        $this->logActivity($project, 'PARTICIPANT_UPDATED', 'project_participant', $participant->id, $validated);

        return response()->json([
            'message' => 'Participant updated successfully.',
            'data' => $participant->fresh()->load([
                'adminUser:id,name,email',
                'customer:id,first_name,last_name,email',
                'invitedBy:id,name',
            ]),
        ]);
    }

    /**
     * DELETE /admin/projects/{project}/participants/{participant}
     */
    public function remove(Project $project, ProjectParticipant $participant): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        if ($participant->project_id !== $project->id) {
            return response()->json(['message' => 'Participant does not belong to this project.'], 404);
        }

        // Prevent removing the sole customer_owner
        if ($participant->role === 'customer_owner') {
            $ownerCount = ProjectParticipant::where('project_id', $project->id)
                ->where('role', 'customer_owner')
                ->where('status', 'active')
                ->count();
            if ($ownerCount <= 1) {
                return response()->json([
                    'message' => 'Cannot remove the only customer owner. Assign another owner first.',
                ], 422);
            }
        }

        $participant->update(['status' => 'removed']);

        $this->logActivity($project, 'PARTICIPANT_REMOVED', 'project_participant', $participant->id);

        return response()->json(['message' => 'Participant removed successfully.']);
    }

    public function forceDelete(Project $project, ProjectParticipant $participant): JsonResponse
    {
        $this->authorize('manageParticipants', $project);

        if ($participant->project_id !== $project->id) {
            return response()->json(['message' => 'Participant does not belong to this project.'], 404);
        }

        // Prevent deleting last admin owner
        if ($participant->role === 'admin_owner') {
            $count = ProjectParticipant::where('project_id', $project->id)
                ->where('role', 'admin_owner')
                ->where('status', 'active')
                ->count();

            if ($count <= 1) {
                return response()->json(['message' => 'Cannot delete the only admin owner.'], 422);
            }
        }

        $participant->forceDelete(); // 🔥 important

        return response()->json([
            'message' => 'Participant permanently deleted.',
        ]);
    }
}