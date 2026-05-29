<?php

namespace App\Services\Inventory;

use App\Models\Inventory\InventoryItem;
use App\Models\Inventory\InventoryLifecycleMovement;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * InventoryStockService
 *
 * Bridges the orders/products world with the inventory system.
 * Rules:
 *   - NEVER writes to products.stock_quantity — products table owns that.
 *   - Syncs inventory_items qty counters AFTER the product table has already
 *     been updated by the caller.
 *   - Logs an inventory_lifecycle_movement for every stock event (pure audit).
 *   - Lazy-creates an inventory_item for any product that doesn't have one yet.
 *
 * Qty definitions on inventory_items:
 *   available_qty = products.stock_quantity  (mirrors exactly)
 *   issued_qty    = cumulative units sold - units returned  (net issued, ever)
 *   total_qty     = available_qty + issued_qty
 */
class InventoryStockService
{
    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    /**
     * Call AFTER product stock has been decremented for an order item.
     *
     * @param  int    $productId
     * @param  float  $qtySold        Units sold in this transaction (in_stock_quantity, not backorder)
     * @param  int    $orderId
     * @param  int|null $performedBy  Auth user id
     * @param  string $referenceType  'order' | 'hamper_order'
     */
    public function recordSale(
        int    $productId,
        float  $qtySold,
        int    $orderId,
        ?int   $performedBy  = null,
        string $referenceType = 'order',
    ): void {
        if ($qtySold <= 0) return;

        try {
            $product = Product::find($productId);
            if (! $product) return;

            $item = $this->resolveInventoryItem($product);

            $scoreBefore  = (float) $item->available_qty;
            $issuedBefore = (float) $item->issued_qty;

            // Sync available to current product stock (already decremented by caller)
            $newAvailable = (float) $product->stock_quantity;
            $newIssued    = round($issuedBefore + $qtySold, 2);
            $newTotal     = round($newAvailable + $newIssued, 2);

            $item->update([
                'available_qty' => $newAvailable,
                'issued_qty'    => $newIssued,
                'total_qty'     => $newTotal,
            ]);

            InventoryLifecycleMovement::create([
                'item_id'        => $item->id,
                'instance_id'    => null,
                'quantity'       => $qtySold,
                'movement_type'  => 'issued',
                'score_before'   => $scoreBefore,
                'score_after'    => $newAvailable,
                'reference_type' => $referenceType,
                'reference_id'   => $orderId,
                'performed_by'   => $performedBy,
                'performed_at'   => now(),
                'notes'          => "Stock decremented via {$referenceType} #{$orderId}",
            ]);

        } catch (\Throwable $e) {
            // Never let inventory logging break an order flow
            Log::error("[InventoryStockService::recordSale] product={$productId} order={$orderId}: {$e->getMessage()}");
        }
    }

    /**
     * Call AFTER product stock has been restored for an order cancellation or return.
     *
     * @param  int    $productId
     * @param  float  $qtyReturned    Units being restored
     * @param  int    $orderId
     * @param  int|null $performedBy
     * @param  string $referenceType  'order' | 'hamper_order'
     */
    public function recordReturn(
        int    $productId,
        float  $qtyReturned,
        int    $orderId,
        ?int   $performedBy  = null,
        string $referenceType = 'order',
    ): void {
        if ($qtyReturned <= 0) return;

        try {
            $product = Product::find($productId);
            if (! $product) return;

            $item = $this->resolveInventoryItem($product);

            $scoreBefore  = (float) $item->available_qty;
            $issuedBefore = (float) $item->issued_qty;

            $newAvailable = (float) $product->stock_quantity; // already restored by caller
            $newIssued    = max(0, round($issuedBefore - $qtyReturned, 2));
            $newTotal     = round($newAvailable + $newIssued, 2);

            $item->update([
                'available_qty' => $newAvailable,
                'issued_qty'    => $newIssued,
                'total_qty'     => $newTotal,
            ]);

            InventoryLifecycleMovement::create([
                'item_id'        => $item->id,
                'instance_id'    => null,
                'quantity'       => $qtyReturned,
                'movement_type'  => 'returned',
                'score_before'   => $scoreBefore,
                'score_after'    => $newAvailable,
                'reference_type' => $referenceType,
                'reference_id'   => $orderId,
                'performed_by'   => $performedBy,
                'performed_at'   => now(),
                'notes'          => "Stock restored via {$referenceType} #{$orderId} return/cancellation",
            ]);

        } catch (\Throwable $e) {
            Log::error("[InventoryStockService::recordReturn] product={$productId} order={$orderId}: {$e->getMessage()}");
        }
    }

