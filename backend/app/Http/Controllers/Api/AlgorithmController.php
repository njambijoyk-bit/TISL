<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\AlgorithmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache; 

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

    // ── GET /admin/algorithm/customers/{customerId}/ranked-products ──────────────
    // Returns products/services ranked by catalogue score for a specific customer,
    // with their pin status and any active boost content joined in.
    public function getCustomerRankedProducts(Request $request, int $customerId): JsonResponse
    {
        $entityType = $request->input('entity_type', 'product');
        $search     = $request->input('search', '');
        $categoryId = $request->input('category_id');
        $perPage    = min((int) $request->input('per_page', 30), 100);

        // ── Resolve this customer's segment ─────────────────────────────────────
        $score = DB::table('customer_algorithm_scores')
            ->where('customer_id', $customerId)
            ->orderByDesc('scored_at')
            ->select(['total_score', 'recency_raw'])
            ->first();

        $segment = 'default';
        if ($score) {
            $s       = (float) $score->total_score;
            $recency = (int)   ($score->recency_raw ?? 100);
            if      ($s >= 68)      $segment = 'champion';
            elseif  ($s >= 48)      $segment = 'loyal';
            elseif  ($recency < 20) $segment = 'at_risk';
            elseif  ($s < 25)       $segment = 'dormant';
            else                    $segment = 'loyal';
        }

        // ── Load catalogue weights for this segment ──────────────────────────────
        $allWeights = Cache::remember('catalogue_weights', 300, function () {
            $row = DB::table('algorithm_config')->where('key', 'catalogue_weights')->value('value');
            return $row ? json_decode($row, true) : [];
        });

        $defaults = [
            'champion' => ['featured'=>20,'new'=>10,'sale'=> 5,'rating'=>30,'popular'=>25,'bonus'=>10],
            'loyal'    => ['featured'=>25,'new'=>10,'sale'=> 5,'rating'=>30,'popular'=>20,'bonus'=>10],
            'at_risk'  => ['featured'=>10,'new'=>15,'sale'=>35,'rating'=>15,'popular'=>15,'bonus'=>10],
            'dormant'  => ['featured'=>10,'new'=>30,'sale'=>25,'rating'=>15,'popular'=>10,'bonus'=>10],
            'new'      => ['featured'=>25,'new'=>20,'sale'=>10,'rating'=>25,'popular'=>10,'bonus'=>10],
            'default'  => ['featured'=>15,'new'=>15,'sale'=>10,'rating'=>25,'popular'=>25,'bonus'=>10],
        ];
        $w = $allWeights[$segment] ?? $defaults[$segment] ?? $defaults['default'];

        // ── Build query ──────────────────────────────────────────────────────────
        if ($entityType === 'service') {
            $scoreExpr = "(
                services.is_featured * ?
            + (COALESCE(services.rating,0) / 5.0) * ?
            + LEAST(COALESCE(services.order_count,0) / 100.0, 1.0) * ?
            + EXISTS(
                    SELECT 1 FROM algorithm_bonus_content
                    WHERE entity_type = 'service' AND entity_id = services.id AND is_active = 1
                ) * ?
            )";
            $scoreBindings = [
                (int)($w['featured'] ?? 15) + (int)($w['new'] ?? 15),
                (int)($w['rating']   ?? 25) + (int)($w['sale'] ?? 10),
                (int)($w['popular']  ?? 25),
                (int)($w['bonus']    ?? 10),
            ];

            $query = DB::table('services')
                ->leftJoin('customer_product_pins as cpp', function ($j) use ($customerId) {
                    $j->on('cpp.entity_id', '=', 'services.id')
                    ->where('cpp.entity_type', '=', 'service')
                    ->where('cpp.customer_id', '=', $customerId);
                })
                ->leftJoin('algorithm_bonus_content as abc', function ($j) {
                    $j->on('abc.entity_id', '=', 'services.id')
                    ->where('abc.entity_type', '=', 'service')
                    ->where('abc.is_active', '=', 1);
                })
                ->whereNull('services.deleted_at')
                ->selectRaw("
                    services.id,
                    services.name,
                    services.status,
                    services.main_image,
                    'service' as entity_type,
                    NULL as category_name,
                    cpp.id as pin_id,
                    IF(cpp.id IS NOT NULL, 1, 0) as is_pinned,
                    abc.message as boost_message,
                    abc.badge_type,
                    {$scoreExpr} as catalogue_score
                ", $scoreBindings);

            if ($search) {
                $query->where('services.name', 'like', "%{$search}%");
            }

        } else {
            $scoreExpr = "(
                products.is_featured * ?
            + products.is_new * ?
            + products.on_sale * ?
            + (COALESCE(products.rating,0) / 5.0) * ?
            + LEAST(COALESCE(products.purchase_count,0) / 100.0, 1.0) * ?
            + EXISTS(
                    SELECT 1 FROM algorithm_bonus_content
                    WHERE entity_type = 'product' AND entity_id = products.id AND is_active = 1
                ) * ?
            )";
            $scoreBindings = [
                (int)($w['featured'] ?? 15),
                (int)($w['new']      ?? 15),
                (int)($w['sale']     ?? 10),
                (int)($w['rating']   ?? 25),
                (int)($w['popular']  ?? 25),
                (int)($w['bonus']    ?? 10),
            ];

            $query = DB::table('products')
                ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
                ->leftJoin('customer_product_pins as cpp', function ($j) use ($customerId) {
                    $j->on('cpp.entity_id', '=', 'products.id')
                    ->where('cpp.entity_type', '=', 'product')
                    ->where('cpp.customer_id', '=', $customerId);
                })
                ->leftJoin('algorithm_bonus_content as abc', function ($j) {
                    $j->on('abc.entity_id', '=', 'products.id')
                    ->where('abc.entity_type', '=', 'product')
                    ->where('abc.is_active', '=', 1);
                })
                ->whereNull('products.deleted_at')
                ->selectRaw("
                    products.id,
                    products.name,
                    products.status,
                    products.main_image,
                    'product' as entity_type,
                    categories.name as category_name,
                    cpp.id as pin_id,
                    IF(cpp.id IS NOT NULL, 1, 0) as is_pinned,
                    abc.message as boost_message,
                    abc.badge_type,
                    {$scoreExpr} as catalogue_score
                ", $scoreBindings);

            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('products.name', 'like', "%{$search}%")
                    ->orWhere('products.sku', 'like', "%{$search}%");
                });
            }
            if ($categoryId) {
                $query->where('products.category_id', $categoryId);
            }
        }

        // Pinned items first, then by catalogue score
        // AFTER — inline the expressions directly so ORDER BY never depends on aliases
        $query->orderByRaw('(cpp.id IS NOT NULL) DESC')
            ->orderByRaw($scoreExpr . ' DESC', $scoreBindings);

        $paginated = $query->paginate($perPage);

        // Normalise image URLs
        $paginated->getCollection()->transform(function ($item) {
            if ($item->main_image && !str_starts_with($item->main_image, 'http')) {
                $item->main_image = asset($item->main_image);
            }
            $item->is_pinned = (bool) $item->is_pinned;
            return $item;
        });

        return response()->json(array_merge($paginated->toArray(), [
            'segment' => $segment,
        ]));
    }

    // ── POST /admin/algorithm/customers/{customerId}/pins ────────────────────────
    public function pinProduct(Request $request, int $customerId): JsonResponse
    {
        $data = $request->validate([
            'entity_type' => 'required|in:product,service',
            'entity_id'   => 'required|integer|min:1',
        ]);

        // Verify customer exists
        $exists = DB::table('customers')->where('id', $customerId)->exists();
        if (!$exists) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        DB::table('customer_product_pins')->insertOrIgnore([
            'customer_id' => $customerId,
            'entity_type' => $data['entity_type'],
            'entity_id'   => $data['entity_id'],
            'pinned_by'   => $request->user()->id,
            'created_at'  => now(),
        ]);

        $pin = DB::table('customer_product_pins')
            ->where('customer_id', $customerId)
            ->where('entity_type', $data['entity_type'])
            ->where('entity_id', $data['entity_id'])
            ->first();

        return response()->json(['message' => 'Product pinned.', 'pin_id' => $pin?->id]);
    }

    // ── DELETE /admin/algorithm/customers/{customerId}/pins/{entityType}/{entityId}
    public function unpinProduct(int $customerId, string $entityType, int $entityId): JsonResponse
    {
        if (!in_array($entityType, ['product', 'service'])) {
            return response()->json(['message' => 'Invalid entity type.'], 422);
        }

        DB::table('customer_product_pins')
            ->where('customer_id', $customerId)
            ->where('entity_type', $entityType)
            ->where('entity_id',   $entityId)
            ->delete();

        return response()->json(['message' => 'Pin removed.']);
    }
}