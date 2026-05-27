<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\CatalogueRankingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * Handles customer pins and the ranked-products list shown in the Pins tab.
 *
 * Route contracts (must match CustomerAlgorithmPanel.jsx exactly):
 *
 *   GET    /admin/algorithm/customers/{customer}/ranked-products
 *   POST   /admin/algorithm/customers/{customer}/pins
 *   DELETE /admin/algorithm/customers/{customer}/pins/{entityType}/{entityId}
 */
class CustomerPinController extends Controller
{
    // =========================================================
    // RANKED PRODUCTS  (the main table in the Pins tab)
    // =========================================================

    /**
     * GET /admin/algorithm/customers/{customer}/ranked-products
     *
     * Query params:
     *   entity_type  'product' (default) | 'service'
     *   search       optional name filter
     *   page         default 1
     *   per_page     default 20, max 100
     *
     * Each row includes:
     *   id, name, entity_type, catalogue_score, is_pinned, pin_id,
     *   main_image, category_name, badge_type, boost_message,
     *   is_featured, is_new, on_sale, rating
     *
     * Top-level: segment, personalized (from CatalogueRankingService).
     */
    public function rankedProducts(Request $request, Customer $customer): JsonResponse
    {
        $entityType = in_array($request->input('entity_type'), ['product', 'service'])
            ? $request->input('entity_type')
            : 'product';

        $search  = trim($request->input('search', ''));
        $perPage = min((int) $request->input('per_page', 20), 100);

        // Catalogue ranking expression + segment metadata for this request's token
        $order = app(CatalogueRankingService::class)->getOrderExpression($entityType);

        // Strip trailing DESC so we can also SELECT the score value
        $scoreExpr = rtrim(trim($order['expression']), ' DESC');

        // IDs of entities already pinned — used for the "pin bubble" ORDER BY
        $pinnedIds = DB::table('customer_product_pins')
            ->where('customer_id', $customer->id)
            ->where('entity_type', $entityType)
            ->pluck('entity_id')
            ->all();

        $inList = implode(',', $pinnedIds ?: [0]); // never empty IN()
        $cid    = (int) $customer->id;

        $query = $entityType === 'service'
            ? $this->serviceQuery($scoreExpr, $order, $inList, $cid, $search)
            : $this->productQuery($scoreExpr, $order, $inList, $cid, $search);

        $paginator = $query->paginate($perPage);

        $rows = collect($paginator->items())->map(fn($row) => [
            'id'              => $row->id,
            'name'            => $row->name,
            'entity_type'     => $entityType,
            'catalogue_score' => round((float) ($row->catalogue_score ?? 0), 2),
            'is_pinned'       => (bool) $row->is_pinned,
            'pin_id'          => $row->pin_id ?: null,
            'main_image'      => $row->main_image ?? null,
            'category_name'   => $row->category_name ?? null,
            'badge_type'      => $row->badge_type ?? null,
            'boost_message'   => $row->boost_message ?? null,
            'is_featured'     => (bool) ($row->is_featured ?? false),
            'is_new'          => (bool) ($row->is_new ?? false),
            'on_sale'         => (bool) ($row->on_sale ?? false),
            'rating'          => (float) ($row->rating ?? 0),
        ]);

        return response()->json([
            'data'         => $rows,
            'current_page' => $paginator->currentPage(),
            'last_page'    => $paginator->lastPage(),
            'per_page'     => $paginator->perPage(),
            'from'         => $paginator->firstItem(),
            'to'           => $paginator->lastItem(),
            'total'        => $paginator->total(),
            'segment'      => $order['segment'],
            'personalized' => $order['personalized'],
        ]);
    }

    // =========================================================
    // PIN
    // =========================================================

    /**
     * POST /admin/algorithm/customers/{customer}/pins
     *
     * Body: { entity_type: 'product'|'service', entity_id: int }
     *
     * Idempotent — returns 200 + pin_id if already pinned so the UI
     * can always sync its local is_pinned state.
     */
    public function store(Request $request, Customer $customer): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'entity_type' => 'required|in:product,service',
            'entity_id'   => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $entityType = $request->entity_type;
        $entityId   = (int) $request->entity_id;

        if (!$this->entityExists($entityType, $entityId)) {
            return response()->json(['message' => ucfirst($entityType) . ' not found.'], 404);
        }

        $existing = DB::table('customer_product_pins')
            ->where('customer_id', $customer->id)
            ->where('entity_type', $entityType)
            ->where('entity_id',   $entityId)
            ->first(['id']);

        if ($existing) {
            return response()->json(['message' => 'Already pinned.', 'pin_id' => $existing->id], 200);
        }

        $pinId = DB::table('customer_product_pins')->insertGetId([
            'customer_id' => $customer->id,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'pinned_by'   => $request->user()->id,
            'created_at'  => now(),
        ]);

        Log::info('Customer pin added', [
            'pin_id'      => $pinId,
            'customer_id' => $customer->id,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'pinned_by'   => $request->user()->id,
        ]);