    /**
     * Call AFTER a manual restock (ProductController::updateStock add/set actions).
     *
     * @param  int    $productId
     * @param  int|null $performedBy
     * @param  string|null $notes
     */
    public function recordRestock(
        int    $productId,
        ?int   $performedBy = null,
        ?string $notes      = null,
    ): void {
        try {
            $product = Product::find($productId);
            if (! $product) return;

            $item = $this->resolveInventoryItem($product);

            $scoreBefore  = (float) $item->available_qty;
            $newAvailable = (float) $product->stock_quantity; // already updated by caller
            $newTotal     = round($newAvailable + (float) $item->issued_qty, 2);

            $item->update([
                'available_qty' => $newAvailable,
                'total_qty'     => $newTotal,
            ]);

            InventoryLifecycleMovement::create([
                'item_id'        => $item->id,
                'instance_id'    => null,
                'quantity'       => abs($newAvailable - $scoreBefore), // delta
                'movement_type'  => 'received',
                'score_before'   => $scoreBefore,
                'score_after'    => $newAvailable,
                'reference_type' => 'product_restock',
                'reference_id'   => $productId,
                'performed_by'   => $performedBy,
                'performed_at'   => now(),
                'notes'          => $notes ?? "Manual restock on product #{$productId}",
            ]);

        } catch (\Throwable $e) {
            Log::error("[InventoryStockService::recordRestock] product={$productId}: {$e->getMessage()}");
        }
    }

