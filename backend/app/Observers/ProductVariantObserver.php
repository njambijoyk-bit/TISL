<?php

namespace App\Observers;

use App\Models\ProductVariant;
use App\Services\Location\VariantStockService;

/**
 * Keeps per-branch stock and the product's cached stock total in step with
 * variants. On create, a new variant is seeded across branches (entered qty in
 * Main, 0 elsewhere); on delete, the product total is recomputed.
 */
class ProductVariantObserver
{
    public function __construct(private VariantStockService $stock) {}

    public function created(ProductVariant $variant): void
    {
        $this->stock->seedNewVariant($variant, (float) ($variant->stock_quantity ?? 0));
    }

    public function deleted(ProductVariant $variant): void
    {
        $variant->loadMissing('product');
        if ($variant->product) {
            $this->stock->recomputeCaches($variant->product);
        }
    }
}
