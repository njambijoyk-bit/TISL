<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CatalogueRankingService
{
    protected array $catalogueWeights;

    public function __construct()
    {
        $this->catalogueWeights = $this->loadCatalogueWeights();
    }

    // =========================================================
    // PUBLIC API
    // =========================================================

    /**
     * Returns the ORDER BY expression + bindings + metadata for
     * either 'product' or 'service' queries.
     *
     * Usage in controller:
     *   $order = app(CatalogueRankingService::class)->getOrderExpression('product');
     *   $query->orderByRaw($order['expression'], $order['bindings']);
     *   // $order['personalized'] bool — whether a customer profile was found
     *   // $order['segment']      string — e.g. 'loyal', 'at_risk', 'default'
     */
    public function getOrderExpression(string $entityType): array
    {
        $segment = $this->resolveSegment();
        $weights = $this->catalogueWeights[$segment] ?? $this->catalogueWeights['default'];

        [$expr, $bindings] = $entityType === 'service'
            ? $this->buildServiceExpression($weights)
            : $this->buildProductExpression($weights);

        return [
            'expression'   => $expr,
            'bindings'     => $bindings,
            'segment'      => $segment,
            'personalized' => $segment !== 'default',
        ];
    }

    /**
     * Call after saving catalogue_weights config so next request picks up changes.
     */
    public function flushCatalogueCache(): void
    {
        Cache::forget('catalogue_weights');
    }

    // =========================================================
    // SEGMENT RESOLUTION
    // =========================================================

    /**
     * Identify the authenticated customer's segment.
     * Falls back gracefully at every step — never throws.
     */
    protected function resolveSegment(): string
    {
        // Manually resolve Bearer token — works on public routes with no auth middleware
        $bearerToken = request()->bearerToken();
        if (!$bearerToken) return 'default';

        $tokenModel = \Laravel\Sanctum\PersonalAccessToken::findToken($bearerToken);
        if (!$tokenModel) return 'default';

        $user = $tokenModel->tokenable;
        if (!$user) return 'default';

        // Admins / staff / vendors get default (no personalisation)
        $excluded = ['admin', 'super_admin', 'staff', 'finance', 'vendor'];
        if (in_array($user->role, $excluded)) return 'default';

        // Resolve customer record
        $customer = Customer::where('user_id', $user->id)
            ->select(['id', 'total_orders'])
            ->first();

        if (!$customer) return 'default';

        // Pull latest computed score
        $score = DB::table('customer_algorithm_scores')
            ->where('customer_id', $customer->id)
            ->orderByDesc('scored_at')
            ->select(['total_score', 'recency_raw'])
            ->first();

        if (!$score) {
            return ((int) ($customer->total_orders ?? 0)) === 0 ? 'new' : 'default';
        }

        $s       = (float) $score->total_score;
        $recency = (int)   ($score->recency_raw ?? 100);

        if ($s >= 68)      return 'champion';
        if ($s >= 48)      return 'loyal';
        if ($recency < 20) return 'at_risk';
        if ($s < 25)       return 'dormant';

        return 'loyal';
    }

    // =========================================================
    // EXPRESSION BUILDERS
    // =========================================================

    /**
     * Catalogue score SQL for products table.
     * Signals: is_featured, is_new, on_sale, rating, purchase_count, boost
     */
    protected function buildProductExpression(array $w): array
    {
        $expr = "(
            products.is_featured * ?
          + products.is_new      * ?
          + products.on_sale     * ?
          + (products.rating / 5.0) * ?
          + LEAST(products.purchase_count / 100.0, 1.0) * ?
          + EXISTS(
                SELECT 1 FROM algorithm_bonus_content
                WHERE entity_type = 'product'
                  AND entity_id   = products.id
                  AND is_active   = 1
            ) * ?
        ) DESC";

        $bindings = [
            (int) ($w['featured'] ?? 15),
            (int) ($w['new']      ?? 15),
            (int) ($w['sale']     ?? 10),
            (int) ($w['rating']   ?? 25),
            (int) ($w['popular']  ?? 25),
            (int) ($w['bonus']    ?? 10),
        ];

        return [$expr, $bindings];
    }

    /**
     * Catalogue score SQL for services table.
     * Services have no is_new / on_sale — those weights go to featured & rating.
     */
    protected function buildServiceExpression(array $w): array
    {
        $expr = "(
            services.is_featured * ?
          + (services.rating / 5.0) * ?
          + LEAST(services.order_count / 100.0, 1.0) * ?
          + EXISTS(
                SELECT 1 FROM algorithm_bonus_content
                WHERE entity_type = 'service'
                  AND entity_id   = services.id
                  AND is_active   = 1
            ) * ?
        ) DESC";

        // Services pool new + sale weights into featured and rating
        $bindings = [
            (int) ($w['featured'] ?? 15) + (int) ($w['new'] ?? 15),
            (int) ($w['rating']   ?? 25) + (int) ($w['sale'] ?? 10),
            (int) ($w['popular']  ?? 25),
            (int) ($w['bonus']    ?? 10),
        ];

        return [$expr, $bindings];
    }

    // =========================================================
    // CONFIG
    // =========================================================

    protected function loadCatalogueWeights(): array
    {
        return Cache::remember('catalogue_weights', 300, function () {
            $row = DB::table('algorithm_config')
                ->where('key', 'catalogue_weights')
                ->value('value');

            return $row ? json_decode($row, true) : $this->defaultCatalogueWeights();
        });
    }

    protected function defaultCatalogueWeights(): array
    {
        return [
            // Champions: premium + best rated first
            'champion' => ['featured' => 20, 'new' => 10, 'sale' =>  5, 'rating' => 30, 'popular' => 25, 'bonus' => 10],
            // Loyal: featured + quality
            'loyal'    => ['featured' => 25, 'new' => 10, 'sale' =>  5, 'rating' => 30, 'popular' => 20, 'bonus' => 10],
            // At risk: sale items win them back
            'at_risk'  => ['featured' => 10, 'new' => 15, 'sale' => 35, 'rating' => 15, 'popular' => 15, 'bonus' => 10],
            // Dormant: novelty + deals
            'dormant'  => ['featured' => 10, 'new' => 30, 'sale' => 25, 'rating' => 15, 'popular' => 10, 'bonus' => 10],
            // New customers: featured + discovery
            'new'      => ['featured' => 25, 'new' => 20, 'sale' => 10, 'rating' => 25, 'popular' => 10, 'bonus' => 10],
            // Guests / unscored: global popularity + quality
            'default'  => ['featured' => 15, 'new' => 15, 'sale' => 10, 'rating' => 25, 'popular' => 25, 'bonus' => 10],
        ];
    }
}