    /**
     * Bulk sync all products into inventory_items.
     * - Creates inventory_item for any product that doesn't have one.
     * - Updates existing inventory_item for any product that already has one.
     *
     * Fields synced from products (product-owned, never edited in inventory):
     *   name, purchase_cost (← price), unit_of_measure (← 'unit'), available_qty, total_qty
     *
     * Fields never touched on existing items:
     *   issued_qty       — running net-sold counter, hands off
     *   location         — inventory-managed
     *   condition/notes  — inventory-managed
     *
     * @param  int|null $performedBy
     * @return array{ created: int, updated: int, errors: array }
     */
    /**
     * Sync a single batch of products (offset + limit).
     * Called repeatedly by the frontend until done = true.
     *
     * @return array{ created: int, updated: int, errors: array, done: bool, next_offset: int, total: int }
     */
    public function syncFromProductsBatch(int $offset, int $limit, ?int $performedBy = null): array
    {
        $total   = Product::withTrashed()->count();
        $created = 0;
        $updated = 0;
        $errors  = [];

        $products = Product::withTrashed()
            ->with('brand')
            ->orderBy('id')
            ->offset($offset)
            ->limit($limit)
            ->get();

        // Only load inventory items for this batch — avoids loading all 5000 at once
        $productIds    = $products->pluck('id');
        $existingItems = InventoryItem::whereIn('product_id', $productIds)
            ->get()
            ->keyBy('product_id');

        foreach ($products as $product) {
            try {
                DB::transaction(function () use (
                    $product, $existingItems, $performedBy, &$created, &$updated
                ) {
                    $available = (float) $product->stock_quantity;

                    if ($existingItems->has($product->id)) {
                        $item     = $existingItems->get($product->id);
                        $item->update([
                            'name'          => $product->name,
                            'purchase_cost' => (float) $product->price,
                            'description'   => $product->short_description ?? null,
                            'available_qty' => $available,
                            'total_qty'     => round($available + (float) $item->issued_qty, 2),
                            'is_active'     => true,
                            'updated_by'    => $performedBy,
                        ]);
                        $updated++;
                    } else {
                        InventoryItem::create([
                            'product_id'          => $product->id,
                            'name'                => $product->name,
                            'type'                => 'stock',
                            'brand'               => $product->brand?->name ?? null,
                            'description'         => $product->short_description ?? null,
                            'is_serialized'       => false,
                            'unit_of_measure'     => 'unit',
                            'purchase_cost'       => (float) $product->price,
                            'is_active'           => true,
                            'available_qty'       => $available,
                            'issued_qty'          => 0,
                            'total_qty'           => $available,
                            'reserved_qty'        => 0,
                            'loaned_qty'          => 0,
                            'in_repair_qty'       => 0,
                            'retired_qty'         => 0,
                            'category_id'         => null,
                            'default_location_id' => null,
                            'notes'               => "Synced from product #{$product->id}",
                            'created_by'          => $performedBy,
                            'updated_by'          => $performedBy,
                        ]);
                        $created++;
                    }
                });
            } catch (\Throwable $e) {
                $errors[] = "Product #{$product->id}: {$e->getMessage()}";
                Log::error("[InventoryStockService::syncFromProductsBatch] product={$product->id}: {$e->getMessage()}");
            }
        }

        $nextOffset = $offset + $limit;
        $done       = $nextOffset >= $total;

        return [
            'created'     => $created,
            'updated'     => $updated,
            'errors'      => $errors,
            'done'        => $done,
            'next_offset' => $done ? $total : $nextOffset,
            'total'       => $total,
            'processed'   => $offset + $products->count(),
        ];
    }
    public function syncFromProducts(?int $performedBy = null): array
    {
        $created = 0;
        $updated = 0;
        $errors  = [];

        // Load all products (all statuses qualify) with their existing inventory item
        $products = Product::withTrashed()->get();

        // Index existing inventory items by product_id for O(1) lookup
        $existingItems = InventoryItem::whereNotNull('product_id')
            ->get()
            ->keyBy('product_id');

        foreach ($products as $product) {
            try {
                DB::transaction(function () use (
                    $product, $existingItems, $performedBy, &$created, &$updated
                ) {
                    $available = (float) $product->stock_quantity;

                    if ($existingItems->has($product->id)) {
                        // ── UPDATE existing item ──────────────────────────────
                        $item      = $existingItems->get($product->id);
                        $issuedQty = (float) $item->issued_qty; // never touch this
                        $totalQty  = round($available + $issuedQty, 2);

                        $item->update([
                            'name'          => $product->name,
                            'purchase_cost' => (float) $product->price,
                            'available_qty' => $available,
                            'total_qty'     => $totalQty,
                            'is_active'     => true,
                            'updated_by'    => $performedBy,
                        ]);

                        $updated++;
                    } else {
                        // ── CREATE new item ───────────────────────────────────
                        InventoryItem::create([
                            'product_id'          => $product->id,
                            'name'                => $product->name,
                            'type'                => 'stock',
                            'is_serialized'       => false,
                            'unit_of_measure'     => 'unit',
                            'purchase_cost'       => (float) $product->price,
                            'is_active'           => true,
                            'available_qty'       => $available,
                            'issued_qty'          => 0,
                            'total_qty'           => $available,
                            'reserved_qty'        => 0,
                            'loaned_qty'          => 0,
                            'in_repair_qty'       => 0,
                            'retired_qty'         => 0,
                            'category_id'         => null,
                            'default_location_id' => null,
                            'notes'               => "Synced from product #{$product->id}",
                            'created_by'          => $performedBy,
                            'updated_by'          => $performedBy,
                        ]);

                        $created++;
                    }
                });
            } catch (\Throwable $e) {
                $errors[] = "Product #{$product->id} ({$product->name}): {$e->getMessage()}";
                Log::error("[InventoryStockService::syncFromProducts] product={$product->id}: {$e->getMessage()}");
            }
        }

        return compact('created', 'updated', 'errors');
    }

    // -------------------------------------------------------------------------
    // PRIVATE HELPERS
    // -------------------------------------------------------------------------

    /**
     * Find the inventory_item for this product, or lazy-create one.
     */
    private function resolveInventoryItem(Product $product): InventoryItem
    {
        $item = InventoryItem::where('product_id', $product->id)->first();
        if ($item) return $item;

        // Ensure brand relation is loaded
        if (! $product->relationLoaded('brand')) {
            $product->load('brand');
        }

        $available = (float) $product->stock_quantity;

        return InventoryItem::create([
            'product_id'          => $product->id,
            'name'                => $product->name,
            'brand'               => $product->brand?->name ?? null,
            'description'         => $product->short_description ?? null,
            'type'                => 'stock',
            'is_serialized'       => false,
            'unit_of_measure'     => 'unit',
            'purchase_cost'       => (float) $product->price,
            'is_active'           => true,
            'available_qty'       => $available,
            'issued_qty'          => 0,
            'total_qty'           => $available,
            'reserved_qty'        => 0,
            'loaned_qty'          => 0,
            'in_repair_qty'       => 0,
            'retired_qty'         => 0,
            'category_id'         => null,
            'default_location_id' => null,
            'notes'               => "Auto-created from product #{$product->id} on first stock event",
            'created_by'          => null,
            'updated_by'          => null,
        ]);
    }
}