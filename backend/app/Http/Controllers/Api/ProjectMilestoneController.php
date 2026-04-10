<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Models\Customer;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectParticipant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectMilestoneController extends Controller
{
    use LogsProjectActivity;

    /**
     * GET /admin/projects/{project}/milestones
     * GET /customer/projects/{project}/milestones
     */
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $milestones = ProjectMilestone::where('project_id', $project->id)
            ->with(['approvedBy:id,name'])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->orderBy('due_date')
            ->orderBy('created_at')
            ->get();

        // Hide finance fields from customers without can_view_finance
        if (!$this->isStaff() && !$this->customerCanViewFinance($project)) {
            $milestones->each(function ($m) {
                $m->makeHidden(['amount', 'amount_kes', 'currency', 'exchange_rate_to_kes']);
            });
        }

        return response()->json(['data' => $milestones]);
    }

    /**
     * POST /admin/projects/{project}/milestones
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('manageWork', $project);

        $validated = $request->validate([
            'title'                 => 'required|string|max:255',
            'description'           => 'nullable|string',
            'due_date'              => 'nullable|date',
            'currency'              => 'nullable|string|max:10',
            'amount'                => 'nullable|numeric|min:0',
            'exchange_rate_to_kes'  => 'nullable|numeric',
            'amount_kes'            => 'nullable|numeric|min:0',
            'converted_currency_at' => 'nullable|date',
            'status'                => 'nullable|in:pending,ready_for_review,approved,completed,rejected',
        ]);

        $validated['project_id'] = $project->id;

        $milestone = ProjectMilestone::create($validated);

        $this->logActivity($project, 'MILESTONE_CREATED', 'project_milestone', $milestone->id, [
            'title' => $milestone->title,
        ]);

        return response()->json([
            'message' => 'Milestone created successfully.',
            'data'    => $milestone->fresh(['approvedBy:id,name']),
        ], 201);
    }

    /**
     * PUT /admin/projects/{project}/milestones/{milestone}
     */
    public function update(Request $request, Project $project, ProjectMilestone $milestone): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($milestone->project_id !== $project->id) {
            return response()->json(['message' => 'Milestone does not belong to this project.'], 404);
        }

        // Cannot update an already approved/completed milestone unless admin
        if (in_array($milestone->status, ['approved', 'completed']) && !$this->isStaff()) {
            return response()->json(['message' => 'Approved or completed milestones cannot be edited.'], 422);
        }

        $validated = $request->validate([
            'title'                 => 'sometimes|string|max:255',
            'description'           => 'nullable|string',
            'due_date'              => 'nullable|date',
            'currency'              => 'nullable|string|max:10',
            'amount'                => 'nullable|numeric|min:0',
            'exchange_rate_to_kes'  => 'nullable|numeric',
            'amount_kes'            => 'nullable|numeric|min:0',
            'converted_currency_at' => 'nullable|date',
            'status'                => 'sometimes|in:pending,ready_for_review,approved,completed,rejected',
        ]);

        $milestone->update($validated);

        $this->logActivity($project, 'MILESTONE_UPDATED', 'project_milestone', $milestone->id);

        return response()->json([
            'message' => 'Milestone updated successfully.',
            'data' => $milestone->fresh(['approvedBy:id,name']),
        ]);
    }

    /**
     * POST /admin/projects/{project}/milestones/{milestone}/approve
     * POST /customer/projects/{project}/milestones/{milestone}/approve
     *
     * Checks participant.can_approve for customers, staff can always approve.
     */
    public function approve(Request $request, Project $project, ProjectMilestone $milestone): JsonResponse
    {
        $this->authorize('view', $project);

        if ($milestone->project_id !== $project->id) {
            return response()->json(['message' => 'Milestone does not belong to this project.'], 404);
        }

        if (!in_array($milestone->status, ['pending', 'ready_for_review'])) {
            return response()->json([
                'message' => 'Only pending or ready_for_review milestones can be approved.',
            ], 422);
        }

        // Authorization: staff always OK; customer needs can_approve flag
        if (!$this->isStaff()) {
            $customerId  = Customer::where('user_id', auth()->id())->value('id');
            $participant = ProjectParticipant::where('project_id', $project->id)
                ->where('participant_type', 'customer')
                ->where('customer_id', $customerId)
                ->whereIn('status', ['invited', 'active'])
                ->first();

            if (!$participant || !$participant->can_approve) {
                return response()->json(['message' => 'You do not have permission to approve milestones.'], 403);
            }
        }

        $validated = $request->validate([
            'approval_notes' => 'nullable|string',
        ]);

        $milestone->update([
            'status'         => 'approved',
            'approved_by'    => auth()->id(),
            'approved_at'    => now(),
            'approval_notes' => $validated['approval_notes'] ?? null,
        ]);

        $this->logActivity($project, 'MILESTONE_APPROVED', 'project_milestone', $milestone->id, [
            'title' => $milestone->title,
        ]);

        return response()->json([
            'message' => 'Milestone approved successfully.',
            'data'    => $milestone->fresh(['approvedBy:id,name']),
        ]);
    }

    /**
     * POST /admin/projects/{project}/milestones/{milestone}/reject
     * Admin only.
     */
    public function reject(Request $request, Project $project, ProjectMilestone $milestone): JsonResponse
    {
        $this->authorize('manageWork', $project);

        if ($milestone->project_id !== $project->id) {
            return response()->json(['message' => 'Milestone does not belong to this project.'], 404);
        }

        if ($milestone->status === 'rejected') {
            return response()->json(['message' => 'Milestone is already rejected.'], 422);
        }

        $validated = $request->validate([
            'approval_notes' => 'required|string|max:1000',
        ]);

        $milestone->update([
            'status'         => 'rejected',
            'approved_by'    => auth()->id(),
            'approved_at'    => now(),
            'approval_notes' => $validated['approval_notes'],
        ]);

        $this->logActivity($project, 'MILESTONE_REJECTED', 'project_milestone', $milestone->id, [
            'title'  => $milestone->title,
            'reason' => $validated['approval_notes'],
        ]);

        return response()->json([
            'message' => 'Milestone rejected.',
            'data' => $milestone->fresh(['approvedBy:id,name']),
        ]);
    }

    public function forceDelete(Project $project, Request $request): JsonResponse
    {
        $this->authorize('manageWork', $project);

        $validated = $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer|exists:project_milestones,id',
        ]);

        ProjectMilestone::where('project_id', $project->id)
            ->whereIn('id', $validated['ids'])
            ->forceDelete();

        return response()->json([
            'message' => 'Milestones permanently deleted.'
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    private function isStaff(): bool
    {
        return in_array(auth()->user()->role, ['super_admin', 'admin', 'manager', 'sales_rep'], true);
    }

    private function customerCanViewFinance(Project $project): bool
    {
        $customerId = Customer::where('user_id', auth()->id())->value('id');
        if (!$customerId) return false;

        return ProjectParticipant::where('project_id', $project->id)
            ->where('customer_id', $customerId)
            ->where('can_view_finance', true)
            ->whereIn('status', ['invited', 'active'])
            ->exists();
    }
}