        return response()->json([
            'message' => ucfirst($entityType) . ' pinned successfully.',
            'pin_id'  => $pinId,
        ], 201);
    }

    // =========================================================
    // UNPIN — matches frontend: DELETE .../pins/{entityType}/{entityId}
    // =========================================================

    /**
     * DELETE /admin/algorithm/customers/{customer}/pins/{entityType}/{entityId}
     *
     * The frontend calls:
     *   axios.delete(`.../customers/${id}/pins/${entityType}/${entityId}`)
     *
     * So {entityType} is a string route segment ('product' or 'service')
     * and {entityId} is the product/service id — NOT the pin row id.
     */
    public function destroy(Request $request, Customer $customer, string $entityType, int $entityId): JsonResponse
    {
        if (!in_array($entityType, ['product', 'service'])) {
            return response()->json(['message' => 'Invalid entity type.'], 422);
        }

        $deleted = DB::table('customer_product_pins')
            ->where('customer_id', $customer->id)
            ->where('entity_type', $entityType)
            ->where('entity_id',   $entityId)
            ->delete();

        if (!$deleted) {
            return response()->json(['message' => 'Pin not found.'], 404);
        }

        Log::info('Customer pin removed', [
            'customer_id' => $customer->id,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'removed_by'  => $request->user()->id,
        ]);

        return response()->json(['message' => 'Pin removed successfully.']);
    }

    // =========================================================
    // QUERY BUILDERS
    // =========================================================

    /**
     * Products paginator.
     *
     * ORDER BY:
     *   1. Pinned rows first (CASE WHEN id IN (...))
     *   2. Catalogue score DESC (the CatalogueRankingService expression)
     *
     * Correlated subqueries supply is_pinned and pin_id so we avoid
     * an N+1 loop over each row after pagination.
     */
    private function productQuery(
        string $scoreExpr,
        array  $order,
        string $inList,
        int    $customerId,
        string $search
    ) {
        return DB::table('products')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->leftJoin('algorithm_bonus_content as abc', function ($join) {
                $join->on('abc.entity_id', '=', 'products.id')
                     ->where('abc.entity_type', 'product')
                     ->where('abc.is_active', 1);
            })
            ->whereNull('products.deleted_at')
            ->when($search, fn($q) => $q->where('products.name', 'like', "%{$search}%"))
            ->select([
                'products.id',
                'products.name',
                'products.rating',
                'products.is_featured',
                'products.is_new',
                'products.on_sale',
                DB::raw('(SELECT url FROM product_images WHERE product_id = products.id AND is_main = 1 LIMIT 1) as main_image'),
                'categories.name as category_name',
                'abc.badge_type',
                'abc.message as boost_message',
                DB::raw("({$scoreExpr}) as catalogue_score"),
                DB::raw("EXISTS(
                    SELECT 1 FROM customer_product_pins
                    WHERE customer_id = {$customerId}
                      AND entity_type = 'product'
                      AND entity_id   = products.id
                ) as is_pinned"),
                DB::raw("(
                    SELECT id FROM customer_product_pins
                    WHERE customer_id = {$customerId}
                      AND entity_type = 'product'
                      AND entity_id   = products.id
                    LIMIT 1
                ) as pin_id"),
            ])
            // Pinned items float to the top
            ->orderByRaw("CASE WHEN products.id IN ({$inList}) THEN 0 ELSE 1 END ASC")
            // Then by catalogue score
            ->orderByRaw($order['expression'], $order['bindings']);
    }

    /**
     * Services paginator.
     *
     * Services have no is_new / on_sale columns, so we return NULL for those
     * so the row shape stays consistent with the product rows on the frontend.
     */
    private function serviceQuery(
        string $scoreExpr,
        array  $order,
        string $inList,
        int    $customerId,
        string $search
    ) {
        return DB::table('services')
            ->leftJoin('algorithm_bonus_content as abc', function ($join) {
                $join->on('abc.entity_id', '=', 'services.id')
                     ->where('abc.entity_type', 'service')
                     ->where('abc.is_active', 1);
            })
            ->whereNull('services.deleted_at')
            ->when($search, fn($q) => $q->where('services.name', 'like', "%{$search}%"))
            ->select([
                'services.id',
                'services.name',
                'services.rating',
                'services.is_featured',
                DB::raw('NULL as is_new'),
                DB::raw('NULL as on_sale'),
                DB::raw('(SELECT url FROM service_images WHERE service_id = services.id AND is_main = 1 LIMIT 1) as main_image'),
                DB::raw('NULL as category_name'),
                'abc.badge_type',
                'abc.message as boost_message',
                DB::raw("({$scoreExpr}) as catalogue_score"),
                DB::raw("EXISTS(
                    SELECT 1 FROM customer_product_pins
                    WHERE customer_id = {$customerId}
                      AND entity_type = 'service'
                      AND entity_id   = services.id
                ) as is_pinned"),
                DB::raw("(
                    SELECT id FROM customer_product_pins
                    WHERE customer_id = {$customerId}
                      AND entity_type = 'service'
                      AND entity_id   = services.id
                    LIMIT 1
                ) as pin_id"),
            ])
            ->orderByRaw("CASE WHEN services.id IN ({$inList}) THEN 0 ELSE 1 END ASC")
            ->orderByRaw($order['expression'], $order['bindings']);
    }

    // =========================================================
    // HELPERS
    // =========================================================

    private function entityExists(string $entityType, int $entityId): bool
    {
        $table = $entityType === 'service' ? 'services' : 'products';
        return DB::table($table)->whereNull('deleted_at')->where('id', $entityId)->exists();
    }
}