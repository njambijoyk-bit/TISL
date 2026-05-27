<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\AlgorithmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AlgorithmController extends Controller
{
    public function __construct(protected AlgorithmService $algorithm) {}

    // ── GET /admin/algorithm/config ──────────────────────────────────────
    // Returns current weights, toggles, and segment rules for the panel
    public function getConfig(): JsonResponse
    {
        $rows = DB::table('algorithm_config')
            ->whereIn('key', ['weights', 'signal_toggles', 'service_signals'])
            ->pluck('value', 'key')
            ->map(fn($v) => json_decode($v, true));

        $segmentRules = DB::table('algorithm_segment_rules')
            ->orderBy('id')
            ->get()
            ->map(fn($r) => [
                'id'            => $r->id,
                'name'          => $r->name,
                'condition'     => json_decode($r->condition_json, true),
                'boost_signal'  => $r->boost_signal,
                'boost_percent' => (float) $r->boost_percent,
                'action_label'  => $r->action_label,
                'is_active'     => (bool) $r->is_active,
            ]);

        return response()->json([
            'weights'        => $rows['weights']        ?? null,
            'signal_toggles' => $rows['signal_toggles'] ?? null,
            'service_signals'=> $rows['service_signals'] ?? null,
            'segment_rules'  => $segmentRules,
        ]);
    }

    // ── PUT /admin/algorithm/config ──────────────────────────────────────
    // Saves weights and toggles, then flushes the cache
    public function saveConfig(Request $request): JsonResponse
    {
        $request->validate([
            'weights'        => 'sometimes|array',
            'signal_toggles' => 'sometimes|array',
            'service_signals'=> 'sometimes|array',
        ]);

        $actor = $request->user()->id;
        $now   = now();

        foreach (['weights', 'signal_toggles', 'service_signals'] as $key) {
            if (!$request->filled($key)) continue;

            DB::table('algorithm_config')->updateOrInsert(
                ['key' => $key],
                [
                    'value'      => json_encode($request->input($key)),
                    'updated_by' => $actor,
                    'updated_at' => $now,
                ]
            );
        }

        $this->algorithm->flushConfigCache();

        return response()->json(['message' => 'Algorithm config saved.']);
    }

    // ── POST /admin/algorithm/run ────────────────────────────────────────
    // Replaces SSH — runs the batch scorer directly from the browser
    // Gated to super_admin only (see routes below)
    public function runScoring(Request $request): JsonResponse
    {
        $customerId = $request->input('customer_id');
        set_time_limit(0);                          // override host PHP timeout

        $start   = microtime(true);
        $scored  = 0;
        $failed  = 0;
        $actorId = $request->user()->id;

        if ($customerId) {
            // ── Single customer ──────────────────────────────────────────
            $customer = Customer::find($customerId);
            if (!$customer) {
                return response()->json(['message' => 'Customer not found.'], 404);
            }

            try {
                $this->persistScore($customer, $actorId);
                $scored = 1;
            } catch (\Throwable $e) {
                return response()->json(['message' => 'Scoring failed: ' . $e->getMessage()], 500);
            }
        } else {
            // ── Full batch ───────────────────────────────────────────────
            Customer::whereNull('deleted_at')
                ->select(['id', 'user_id', 'last_order_date', 'total_orders',
                          'total_spent', 'loyalty_points', 'tier', 'customer_type'])
                ->chunkById(200, function ($customers) use ($actorId, &$scored, &$failed) {
                    foreach ($customers as $customer) {
                        try {
                            $this->persistScore($customer, $actorId);
                            $scored++;
                        } catch (\Throwable $e) {
                            $failed++;
                            \Illuminate\Support\Facades\Log::warning(
                                "AlgorithmScore HTTP run failed for #{$customer->id}: " . $e->getMessage()
                            );
                        }
                    }
                });
        }

        $elapsed = round(microtime(true) - $start, 2);

        return response()->json([
            'message'     => "Scoring complete.",
            'scored'      => $scored,
            'failed'      => $failed,
            'duration_s'  => $elapsed,
        ]);
    }

    // ── GET /admin/algorithm/scores ──────────────────────────────────────
    // Paginated leaderboard — latest score per customer
    public function getScores(Request $request): JsonResponse
    {
        $perPage = min((int) $request->input('per_page', 50), 200);

        $scores = DB::table('customer_algorithm_scores as s')
            ->joinSub(
                DB::table('customer_algorithm_scores')
                    ->select('customer_id', DB::raw('MAX(scored_at) as latest'))
                    ->groupBy('customer_id'),
                'latest',
                fn($j) => $j->on('s.customer_id', '=', 'latest.customer_id')
                             ->on('s.scored_at',   '=', 'latest.latest')
            )
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->select([
                's.customer_id',
                DB::raw("CONCAT(c.first_name, ' ', c.last_name) as full_name"),
                'c.email',
                'c.tier',
                'c.customer_type',
                's.total_score',
                's.recency_raw',
                's.frequency_raw',
                's.monetary_raw',
                's.loyalty_raw',
                's.engagement_raw',
                's.service_raw',
                's.referral_raw',
                's.scored_at',
            ])
            ->orderByDesc('s.total_score')
            ->paginate($perPage);

        return response()->json($scores);
    }

    // ── GET /admin/algorithm/scores/{customerId} ─────────────────────────
    // Latest score for one customer
    public function getCustomerScore(int $customerId): JsonResponse
    {
        $score = DB::table('customer_algorithm_scores')
            ->where('customer_id', $customerId)
            ->orderByDesc('scored_at')
            ->first();

        if (!$score) {
            return response()->json(['message' => 'No score found for this customer.'], 404);
        }

        $score->weighted_json = json_decode($score->weighted_json, true);

        return response()->json($score);
    }

    // ── POST /admin/algorithm/segment-rules ──────────────────────────────
    public function storeSegmentRule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:100',
            'condition'     => 'required|array',
            'boost_signal'  => 'required|string|max:50',
            'boost_percent' => 'required|numeric|min:-100|max:500',
            'action_label'  => 'nullable|string|max:255',
        ]);

        $id = DB::table('algorithm_segment_rules')->insertGetId([
            'name'           => $data['name'],
            'condition_json' => json_encode($data['condition']),
            'boost_signal'   => $data['boost_signal'],
            'boost_percent'  => $data['boost_percent'],
            'action_label'   => $data['action_label'] ?? null,
            'created_by'     => $request->user()->id,
            'is_active'      => 1,
            'updated_at'     => now(),
        ]);

        $this->algorithm->flushConfigCache();

        return response()->json(['message' => 'Segment rule created.', 'id' => $id], 201);
    }

    // ── PUT /admin/algorithm/segment-rules/{id} ──────────────────────────
    public function updateSegmentRule(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'sometimes|string|max:100',
            'condition'     => 'sometimes|array',
            'boost_signal'  => 'sometimes|string|max:50',
            'boost_percent' => 'sometimes|numeric|min:-100|max:500',
            'action_label'  => 'nullable|string|max:255',
            'is_active'     => 'sometimes|boolean',
        ]);

        $payload = array_filter([
            'name'           => $data['name']          ?? null,
            'condition_json' => isset($data['condition']) ? json_encode($data['condition']) : null,
            'boost_signal'   => $data['boost_signal']   ?? null,
            'boost_percent'  => $data['boost_percent']  ?? null,
            'action_label'   => $data['action_label']   ?? null,
            'is_active'      => isset($data['is_active']) ? (int) $data['is_active'] : null,
            'updated_at'     => now(),
        ], fn($v) => $v !== null);

        DB::table('algorithm_segment_rules')->where('id', $id)->update($payload);
        $this->algorithm->flushConfigCache();

        return response()->json(['message' => 'Segment rule updated.']);
    }

    // ── DELETE /admin/algorithm/segment-rules/{id} ───────────────────────
    public function deleteSegmentRule(int $id): JsonResponse
    {
        DB::table('algorithm_segment_rules')->where('id', $id)->delete();
        $this->algorithm->flushConfigCache();

        return response()->json(['message' => 'Segment rule deleted.']);
    }

    // ── Shared persist helper ────────────────────────────────────────────
    protected function persistScore(Customer $customer, int $actorId): void
    {
        $result = $this->algorithm->scoreCustomer($customer);

        DB::table('customer_algorithm_scores')->insert([
            'customer_id'    => $customer->id,
            'total_score'    => $result['total_score'],
            'recency_raw'    => $result['raw']['recency']    ?? 0,
            'frequency_raw'  => $result['raw']['frequency']  ?? 0,
            'monetary_raw'   => $result['raw']['monetary']   ?? 0,
            'loyalty_raw'    => $result['raw']['loyalty']    ?? 0,
            'engagement_raw' => $result['raw']['engagement'] ?? 0,
            'service_raw'    => $result['raw']['service']    ?? 0,
            'referral_raw'   => $result['raw']['referral']   ?? 0,
            'weighted_json'  => json_encode($result['weighted']),
            'scored_by'      => $actorId,
            'scored_at'      => now(),
        ]);
    }

    // ── GET /admin/algorithm/catalogue-boosts ────────────────────────────────
    // Paginated product OR service list with their boost row joined (if any)
    public function getCatalogueBoosts(Request $request): JsonResponse
    {
        $type    = $request->input('entity_type', 'product'); // 'product' | 'service'
        $search  = $request->input('search', '');
        $perPage = min((int) $request->input('per_page', 50), 200);

        if ($type === 'service') {
            $query = DB::table('services')
                ->leftJoin('algorithm_bonus_content as b', function ($j) {
                    $j->on('b.entity_id', '=', 'services.id')
                    ->where('b.entity_type', '=', 'service');
                })
                ->whereNull('services.deleted_at')
                ->select([
                    'services.id',
                    'services.name',
                    'services.status',
                    DB::raw("'service' as entity_type"),
                    'services.main_image',
                    DB::raw('NULL as category_name'),
                    'b.id as boost_id',
                    'b.message as boost_message',
                    'b.badge_type',
                    'b.is_active as boost_active',
                ]);

            if ($search) {
                $query->where('services.name', 'like', "%{$search}%");
            }

            if ($request->filled('category_id')) {
                $query->where('services.category_id', $request->category_id);
            }
        } else {
            $query = DB::table('products')
                ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
                ->leftJoin('algorithm_bonus_content as b', function ($j) {
                    $j->on('b.entity_id', '=', 'products.id')
                    ->where('b.entity_type', '=', 'product');
                })
                ->whereNull('products.deleted_at')
                ->select([
                    'products.id',
                    'products.name',
                    'products.status',
                    DB::raw("'product' as entity_type"),
                    'products.main_image',
                    'categories.name as category_name',
                    'b.id as boost_id',
                    'b.message as boost_message',
                    'b.badge_type',
                    'b.is_active as boost_active',
                ]);

            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('products.name', 'like', "%{$search}%")
                    ->orWhere('products.sku', 'like', "%{$search}%");
                });
            }

            if ($request->filled('category_id')) {
                $query->where('products.category_id', $request->category_id);
            }
        }

        // Rows with an active boost bubble to top
        $query->orderByRaw('b.id IS NULL ASC')
            ->orderBy('name', 'asc');

        $paginated = $query->paginate($perPage);

        // Mirror what the Product/Service model asset() accessor does
        $paginated->getCollection()->transform(function ($item) {
            if ($item->main_image && !str_starts_with($item->main_image, 'http')) {
                $item->main_image = asset($item->main_image);
            }
            return $item;
        });
        return response()->json($paginated); 
    }

    // ── PUT /admin/algorithm/catalogue-boosts/{entityType}/{entityId} ─────────
    // Upsert — creates or updates the boost row for this entity
    public function upsertCatalogueBoost(Request $request, string $entityType, int $entityId): JsonResponse
    {
        if (!in_array($entityType, ['product', 'service'])) {
            return response()->json(['message' => 'Invalid entity type.'], 422);
        }

        $data = $request->validate([
            'message'    => 'required|string|max:500',
            'badge_type' => 'required|in:promo,social_proof,bundle,urgency,tip',
            'is_active'  => 'required|boolean',
        ]);

        $actorId = $request->user()->id;
        $now     = now();

        $existing = DB::table('algorithm_bonus_content')
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->first();

        if ($existing) {
            DB::table('algorithm_bonus_content')
                ->where('id', $existing->id)
                ->update([
                    'message'    => $data['message'],
                    'badge_type' => $data['badge_type'],
                    'is_active'  => $data['is_active'],
                    'updated_by' => $actorId,
                    'updated_at' => $now,
                ]);
            $id = $existing->id;
        } else {
            $id = DB::table('algorithm_bonus_content')->insertGetId([
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'message'     => $data['message'],
                'badge_type'  => $data['badge_type'],
                'is_active'   => $data['is_active'],
                'created_by'  => $actorId,
                'updated_by'  => $actorId,
                'created_at'  => $now,
                'updated_at'  => $now,
            ]);
        }

        return response()->json(['message' => 'Boost saved.', 'boost_id' => $id]);
    }

    // ── DELETE /admin/algorithm/catalogue-boosts/{entityType}/{entityId} ──────
    public function deleteCatalogueBoost(string $entityType, int $entityId): JsonResponse
    {
        DB::table('algorithm_bonus_content')
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->delete();

        return response()->json(['message' => 'Boost removed.']);
    }
}