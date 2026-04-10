<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsProjectActivity;
use App\Http\Controllers\Api\Traits\ResolvesTaskRelations;
use App\Models\Customer;
use App\Models\Project;
use App\Models\ProjectParticipant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    use LogsProjectActivity, ResolvesTaskRelations;

    // ─────────────────────────────────────────────────────────────
    // ADMIN METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /admin/projects
     * List all projects for staff with filters.
     */
    public function adminIndex(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Project::class);

        $query = Project::with(['customer:id,first_name,last_name,email', 'ownerAdmin:id,name,email'])
            ->withCount(['participants', 'tasks', 'milestones', 'items']);

        // Filters
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }
        if ($request->filled('owner_admin_id')) {
            $query->where('owner_admin_id', $request->owner_admin_id);
        }
        if ($request->filled('search')) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', $search)
                  ->orWhere('project_number', 'like', $search);
            });
        }

        $projects = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($projects);
    }

    /**
     * POST /admin/projects
     * Admin creates a new project.
     */
    public function adminStore(Request $request): JsonResponse
    {
        $this->authorize('create', Project::class);

        $validated = $request->validate([
            'customer_id'              => 'required|integer|exists:customers,id',
            'title'                    => 'required|string|max:255',
            'description'              => 'nullable|string',
            'status'                   => 'nullable|in:planning,active,on_hold,completed,cancelled',
            'priority'                 => 'nullable|in:low,medium,high,urgent',
            'owner_admin_id'           => 'nullable|integer|exists:users,id',
            'delivery_location'        => 'nullable|string',
            'base_currency'            => 'nullable|string|max:10',
            'exchange_rate_to_kes'     => 'nullable|numeric',
            'default_shipping_address' => 'nullable|string',
            'default_billing_address'  => 'nullable|string',
            'billing_same_as_shipping' => 'nullable|boolean',
            'start_date'               => 'nullable|date',
            'target_end_date'          => 'nullable|date|after_or_equal:start_date',
            'metadata'                 => 'nullable|array',
        ]);

        $project = DB::transaction(function () use ($validated, $request) {
            $validated['project_number'] = $this->generateProjectNumber();

            $project = Project::create($validated);

            // Auto-create customer_owner participant
            ProjectParticipant::create([
                'project_id'       => $project->id,
                'participant_type' => 'customer',
                'customer_id'      => $project->customer_id,
                'role'             => 'customer_owner',
                'status'           => 'active',
                'can_comment'      => true,
                'can_upload_docs'  => true,
                'can_approve'      => true,
                'can_view_finance' => false,
            ]);

            // Auto-create admin_owner participant if owner_admin_id is set
            if (!empty($project->owner_admin_id)) {
                ProjectParticipant::create([
                    'project_id'       => $project->id,
                    'participant_type' => 'admin',
                    'admin_user_id'    => $project->owner_admin_id,
                    'role'             => 'admin_owner',
                    'status'           => 'active',
                    'can_comment'      => true,
                    'can_upload_docs'  => true,
                    'can_approve'      => true,
                    'can_view_finance' => true,
                ]);
            }

            $this->logActivity($project, 'PROJECT_CREATED', 'project', $project->id);

            return $project;
        });

        $project->load(['customer:id,first_name,last_name,email', 'ownerAdmin:id,name,email', 'participants']);

        return response()->json([
            'message' => 'Project created successfully.',
            'data'    => $project,
        ], 201);
    }

    /**
     * GET /admin/projects/{project}
     */
    public function adminShow(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $project->load([
            'customer:id,first_name,last_name,email,phone',
            'ownerAdmin:id,name,email',
            'participants.customer:id,first_name,last_name,email',
            'participants.adminUser:id,name,email',
            'links',
            'items',
            'tasks.assignedTo:id,name',
            'milestones.approvedBy:id,name',
            'messages.sender:id,name',
            'activity.actor:id,name',
        ]);

        // Attach related model summaries to tasks (not available via eager load alone)
        $this->attachRelatedSummaries($project->tasks);

        return response()->json(['data' => $project]);
    }

    /**
     * PUT /admin/projects/{project}
     */
    public function adminUpdate(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'title'                    => 'sometimes|string|max:255',
            'description'              => 'nullable|string',
            'status'                   => 'sometimes|in:planning,active,on_hold,completed,cancelled',
            'priority'                 => 'sometimes|in:low,medium,high,urgent',
            'owner_admin_id'           => 'nullable|integer|exists:users,id',
            'delivery_location'        => 'nullable|string',
            'base_currency'            => 'sometimes|string|max:10',
            'exchange_rate_to_kes'     => 'nullable|numeric',
            'default_shipping_address' => 'nullable|string',
            'default_billing_address'  => 'nullable|string',
            'billing_same_as_shipping' => 'nullable|boolean',
            'start_date'               => 'nullable|date',
            'target_end_date'          => 'nullable|date',
            'metadata'                 => 'nullable|array',
        ]);

        $oldStatus = $project->status;
        $project->update($validated);

        if (isset($validated['status']) && $validated['status'] !== $oldStatus) {
            $this->logActivity($project, 'STATUS_CHANGED', 'project', $project->id, [
                'from' => $oldStatus,
                'to'   => $validated['status'],
            ]);
        } else {
            $this->logActivity($project, 'PROJECT_UPDATED', 'project', $project->id);
        }

        return response()->json([
            'message' => 'Project updated successfully.',
            'data'    => $project->fresh(['customer:id,first_name,last_name,email', 'ownerAdmin:id,name,email']),
        ]);
    }

    /**
     * DELETE /admin/projects/{project}  (soft delete — admin + super_admin only via route middleware)
     */
    public function adminDestroy(Project $project): JsonResponse
    {
        $this->authorize('delete', $project);

        $project->delete();

        $this->logActivity($project, 'PROJECT_DELETED', 'project', $project->id);

        return response()->json(['message' => 'Project moved to trash.']);
    }

    /**
     * GET /admin/projects/trash
     * List all soft-deleted projects. Visible to admin + super_admin.
     */
    public function adminTrashed(Request $request): JsonResponse
    {
        $this->authorize('viewTrashed', Project::class);

        $query = Project::onlyTrashed()
            ->with(['customer:id,first_name,last_name,email', 'ownerAdmin:id,name,email'])
            ->withCount(['participants', 'tasks', 'milestones', 'items']);

        if ($request->filled('search')) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', $search)
                  ->orWhere('project_number', 'like', $search);
            });
        }

        $projects = $query->orderBy('deleted_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($projects);
    }

    /**
     * POST /admin/projects/{id}/restore
     * Restore a trashed project. Allowed for admin + super_admin.
     * Uses explicit withTrashed lookup because route model binding
     * skips soft-deleted records by default.
     */
    public function adminRestore(int $id): JsonResponse
    {
        $project = Project::withTrashed()->findOrFail($id);

        $this->authorize('restore', $project);

        $project->restore();

        $this->logActivity($project, 'PROJECT_RESTORED', 'project', $project->id);

        return response()->json(['message' => 'Project restored successfully.']);
    }

    /**
     * DELETE /admin/projects/{project}/force  (super_admin only)
     * Permanently deletes the project and all its children (via Project::booted cascade).
     */
    public function forceDestroy(Project $project): JsonResponse
    {
        $this->authorize('forceDelete', $project);

        $project->forceDelete();

        return response()->json([
            'message' => 'Project permanently deleted.'
        ]);
    }

    /**
     * POST /admin/projects/{project}/transfer-ownership
     * Reassign owner_admin_id and update participant rows.
     */
    public function transferOwnership(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'new_owner_admin_id' => 'required|integer|exists:users,id',
        ]);

        DB::transaction(function () use ($project, $validated) {
            $oldOwnerId = $project->owner_admin_id;
            $newOwnerId = $validated['new_owner_admin_id'];

            // Downgrade old admin_owner participant to admin_manager
            if ($oldOwnerId) {
                ProjectParticipant::where('project_id', $project->id)
                    ->where('participant_type', 'admin')
                    ->where('admin_user_id', $oldOwnerId)
                    ->where('role', 'admin_owner')
                    ->update(['role' => 'admin_manager']);
            }

            // Upsert new owner participant
            $existing = ProjectParticipant::where('project_id', $project->id)
                ->where('participant_type', 'admin')
                ->where('admin_user_id', $newOwnerId)
                ->first();

            if ($existing) {
                $existing->update(['role' => 'admin_owner', 'status' => 'active']);
            } else {
                ProjectParticipant::create([
                    'project_id'       => $project->id,
                    'participant_type' => 'admin',
                    'admin_user_id'    => $newOwnerId,
                    'role'             => 'admin_owner',
                    'status'           => 'active',
                    'can_comment'      => true,
                    'can_upload_docs'  => true,
                    'can_approve'      => true,
                    'can_view_finance' => true,
                    'invited_by'       => auth()->id(),
                    'invited_at'       => now(),
                    'accepted_at'      => now(),
                ]);
            }

            $project->update(['owner_admin_id' => $newOwnerId]);

            $this->logActivity($project, 'OWNERSHIP_TRANSFERRED', 'project', $project->id, [
                'from_admin_id' => $oldOwnerId,
                'to_admin_id'   => $newOwnerId,
            ]);
        });

        return response()->json(['message' => 'Ownership transferred successfully.']);
    }

    // ─────────────────────────────────────────────────────────────
    // CUSTOMER METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /customer/projects
     * List all projects this customer is a participant of.
     */
    public function customerIndex(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Project::class);

        $customerId = Customer::where('user_id', auth()->id())->value('id');

        if (!$customerId) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $query = Project::whereHas('participants', function ($q) use ($customerId) {
            $q->where('participant_type', 'customer')
              ->where('customer_id', $customerId)
              ->whereIn('status', ['invited', 'active']);
        })->with(['customer:id,first_name,last_name', 'ownerAdmin:id,name'])
          ->withCount(['tasks', 'milestones']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $projects = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 15));

        return response()->json($projects);
    }

    /**
     * POST /customer/projects
     * Customer creates a project (if you allow this flow).
     */
    public function customerStore(Request $request): JsonResponse
    {
        $this->authorize('create', Project::class);

        $customerId = Customer::where('user_id', auth()->id())->value('id');

        if (!$customerId) {
            return response()->json(['message' => 'Customer profile not found.'], 404);
        }

        $validated = $request->validate([
            'title'          => 'required|string|max:255',
            'description'    => 'nullable|string',
            'delivery_location' => 'nullable|string',
            'start_date'     => 'nullable|date',
            'target_end_date'=> 'nullable|date|after_or_equal:start_date',
        ]);

        $project = DB::transaction(function () use ($validated, $customerId) {
            $validated['project_number'] = $this->generateProjectNumber();
            $validated['customer_id']    = $customerId;
            $validated['status']         = 'planning';

            $project = Project::create($validated);

            // Auto-create customer_owner participant
            ProjectParticipant::create([
                'project_id'       => $project->id,
                'participant_type' => 'customer',
                'customer_id'      => $customerId,
                'role'             => 'customer_owner',
                'status'           => 'active',
                'can_comment'      => true,
                'can_upload_docs'  => true,
                'can_approve'      => true,
                'can_view_finance' => false,
            ]);

            $this->logActivity($project, 'PROJECT_CREATED', 'project', $project->id);

            return $project;
        });

        return response()->json([
            'message' => 'Project created successfully.',
            'data'    => $project,
        ], 201);
    }

    /**
     * GET /customer/projects/{project}
     */
    public function customerShow(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        // Resolve this customer's participant row to scope what they can see
        $customerId = Customer::where('user_id', auth()->id())->value('id');
        $participant = ProjectParticipant::where('project_id', $project->id)
            ->where('customer_id', $customerId)
            ->whereIn('status', ['invited', 'active'])
            ->first();

        $project->load([
            'customer:id,first_name,last_name,email',
            'ownerAdmin:id,name',
            'participants.customer:id,first_name,last_name,email',
            'participants.adminUser:id,name',
            'items',
            'tasks',
            'milestones.approvedBy:id,name',
        ]);

        // Attach related model summaries to tasks
        $this->attachRelatedSummaries($project->tasks);

        // Conditionally attach finance data
        $data = $project->toArray();
        $data['_permissions'] = [
            'can_comment'      => (bool) $participant?->can_comment,
            'can_upload_docs'  => (bool) $participant?->can_upload_docs,
            'can_approve'      => (bool) $participant?->can_approve,
            'can_view_finance' => (bool) $participant?->can_view_finance,
            'role'             => $participant?->role,
        ];

        return response()->json(['data' => $data]);
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN — Statistics
    // ─────────────────────────────────────────────────────────────

    /**
     * GET /admin/projects/statistics
     * Aggregate counts used by the dashboard.
     *
     * Returns:
     *   by_status        — { planning: n, active: n, … }
     *   by_priority      — { low: n, high: n, … }
     *   total            — int
     *   top_customers    — [ { id, first_name, last_name, email, project_count } ]
     *   created_per_month — [ { month: "YYYY-MM", count: n } ]  last 6 months
     */
    public function statistics(): JsonResponse
    {
        $this->authorize('viewAny', Project::class);

        // ── Status counts ────────────────────────────────────────
        $statusCounts = Project::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $byStatus = [];
        foreach (['planning', 'active', 'on_hold', 'completed', 'cancelled'] as $s) {
            $byStatus[$s] = (int) ($statusCounts[$s] ?? 0);
        }

        // ── Priority counts ──────────────────────────────────────
        $priorityCounts = Project::selectRaw('priority, COUNT(*) as count')
            ->whereNotNull('priority')
            ->groupBy('priority')
            ->pluck('count', 'priority');

        $byPriority = [];
        foreach (['urgent', 'high', 'medium', 'low'] as $p) {
            $byPriority[$p] = (int) ($priorityCounts[$p] ?? 0);
        }

        // ── Top customers (by project count, top 5) ──────────────
        $topCustomers = Project::selectRaw('customer_id, COUNT(*) as project_count')
            ->with('customer:id,first_name,last_name,email')
            ->groupBy('customer_id')
            ->orderByDesc('project_count')
            ->limit(5)
            ->get()
            ->map(fn ($row) => [
                'id'            => $row->customer?->id,
                'first_name'    => $row->customer?->first_name,
                'last_name'     => $row->customer?->last_name,
                'email'         => $row->customer?->email,
                'project_count' => (int) $row->project_count,
            ])
            ->filter(fn ($c) => $c['id'] !== null)
            ->values();

        // ── Projects created per month — last 6 months ───────────
        $months = collect();
        for ($i = 5; $i >= 0; $i--) {
            $months->push(now()->subMonths($i)->format('Y-m'));
        }

        $rawCounts = Project::selectRaw("DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count")
            ->where('created_at', '>=', now()->subMonths(5)->startOfMonth())
            ->groupBy('month')
            ->pluck('count', 'month');

        $createdPerMonth = $months->map(fn ($m) => [
            'month' => $m,
            'count' => (int) ($rawCounts[$m] ?? 0),
        ])->values();

        // ── Overdue projects (past target_end_date, not completed/cancelled) ─
        $overdueCount = Project::whereNotNull('target_end_date')
            ->where('target_end_date', '<', now())
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->count();

        // ── Unassigned (no owner_admin_id set) ───────────────────
        $unassignedCount = Project::whereNull('owner_admin_id')->count();

        // ── Overdue milestones (due_date passed, not completed/approved) ─────
        $overdueMilestones = \App\Models\ProjectMilestone::whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereNotIn('status', ['completed', 'approved'])
            ->count();

        return response()->json([
            'data' => [
                // Nested shape ProjectStatsBar expects
                'totals' => [
                    'all'        => array_sum($byStatus),
                    'active'     => $byStatus['active'],
                    'completed'  => $byStatus['completed'],
                    'overdue'    => $overdueCount,
                    'unassigned' => $unassignedCount,
                ],
                'milestones' => [
                    'overdue' => $overdueMilestones,
                ],
                // Flat fields used by the dashboard breakdown panels / chart
                'by_status'         => $byStatus,
                'by_priority'       => $byPriority,
                'top_customers'     => $topCustomers,
                'created_per_month' => $createdPerMonth,
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    private function generateProjectNumber(): string
    {
        $year = now()->year;
        $count = Project::withTrashed()
            ->where('project_number', 'like', "PRJ-{$year}-%")
            ->count();
        return sprintf('PRJ-%d-%04d', $year, $count + 1);
    }
}