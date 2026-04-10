<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Quote;
use App\Models\QuoteRequest;
use App\Models\Project;
use App\Models\ProjectParticipant;
use App\Models\ProjectTask;
use App\Models\ProjectMilestone;
use App\Models\User;
use App\Models\Ticket;

class WorkController extends Controller
{
    public function myDashboard(Request $request)
    {
        $user = $request->user();

        try {
            return response()->json([
                'employee'     => $this->resolveEmployee($user),
                'assignments'  => $this->myAssignments($user),
                'deadlines'    => $this->myDeadlines($user),
                'activity'     => $this->myActivity($user),
            ]);
        } catch (\Exception $e) {
            Log::error('WorkController::myDashboard failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to load dashboard',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function myAssignmentsEndpoint(Request $request)
    {
        $user = $request->user();

        try {
            return response()->json($this->myAssignments($user));
        } catch (\Exception $e) {
            Log::error('WorkController::myAssignmentsEndpoint failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage()
            ]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function myDeadlinesEndpoint(Request $request)
    {
        $user = $request->user();

        try {
            return response()->json($this->myDeadlines($user));
        } catch (\Exception $e) {
            Log::error('WorkController::myDeadlinesEndpoint failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage()
            ]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function teamOverview(Request $request)
    {
        $this->authorizeRole($request->user(), ['super_admin', 'admin']);

        try {
            return response()->json([
                'team_load'   => $this->teamLoad(),
                'unassigned'  => $this->unassignedItems(),
                'deadlines'   => $this->teamDeadlines(),
                'activity'    => $this->teamActivity(),
            ]);
        } catch (\Exception $e) {
            Log::error('WorkController::teamOverview failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    // =========================================================================
    // PRIVATE — MY (personal) helpers
    // =========================================================================

    private function resolveEmployee(User $user): ?array
    {
        $employee = Employee::with(['manager.user', 'subordinates.user'])
            ->where('user_id', $user->id)
            ->first();

        return $employee ? $employee->toArray() : null;
    }

    private function myAssignments(User $user): array
    {
        $uid = $user->id;

        // ── Customers ──────────────
        $customers = Customer::where('assigned_sales_rep', $uid)
            ->select('id', 'first_name', 'last_name', 'email', 'status', 'tier as customer_tier')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get()
            ->map(fn($c) => array_merge($c->toArray(), [
                'full_name' => trim("{$c->first_name} {$c->last_name}"),
            ]));

        // ── Orders ─────────────────
        $orders = Order::with(['customer:id,first_name,last_name'])
            ->where('assigned_to', $uid)
            ->select('id', 'order_number', 'status', 'total', 'currency', 'customer_id', 'assigned_to', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        // ── Quotes ─────────────────
        $quotes = Quote::with(['customer:id,first_name,last_name'])
            ->where('assigned_to', $uid)
            ->select('id', 'quote_number', 'status', 'total', 'currency', 'customer_id', 'assigned_to', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        // ── Quote requests ─────────
        $quoteRequests = QuoteRequest::with(['customer:id,first_name,last_name'])
            ->where('assigned_to', $uid)
            ->select('id', 'request_number', 'request_title', 'status', 'priority', 'customer_id', 'assigned_to', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        // ── Projects ───────────────
        $participantProjectIds = ProjectParticipant::where('admin_user_id', $uid)
            ->where('participant_type', 'admin')
            ->pluck('project_id');

        $projects = Project::with(['customer:id,first_name,last_name'])
            ->where(function ($q) use ($uid, $participantProjectIds) {
                $q->where('owner_admin_id', $uid)
                  ->orWhereIn('id', $participantProjectIds);
            })
            ->select('id', 'project_number', 'title', 'status', 'target_end_date', 'customer_id', 'owner_admin_id', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get()
            ->map(fn($p) => array_merge($p->toArray(), [
                'customer_name' => $p->customer
                    ? trim("{$p->customer->first_name} {$p->customer->last_name}")
                    : null,
            ]));

        // ── Tasks ──────────────────
        $tasks = ProjectTask::with(['project:id,title,project_number'])
            ->where('assigned_to', $uid)
            ->whereNotIn('status', ['done'])
            ->select('id', 'project_id', 'title', 'status', 'priority', 'due_date', 'assigned_to', 'created_at')
            ->orderByRaw("FIELD(priority, 'urgent', 'high', 'medium', 'low')")
            ->orderBy('due_date')
            ->limit(20)
            ->get();

        // ── Milestones ─────────────
        $myProjectIds = $projects->pluck('id');
        $milestones = ProjectMilestone::with(['project:id,title,project_number'])
            ->whereIn('project_id', $myProjectIds)
            ->whereNotIn('status', ['completed', 'approved'])
            ->select('id', 'project_id', 'title', 'status', 'due_date', 'amount', 'currency', 'created_at')
            ->orderBy('due_date')
            ->limit(20)
            ->get();

        // ── Tickets ────────────────
        $tickets = Ticket::with(['customer:id,first_name,last_name'])
            ->where('assigned_to', $uid)
            ->whereNotIn('status', ['resolved', 'closed'])
            ->select('id', 'ticket_number', 'subject', 'status', 'priority', 'category', 'customer_id', 'assigned_to', 'created_at')
            ->orderByRaw("FIELD(priority, 'urgent', 'high', 'medium', 'low')")
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        return [
            'customers'     => $customers,
            'orders'        => $orders,
            'quotes'        => $quotes,
            'quoteRequests' => $quoteRequests,
            'projects'      => $projects,
            'tasks'         => $tasks,
            'milestones'    => $milestones,
            'tickets'       => $tickets,
            'counts' => [
                'customers'     => $customers->count(),
                'orders'        => $orders->count(),
                'quotes'        => $quotes->count(),
                'quoteRequests' => $quoteRequests->count(),
                'projects'      => $projects->count(),
                'tasks'         => $tasks->count(),
                'milestones'    => $milestones->count(),
                'tickets'       => $tickets->count(),
            ],
        ];
    }

    private function myDeadlines(User $user): array
    {
        $uid  = $user->id;
        $now  = now();
        $soon = now()->addDays(30);

        $participantProjectIds = ProjectParticipant::where('admin_user_id', $uid)
            ->where('participant_type', 'admin')
            ->pluck('project_id');

        // Projects with upcoming target end dates
        $projects = Project::where(function ($q) use ($uid, $participantProjectIds) {
                $q->where('owner_admin_id', $uid)
                  ->orWhereIn('id', $participantProjectIds);
            })
            ->whereBetween('target_end_date', [$now, $soon])
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->select('id', 'title', 'status', 'target_end_date')
            ->orderBy('target_end_date')
            ->get()
            ->map(fn($p) => [
                'type'     => 'project',
                'id'       => $p->id,
                'label'    => $p->title,
                'deadline' => $p->target_end_date,
                'status'   => $p->status,
                'url'      => "/admin/projects/{$p->id}",
            ]);

        // Quotes expiring within 14 days - ONLY if valid_until column exists
        $quotes = collect();
        try {
            $quotes = Quote::where('assigned_to', $uid)
                ->whereBetween('valid_until', [$now, now()->addDays(14)])
                ->whereNotIn('status', ['approved', 'rejected', 'expired', 'converted'])
                ->select('id', 'quote_number', 'status', 'valid_until')
                ->orderBy('valid_until')
                ->get()
                ->map(fn($q) => [
                    'type'     => 'quote',
                    'id'       => $q->id,
                    'label'    => $q->quote_number,
                    'deadline' => $q->valid_until,
                    'status'   => $q->status,
                    'url'      => "/admin/quotes/{$q->id}",
                ]);
        } catch (\Exception $e) {
            Log::warning('Quote deadlines query failed - valid_until column may be missing', ['error' => $e->getMessage()]);
        }

        // Milestones due within 30 days
        $myProjectIds = array_unique(
            array_merge(
                Project::where('owner_admin_id', $uid)->pluck('id')->toArray(),
                $participantProjectIds->toArray()
            )
        );

        $milestones = ProjectMilestone::with(['project:id,title'])
            ->whereIn('project_id', $myProjectIds)
            ->whereBetween('due_date', [$now, $soon])
            ->whereNotIn('status', ['completed', 'approved'])
            ->select('id', 'project_id', 'title', 'status', 'due_date', 'amount', 'currency')
            ->orderBy('due_date')
            ->get()
            ->map(fn($m) => [
                'type'     => 'milestone',
                'id'       => $m->id,
                'label'    => $m->title,
                'deadline' => $m->due_date,
                'status'   => $m->status,
                'project'  => $m->project?->title,
                'amount'   => $m->amount,
                'currency' => $m->currency,
                'url'      => "/admin/projects/{$m->project_id}",
            ]);

        // Tasks due within 14 days
        $tasksDue = ProjectTask::with(['project:id,title'])
            ->where('assigned_to', $uid)
            ->whereBetween('due_date', [$now, now()->addDays(14)])
            ->whereNotIn('status', ['done'])
            ->select('id', 'project_id', 'title', 'status', 'priority', 'due_date')
            ->orderBy('due_date')
            ->get()
            ->map(fn($t) => [
                'type'     => 'task',
                'id'       => $t->id,
                'label'    => $t->title,
                'deadline' => $t->due_date,
                'status'   => $t->status,
                'priority' => $t->priority,
                'project'  => $t->project?->title,
                'url'      => "/admin/projects/{$t->project_id}",
            ]);

        // Tickets needing attention (open/in_progress, sorted by priority and age)
        $tickets = Ticket::with(['customer:id,first_name,last_name'])
            ->where('assigned_to', $uid)
            ->whereIn('status', ['open', 'in_progress', 'waiting_customer'])
            ->select('id', 'ticket_number', 'subject', 'status', 'priority', 'customer_id', 'created_at')
            ->orderByRaw("FIELD(priority, 'urgent', 'high', 'medium', 'low')")
            ->orderBy('created_at', 'asc')
            ->limit(20)
            ->get()
            ->map(fn($t) => [
                'type'     => 'ticket',
                'id'       => $t->id,
                'label'    => $t->ticket_number,
                'subject'  => $t->subject,
                'status'   => $t->status,
                'priority' => $t->priority,
                'customer' => $t->customer ? trim("{$t->customer->first_name} {$t->customer->last_name}") : null,
                'url'      => "/admin/tickets/{$t->id}",
            ]);

        return [
            'projects'   => $projects,
            'quotes'     => $quotes,
            'milestones' => $milestones,
            'tasks'      => $tasksDue,
            'tickets'    => $tickets,
        ];
    }

    /**
     * FIXED: myActivity - removed conflicting with() clause
     */
    private function myActivity(User $user): array
    {
        $uid = $user->id;

        // Fetch assigned user ONCE, not inside the loop
        $assignedUser = ['id' => $user->id, 'name' => $user->name];

        $orderActivity = Order::where('assigned_to', $uid)
            ->select('id', 'order_number as reference', 'status', 'updated_at',
                DB::raw("'order' as type"),
                DB::raw("CONCAT('/admin/orders/', id) as url"))
            ->orderBy('updated_at', 'desc')
            ->limit(10)
            ->get()
            ->map(fn($o) => array_merge($o->toArray(), ['assignedTo' => $assignedUser]));

        $quoteActivity = Quote::where('assigned_to', $uid)
            ->select('id', 'quote_number as reference', 'status', 'updated_at',
                DB::raw("'quote' as type"),
                DB::raw("CONCAT('/admin/quotes/', id) as url"))
            ->orderBy('updated_at', 'desc')
            ->limit(10)
            ->get()
            ->map(fn($q) => array_merge($q->toArray(), ['assignedTo' => $assignedUser]));

        return $orderActivity->concat($quoteActivity)
            ->sortByDesc('updated_at')
            ->take(20)
            ->values()
            ->toArray();
    }

    // =========================================================================
    // PRIVATE — TEAM (super admin) helpers
    // =========================================================================

    private function teamLoad(): array
    {
        $staffRoles = ['admin', 'super_admin', 'manager', 'sales_rep'];

        $staff = User::whereIn('role', $staffRoles)
            ->select('id', 'name', 'email', 'role')
            ->get();

        $staffIds = $staff->pluck('id');

        // ── Bulk fetch all counts in ONE query each ──────────────────────────

        $customerCounts = Customer::whereIn('assigned_sales_rep', $staffIds)
            ->selectRaw('assigned_sales_rep as user_id, COUNT(*) as count')
            ->groupBy('assigned_sales_rep')
            ->pluck('count', 'user_id');

        $orderCounts = Order::whereIn('assigned_to', $staffIds)
            ->whereNotIn('status', ['delivered', 'cancelled'])
            ->selectRaw('assigned_to as user_id, COUNT(*) as count')
            ->groupBy('assigned_to')
            ->pluck('count', 'user_id');

        $quoteCounts = Quote::whereIn('assigned_to', $staffIds)
            ->whereNotIn('status', ['approved', 'rejected', 'expired', 'converted'])
            ->selectRaw('assigned_to as user_id, COUNT(*) as count')
            ->groupBy('assigned_to')
            ->pluck('count', 'user_id');

        $quoteRequestCounts = QuoteRequest::whereIn('assigned_to', $staffIds)
            ->whereNotIn('status', ['quoted', 'rejected', 'expired'])
            ->selectRaw('assigned_to as user_id, COUNT(*) as count')
            ->groupBy('assigned_to')
            ->pluck('count', 'user_id');

        $taskCounts = ProjectTask::whereIn('assigned_to', $staffIds)
            ->whereNotIn('status', ['done'])
            ->selectRaw('assigned_to as user_id, COUNT(*) as count')
            ->groupBy('assigned_to')
            ->pluck('count', 'user_id');

        // Ticket counts per staff member
        $ticketCounts = Ticket::whereIn('assigned_to', $staffIds)
            ->whereNotIn('status', ['resolved', 'closed'])
            ->selectRaw('assigned_to as user_id, COUNT(*) as count')
            ->groupBy('assigned_to')
            ->pluck('count', 'user_id');

        // ── Projects: owned + participant (two queries, not N) ───────────────

        $ownedProjects = Project::whereIn('owner_admin_id', $staffIds)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->selectRaw('owner_admin_id as user_id, id')
            ->get()
            ->groupBy('user_id');

        $participantMap = ProjectParticipant::whereIn('admin_user_id', $staffIds)
            ->where('participant_type', 'admin')
            ->select('admin_user_id as user_id', 'project_id')
            ->get()
            ->groupBy('user_id');

        // Build per-user project id sets
        $projectIdsByUser = [];
        foreach ($staffIds as $uid) {
            $owned       = $ownedProjects->get($uid, collect())->pluck('id')->toArray();
            $participated = $participantMap->get($uid, collect())->pluck('project_id')->toArray();
            $projectIdsByUser[$uid] = array_unique(array_merge($owned, $participated));
        }

        // Milestone counts — one query using all project ids
        $allProjectIds = collect($projectIdsByUser)->flatten()->unique()->values();
        $milestoneCounts = ProjectMilestone::whereIn('project_id', $allProjectIds)
            ->whereNotIn('status', ['completed', 'approved'])
            ->selectRaw('project_id, COUNT(*) as count')
            ->groupBy('project_id')
            ->pluck('count', 'project_id');

        // ── Employees — one query ────────────────────────────────────────────

        $employees = Employee::whereIn('user_id', $staffIds)
            ->select('user_id', 'job_title', 'department', 'status', 'employee_number')
            ->get()
            ->keyBy('user_id');

        // ── Assemble result without any more queries ─────────────────────────

        return $staff->map(function (User $u) use (
            $customerCounts, $orderCounts, $quoteCounts, $quoteRequestCounts,
            $taskCounts, $ticketCounts, $projectIdsByUser, $milestoneCounts, $employees
        ) {
            $myProjectIds = $projectIdsByUser[$u->id] ?? [];

            $milestoneCount = collect($myProjectIds)
                ->sum(fn($pid) => $milestoneCounts->get($pid, 0));

            return [
                'user'     => $u->only(['id', 'name', 'email', 'role']),
                'employee' => $employees->get($u->id),
                'counts' => [
                    'customers'     => $customerCounts->get($u->id, 0),
                    'orders'        => $orderCounts->get($u->id, 0),
                    'quotes'        => $quoteCounts->get($u->id, 0),
                    'quoteRequests' => $quoteRequestCounts->get($u->id, 0),
                    'projects'      => count($myProjectIds),
                    'tasks'         => $taskCounts->get($u->id, 0),
                    'milestones'    => $milestoneCount,
                    'tickets'       => $ticketCounts->get($u->id, 0),
                ],
            ];
        })->toArray();
    }

    private function unassignedItems(): array
    {
        $orders = Order::whereNull('assigned_to')
            ->whereNotIn('status', ['delivered', 'cancelled'])
            ->with(['customer:id,first_name,last_name'])
            ->select('id', 'order_number', 'status', 'total', 'currency', 'customer_id', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $quotes = Quote::whereNull('assigned_to')
            ->whereNotIn('status', ['approved', 'rejected', 'expired', 'converted'])
            ->with(['customer:id,first_name,last_name'])
            ->select('id', 'quote_number', 'status', 'total', 'currency', 'customer_id', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $quoteRequests = QuoteRequest::whereNull('assigned_to')
            ->whereNotIn('status', ['quoted', 'rejected', 'expired'])
            ->with(['customer:id,first_name,last_name'])
            ->select('id', 'request_number', 'request_title', 'status', 'priority', 'customer_id', 'created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $tasks = ProjectTask::whereNull('assigned_to')
            ->whereNotIn('status', ['done'])
            ->with(['project:id,title,project_number'])
            ->select('id', 'project_id', 'title', 'status', 'priority', 'due_date', 'created_at')
            ->orderByRaw("FIELD(priority, 'urgent', 'high', 'medium', 'low')")
            ->limit(20)
            ->get();

        // Unassigned tickets (open/in_progress only)
        $tickets = Ticket::whereNull('assigned_to')
            ->whereNotIn('status', ['resolved', 'closed'])
            ->with(['customer:id,first_name,last_name'])
            ->select('id', 'ticket_number', 'subject', 'status', 'priority', 'category', 'customer_id', 'created_at')
            ->orderByRaw("FIELD(priority, 'urgent', 'high', 'medium', 'low')")
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        return [
            'orders'        => $orders,
            'quotes'        => $quotes,
            'quoteRequests' => $quoteRequests,
            'tasks'         => $tasks,
            'tickets'       => $tickets,
            'counts' => [
                'orders'        => $orders->count(),
                'quotes'        => $quotes->count(),
                'quoteRequests' => $quoteRequests->count(),
                'tasks'         => $tasks->count(),
                'tickets'       => $tickets->count(),
            ],
        ];
    }

    private function teamDeadlines(): array
    {
        $now  = now();
        $soon = now()->addDays(30);

        $projects = Project::with(['customer:id,first_name,last_name', 'ownerAdmin:id,name'])
            ->whereBetween('target_end_date', [$now, $soon])
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->select('id', 'title', 'status', 'target_end_date', 'customer_id', 'owner_admin_id')
            ->orderBy('target_end_date')
            ->limit(30)
            ->get()
            ->map(fn($p) => [
                'type'     => 'project',
                'id'       => $p->id,
                'label'    => $p->title,
                'deadline' => $p->target_end_date,
                'status'   => $p->status,
                'owner'    => $p->ownerAdmin?->name,
                'customer' => $p->customer ? trim("{$p->customer->first_name} {$p->customer->last_name}") : null,
                'url'      => "/admin/projects/{$p->id}",
            ]);

        // Quotes with valid_until - wrapped in try-catch
        $quotes = collect();
        try {
            $quotes = Quote::with(['customer:id,first_name,last_name', 'assignedTo:id,name'])
                ->whereBetween('valid_until', [$now, now()->addDays(14)])
                ->whereNotIn('status', ['approved', 'rejected', 'expired', 'converted'])
                ->select('id', 'quote_number', 'status', 'valid_until', 'customer_id', 'assigned_to')
                ->orderBy('valid_until')
                ->limit(30)
                ->get()
                ->map(fn($q) => [
                    'type'       => 'quote',
                    'id'         => $q->id,
                    'label'      => $q->quote_number,
                    'deadline'   => $q->valid_until,
                    'status'     => $q->status,
                    'assignedTo' => $q->assignedTo?->name,
                    'url'        => "/admin/quotes/{$q->id}",
                ]);
        } catch (\Exception $e) {
            Log::warning('teamDeadlines quotes query failed', ['error' => $e->getMessage()]);
        }

        $milestones = ProjectMilestone::with(['project:id,title,project_number'])
            ->whereBetween('due_date', [$now, $soon])
            ->whereNotIn('status', ['completed', 'approved'])
            ->select('id', 'project_id', 'title', 'status', 'due_date', 'amount', 'currency')
            ->orderBy('due_date')
            ->limit(30)
            ->get()
            ->map(fn($m) => [
                'type'     => 'milestone',
                'id'       => $m->id,
                'label'    => $m->title,
                'deadline' => $m->due_date,
                'status'   => $m->status,
                'project'  => $m->project?->title,
                'amount'   => $m->amount,
                'currency' => $m->currency,
                'url'      => "/admin/projects/{$m->project_id}",
            ]);

        $tasks = ProjectTask::with(['project:id,title', 'assignedTo:id,name'])
            ->whereBetween('due_date', [$now, now()->addDays(14)])
            ->whereNotIn('status', ['done'])
            ->select('id', 'project_id', 'title', 'status', 'priority', 'due_date', 'assigned_to')
            ->orderBy('due_date')
            ->limit(30)
            ->get()
            ->map(fn($t) => [
                'type'       => 'task',
                'id'         => $t->id,
                'label'      => $t->title,
                'deadline'   => $t->due_date,
                'status'     => $t->status,
                'priority'   => $t->priority,
                'project'    => $t->project?->title,
                'assignedTo' => $t->assignedTo?->name,
                'url'        => "/admin/projects/{$t->project_id}",
            ]);

        return [
            'projects'   => $projects,
            'quotes'     => $quotes,
            'milestones' => $milestones,
            'tasks'      => $tasks,
        ];
    }

    /**
     * FIXED: teamActivity - removed conflicting with() clause
     */
    private function teamActivity(): array
    {
        $orders = Order::select('id', 'order_number as reference', 'status', 'updated_at', 'assigned_to',
                DB::raw("'order' as type"),
                DB::raw("CONCAT('/admin/orders/', id) as url"))
            ->orderBy('updated_at', 'desc')->limit(15)->get();

        $quotes = Quote::select('id', 'quote_number as reference', 'status', 'updated_at', 'assigned_to',
                DB::raw("'quote' as type"),
                DB::raw("CONCAT('/admin/quotes/', id) as url"))
            ->orderBy('updated_at', 'desc')->limit(15)->get();

        $combined = $orders->concat($quotes);

        // One query to load all assigned users
        $userIds = $combined->pluck('assigned_to')->filter()->unique();
        $users = User::whereIn('id', $userIds)->select('id', 'name')->get()->keyBy('id');

        return $combined
            ->map(fn($item) => array_merge($item->toArray(), [
                'assignedTo' => ($u = $users->get($item->assigned_to))
                    ? ['id' => $u->id, 'name' => $u->name]
                    : null,
            ]))
            ->sortByDesc('updated_at')
            ->take(30)
            ->values()
            ->toArray();
    }

    // =========================================================================
    // UTILITY
    // =========================================================================

    private function authorizeRole(User $user, array $roles): void
    {
        if (! in_array($user->role, $roles)) {
            abort(403, 'Insufficient permissions.');
        }
    }
}