<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A material a service package normally uses: a product variant, how much of it (in the product's stock unit) and whether
 * it is charged to the customer or included in the price. It fills in on every sale of the package and can be changed there.
 */
class ServiceVariantMaterial extends Model
{
    public const CHARGED = 'charged';
    public const INCLUDED = 'included';

    protected $table = 'service_variant_materials';

    protected $fillable = ['service_variant_id', 'variant_id', 'quantity', 'mode', 'position'];

    protected $casts = ['quantity' => 'decimal:4'];

    public function package(): BelongsTo
    {
        return $this->belongsTo(ServiceVariant::class, 'service_variant_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    /** The row as the editor and the voucher form read it. */
    public function toRow(): array
    {
        $v = $this->variant;
        $base = $v?->units->firstWhere('role', 'base') ?? $v?->units->first();
        $base?->setRelation('variant', $v);

        return [
            'id' => $this->id, 'variant_id' => (int) $this->variant_id, 'mode' => $this->mode, 'quantity' => (float) $this->quantity,
            'product' => $v?->product?->name, 'variant' => $v?->name, 'sku' => $v?->sku,
            'variant_unit_id' => $base?->id, 'unit_code' => $base?->unit?->code,
            'for_sale' => (bool) $v?->product?->is_for_sale,
            'price' => $base ? $base->effectivePrice() : null,
        ];
    }
}
