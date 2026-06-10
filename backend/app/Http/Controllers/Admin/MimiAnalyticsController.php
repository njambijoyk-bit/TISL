<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MimiBlockedActor;
use App\Models\MimiQueryLog;
use App\Models\MimiSession;
use App\Services\Chat\MimiBlockService;
use App\Services\Chat\MimiQueryLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MimiAnalyticsController extends Controller
{
    public function __construct(
        private readonly MimiBlockService    $blockService,
        private readonly MimiQueryLogService $queryLogService,
    ) {}

    // ── Sessions ──────────────────────────────────────────────────────────────

    public function sessions(Request $request): JsonResponse
    {
        $request->validate([
            'actor_type' => 'nullable|in:customer,staff,guest',
            'status'     => 'nullable|in:active,ended,error,blocked',
            'from'       => 'nullable|date',
            'to'         => 'nullable|date',
            'per_page'   => 'nullable|integer|min:10|max:100',
        ]);

        $sessions = MimiSession::query()
            ->when($request->actor_type, fn($q) => $q->where('actor_type', $request->actor_type))
            ->when($request->status,     fn($q) => $q->where('status', $request->status))
            ->when($request->from,       fn($q) => $q->where('started_at', '>=', $request->from))
            ->when($request->to,         fn($q) => $q->where('started_at', '<=', $request->to . ' 23:59:59'))
            ->when($request->search,     fn($q) => $q->where(function ($q) use ($request) {
                $q->where('actor_display_name', 'like', "%{$request->search}%")
                  ->orWhere('customer_number', 'like', "%{$request->search}%")
                  ->orWhere('ip_address', 'like', "%{$request->search}%")
                  ->orWhere('session_token', $request->search);
            }))
            ->orderByDesc('started_at')
            ->paginate($request->per_page ?? 25);

        return response()->json($sessions);
    }

    public function sessionDetail(int $id): JsonResponse
    {
        $session = MimiSession::with(['customer', 'user', 'blockedBy'])
            ->findOrFail($id);

        $logs = MimiQueryLog::where('session_id', $id)
            ->orderBy('queried_at')
            ->get();

        return response()->json([
            'session' => $session,
            'logs'    => $logs,
        ]);
    }

    // ── Query Logs ────────────────────────────────────────────────────────────

    public function queries(Request $request): JsonResponse
    {
        $request->validate([
            'actor_type'      => 'nullable|in:customer,staff,guest',
            'response_status' => 'nullable|in:success,rate_limited,api_error,connection_error,blocked,harmful',
            'is_harmful'      => 'nullable|boolean',
            'is_flagged'      => 'nullable|boolean',
            'from'            => 'nullable|date',
            'to'              => 'nullable|date',
            'customer_id'     => 'nullable|integer',
            'per_page'        => 'nullable|integer|min:10|max:100',
        ]);

        $logs = MimiQueryLog::query()
            ->when($request->actor_type,      fn($q) => $q->where('actor_type', $request->actor_type))
            ->when($request->response_status, fn($q) => $q->where('response_status', $request->response_status))
            ->when($request->filled('is_harmful'), fn($q) => $q->where('is_harmful', $request->boolean('is_harmful')))
            ->when($request->filled('is_flagged'), fn($q) => $q->where('is_flagged', $request->boolean('is_flagged')))
            ->when($request->customer_id,     fn($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->from,            fn($q) => $q->where('queried_at', '>=', $request->from))
            ->when($request->to,              fn($q) => $q->where('queried_at', '<=', $request->to . ' 23:59:59'))
            ->when($request->search,          fn($q) => $q->where('query', 'like', "%{$request->search}%"))
            ->orderByDesc('queried_at')
            ->paginate($request->per_page ?? 25);

        return response()->json($logs);
    }

    public function flagQuery(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason'   => 'required|string|max:300',
            'unflag'   => 'nullable|boolean',
        ]);

        if ($request->boolean('unflag')) {
            $log = $this->queryLogService->unflagQuery($id);
        } else {
            $log = $this->queryLogService->flagQuery($id, $request->user(), $request->reason);
        }

        return response()->json(['log' => $log]);
    }

    // ── Block management ──────────────────────────────────────────────────────

    public function blocks(Request $request): JsonResponse
    {
        $blocks = MimiBlockedActor::with(['customer', 'user', 'blockedByUser'])
            ->when($request->active_only !== 'false', fn($q) => $q->active())
            ->when($request->actor_type, fn($q) => $q->where('actor_type', $request->actor_type))
            ->orderByDesc('blocked_at')
            ->paginate($request->per_page ?? 25);

        return response()->json($blocks);
    }

    public function searchActors(Request $request): JsonResponse
    {
        $q    = $request->string('q')->trim();
        $type = $request->query('type', 'customer'); // 'customer' | 'staff'

        if ($q->isEmpty() || $q->length() < 2) {
            return response()->json([]);
        }

        if ($type === 'customer') {
            $results = \App\Models\Customer::query()
                ->where(fn($query) => $query
                    ->where('first_name', 'like', "%{$q}%")
                    ->orWhere('last_name',  'like', "%{$q}%")
                    ->orWhere('email',      'like', "%{$q}%")
                    ->orWhere('customer_number', 'like', "%{$q}%")
                )
                ->select('id', 'first_name', 'last_name', 'email', 'customer_number')
                ->limit(10)
                ->get()
                ->map(fn($c) => [
                    'id'    => $c->id,
                    'label' => "{$c->first_name} {$c->last_name} — {$c->customer_number}",
                    'sub'   => $c->email,
                ]);
        } else {
            $results = \App\Models\User::query()
                ->where(fn($query) => $query
                    ->where('name',  'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                )
                ->whereIn('role', ['admin', 'super_admin', 'staff', 'finance', 'sales_rep'])
                ->select('id', 'name', 'email', 'role')
                ->limit(10)
                ->get()
                ->map(fn($u) => [
                    'id'    => $u->id,
                    'label' => $u->name,
                    'sub'   => "{$u->email} · {$u->role}",
                ]);
        }

        return response()->json($results);
    }

    public function block(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'actor_type'  => 'required|in:customer,guest_ip,staff',
            'customer_id' => 'required_if:actor_type,customer|nullable|exists:customers,id',
            'user_id'     => 'required_if:actor_type,staff|nullable|exists:users,id',
            'ip_address'  => 'required_if:actor_type,guest_ip|nullable|ip',
            'reason'      => 'nullable|string|max:500',
            'notes'       => 'nullable|string|max:1000',
            'expires_at'  => 'nullable|date|after:now',
        ]);

        $block = $this->blockService->blockActor($validated, $request->user());

        $this->markSessionsBlocked($request, $block);

        return response()->json(['block' => $block], 201);
    }

    public function unblock(int $id): JsonResponse
    {
        $this->blockService->unblock($id);
        return response()->json(['message' => 'Block removed successfully.']);
    }

    // ── Reports ───────────────────────────────────────────────────────────────

    public function reports(Request $request): JsonResponse
    {
        $from = $request->from ? now()->parse($request->from) : now()->subDays(30);
        $to   = $request->to ? now()->parse($request->to)->endOfDay() : now();

        // Total queries
        $totals = MimiQueryLog::whereBetween('queried_at', [$from, $to])
            ->selectRaw('
                COUNT(*) as total_queries,
                SUM(CASE WHEN response_status = "success"          THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN is_harmful = 1                       THEN 1 ELSE 0 END) as harmful,
                SUM(CASE WHEN is_flagged = 1                       THEN 1 ELSE 0 END) as flagged,
                SUM(CASE WHEN response_status = "rate_limited"     THEN 1 ELSE 0 END) as rate_limited,
                SUM(CASE WHEN response_status = "api_error"        THEN 1 ELSE 0 END) as api_errors,
                SUM(CASE WHEN response_status = "connection_error" THEN 1 ELSE 0 END) as connection_errors,
                SUM(CASE WHEN response_status = "blocked"          THEN 1 ELSE 0 END) as blocked,
                AVG(response_time_ms) as avg_response_ms
            ')
            ->first();

        // Queries per day
        $queriesPerDay = MimiQueryLog::whereBetween('queried_at', [$from, $to])
            ->selectRaw('DATE(queried_at) as date, COUNT(*) as total')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // Breakdown by actor type
        $byActorType = MimiQueryLog::whereBetween('queried_at', [$from, $to])
            ->selectRaw('actor_type, COUNT(*) as total')
            ->groupBy('actor_type')
            ->get();

        // Top harm categories
        $harmCategories = MimiQueryLog::whereBetween('queried_at', [$from, $to])
            ->where('is_harmful', true)
            ->whereNotNull('harm_category')
            ->selectRaw('harm_category, COUNT(*) as total')
            ->groupBy('harm_category')
            ->orderByDesc('total')
            ->get();

        // Sessions summary
        $sessionStats = MimiSession::whereBetween('started_at', [$from, $to])
            ->selectRaw('
                COUNT(*) as total_sessions,
                SUM(CASE WHEN actor_type = "customer" THEN 1 ELSE 0 END) as customer_sessions,
                SUM(CASE WHEN actor_type = "staff"    THEN 1 ELSE 0 END) as staff_sessions,
                SUM(CASE WHEN actor_type = "guest"    THEN 1 ELSE 0 END) as guest_sessions,
                SUM(CASE WHEN status = "blocked"      THEN 1 ELSE 0 END) as blocked_sessions,
                AVG(message_count) as avg_messages_per_session
            ')
            ->first();

        // Age distribution (customers only, non-null ages)
        $ageDistribution = MimiSession::whereBetween('started_at', [$from, $to])
            ->where('actor_type', 'customer')
            ->whereNotNull('customer_age')
            ->selectRaw('
                SUM(CASE WHEN customer_age < 18              THEN 1 ELSE 0 END) as under_18,
                SUM(CASE WHEN customer_age BETWEEN 18 AND 24 THEN 1 ELSE 0 END) as age_18_24,
                SUM(CASE WHEN customer_age BETWEEN 25 AND 34 THEN 1 ELSE 0 END) as age_25_34,
                SUM(CASE WHEN customer_age BETWEEN 35 AND 44 THEN 1 ELSE 0 END) as age_35_44,
                SUM(CASE WHEN customer_age BETWEEN 45 AND 54 THEN 1 ELSE 0 END) as age_45_54,
                SUM(CASE WHEN customer_age >= 55             THEN 1 ELSE 0 END) as age_55_plus
            ')
            ->first();

        // Top blocked actors
        $activeBlocks = MimiBlockedActor::active()
            ->with(['customer', 'user', 'blockedByUser'])
            ->latest('blocked_at')
            ->limit(10)
            ->get();

        return response()->json([
            'period'           => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'totals'           => $totals,
            'queries_per_day'  => $queriesPerDay,
            'by_actor_type'    => $byActorType,
            'harm_categories'  => $harmCategories,
            'session_stats'    => $sessionStats,
            'age_distribution' => $ageDistribution,
            'active_blocks'    => $activeBlocks,
        ]);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private function markSessionsBlocked(Request $request, MimiBlockedActor $block): void
    {
        $query = MimiSession::where('status', 'active');

        match ($block->actor_type) {
            'customer' => $query->where('customer_id', $block->customer_id),
            'staff'    => $query->where('user_id', $block->user_id),
            'guest_ip' => $query->where('ip_address', $block->ip_address),
            default    => null,
        };

        $query->update([
            'status'       => 'blocked',
            'is_blocked'   => true,
            'block_reason' => $block->reason,
            'blocked_at'   => now(),
            'blocked_by'   => $request->user()->id,
            'ended_at'     => now(),
        ]);
    }
}
