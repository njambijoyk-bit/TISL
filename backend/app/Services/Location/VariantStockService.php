<?php

namespace App\Services\Location;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\ProductVariantUnit;
use App\Models\UnitOfMeasure;
use App\Models\VariantLocationStock;
use Illuminate\Support\Facades\DB;

/**
 * Per-branch variant stock: the source of truth is variant_location_stock;
 * variant.stock_quantity and product.stock_quantity are caches derived from it.
 *
 * Handles the "silent default variant" for simple products so stock always has
 * a variant to attach to, without ever asking the admin to invent options.
 */
class VariantStockService
{
    /**
     * Ensure the product has at least one variant to carry stock. For a simple
     * product (no variants) this creates ONE option-less default variant + base
     * unit, without flipping `has_variants` (that flag means "has visible
     * options"). Returns the default/first variant.
     */
    public function ensureDefaultVariant(Product $product): ProductVariant
    {
        $existing = $product->productVariants()->orderByDesc('is_default')->first();
        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($product) {
            $variant = $product->productVariants()->create([
                'sku'             => $product->sku,
                'name'            => null,
                'combination_key' => 'default',
                'is_default'      => true,
                'net_content_qty' => 1,
                'stock_quantity'  => (float) ($product->stock_quantity ?? 0),
                'status'          => ProductVariant::STATUS_ACTIVE,
            ]);

            $variant->units()->create([
                'unit_id'         => $this->defaultUnitId(),
                'role'            => ProductVariantUnit::ROLE_BASE,
                'base_factor'     => 1,
                'price'           => (float) ($product->price ?? 0),
                'is_default_sale' => true,
            ]);

            return $variant;
        });
    }

    /** Set the quantity for one (variant, branch); creates/updates the row. */
    public function setBranchStock(int $variantId, int $locationId, float $quantity, ?float $reorder = null): void
    {
        VariantLocationStock::updateOrCreate(
            ['product_variant_id' => $variantId, 'location_id' => $locationId],
            ['quantity' => max(0, $quantity), 'reorder_level' => $reorder]
        );
    }

    /**
     * Recompute the cached quantities from variant_location_stock. Only touches
     * products that are location-managed (have at least one stock row); legacy
     * products keep their existing numbers.
     */
    public function recomputeCaches(Product $product): void
    {
        $product->loadMissing('productVariants');
        if ($product->productVariants->isEmpty()) {
            return;
        }

        $anyRows = false;
        $productTotal = 0.0;

        foreach ($product->productVariants as $variant) {
            $sum = (float) VariantLocationStock::where('product_variant_id', $variant->id)->sum('quantity');
            $hasRows = VariantLocationStock::where('product_variant_id', $variant->id)->exists();
            if ($hasRows) {
                $anyRows = true;
                if ((float) $variant->stock_quantity !== $sum) {
                    $variant->forceFill(['stock_quantity' => $sum])->save();
                }
                $productTotal += $sum;
            } else {
                $productTotal += (float) $variant->stock_quantity;
            }
        }

        if ($anyRows) {
            $product->forceFill([
                'stock_quantity' => $productTotal,
                'in_stock'       => $productTotal > 0,
            ])->save();
        }
    }

    /** A sensible base unit id: a "piece/each" unit if present, else the first. */
    private function defaultUnitId(): int
    {
        foreach (['pcs', 'pc', 'ea', 'each', 'unit', 'item', 'piece'] as $code) {
            $u = UnitOfMeasure::where('code', $code)->first();
            if ($u) {
                return $u->id;
            }
        }
        $first = UnitOfMeasure::query()->orderBy('id')->first();
        if (!$first) {
            throw new \RuntimeException('No unit of measure exists — create one before setting stock.');
        }
        return $first->id;
    }
}
