<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-branch stock for a product variant (the atomic sellable).
 *
 * Truth for "how many at this branch". A product is "location-managed" once any
 * of its variants has a row here; a product with no rows anywhere is treated as
 * legacy/global (sold everywhere) until an admin sets its branch stock.
 * variant.stock_quantity / product.stock_quantity are caches derived from these
 * rows (see VariantStockService).
 */
class VariantLocationStock extends Model
{
    protected $table = 'variant_location_stock';

    protected $fillable = ['product_variant_id', 'location_id', 'quantity', 'reorder_level'];

    protected $casts = [
        'quantity'      => 'decimal:4',
        'reorder_level' => 'decimal:4',
    ];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
