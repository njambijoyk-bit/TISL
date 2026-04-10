<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivity;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectActivityController extends Controller
{
    use AuthorizesRequests;

    /**
     * GET /admin/projects/{project}/activity
     * Paginated activity feed for a single project.
     */
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $activity = ProjectActivity::where('project_id', $project->id)
            ->with(['actor:id,name,email'])
            ->when($request->filled('action'),       fn($q) => $q->where('action', $request->action))
            ->when($request->filled('entity_type'),  fn($q) => $q->where('entity_type', $request->entity_type))
            ->when($request->filled('actor_user_id'),fn($q) => $q->where('actor_user_id', $request->actor_user_id))
            ->when($request->filled('from'),         fn($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),           fn($q) => $q->whereDate('created_at', '<=', $request->to))
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 25));

        return response()->json($activity);
    }

    /**
     * GET /admin/projects/statistics
     * Aggregated statistics across all projects for the admin dashboard.
     */
    public function statistics(): JsonResponse
    {
        $this->authorize('viewAny', Project::class);

        // Status breakdown
        $byStatus = DB::table('projects')
            ->whereNull('deleted_at')
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // Priority breakdown
        $byPriority = DB::table('projects')
            ->whereNull('deleted_at')
            ->selectRaw('priority, COUNT(*) as count')
            ->groupBy('priority')
            ->pluck('count', 'priority');

        // Total counts
        $totalProjects  = DB::table('projects')->whereNull('deleted_at')->count();
        $totalActive    = DB::table('projects')->whereNull('deleted_at')->whereIn('status', ['planning', 'active', 'on_hold'])->count();
        $totalCompleted = DB::table('projects')->whereNull('deleted_at')->where('status', 'completed')->count();
        $totalCancelled = DB::table('projects')->whereNull('deleted_at')->where('status', 'cancelled')->count();

        // Overdue: target_end_date passed and project still active
        $overdue = DB::table('projects')
            ->whereNull('deleted_at')
            ->whereNotNull('target_end_date')
            ->where('target_end_date', '<', now())
            ->whereIn('status', ['planning', 'active', 'on_hold'])
            ->count();

        // Overdue milestones across all projects
        $overdueMilestones = DB::table('project_milestones')
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereNotIn('status', ['completed', 'approved', 'rejected'])
            ->count();

        // Milestone status breakdown
        $milestonesByStatus = DB::table('project_milestones')
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // Task status breakdown
        $tasksByStatus = DB::table('project_tasks')
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // Projects created per month (last 6 months)
        $createdPerMonth = DB::table('projects')
            ->whereNull('deleted_at')
            ->where('created_at', '>=', now()->subMonths(6)->startOfMonth())
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count")
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        // Top 5 customers by project count
        $topCustomers = DB::table('projects')
            ->join('customers', 'projects.customer_id', '=', 'customers.id')
            ->whereNull('projects.deleted_at')
            ->selectRaw('customers.id, customers.name, COUNT(projects.id) as project_count')
            ->groupBy('customers.id', 'customers.name')
            ->orderByDesc('project_count')
            ->limit(5)
            ->get();

        // Unassigned projects (no owner_admin_id)
        $unassigned = DB::table('projects')
            ->whereNull('deleted_at')
            ->whereNull('owner_admin_id')
            ->whereIn('status', ['planning', 'active', 'on_hold'])
            ->count();

        return response()->json([
            'data' => [
                'totals' => [
                    'all'        => $totalProjects,
                    'active'     => $totalActive,
                    'completed'  => $totalCompleted,
                    'cancelled'  => $totalCancelled,
                    'overdue'    => $overdue,
                    'unassigned' => $unassigned,
                ],
                'by_status'   => $byStatus,
                'by_priority' => $byPriority,
                'milestones'  => [
                    'by_status' => $milestonesByStatus,
                    'overdue'   => $overdueMilestones,
                ],
                'tasks' => [
                    'by_status' => $tasksByStatus,
                ],
                'created_per_month' => $createdPerMonth,
                'top_customers'     => $topCustomers,
            ],
        ]);
    }
}