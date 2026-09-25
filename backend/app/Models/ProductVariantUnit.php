<?php

namespace App\Models;

use App\Traits\LogsProductActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A sellable/purchasable unit for a variant. Every variant has exactly one
 * role = 'base' row (enforced by the DB's uniq_one_base key over the
 * generated base_marker column); 'compound' rows bundle N of another
 * variant unit (e.g. a carton of 12 bottles); 'alternate' rows are just
 * another unit the same base stock can be sold in (e.g. also sold by 'kg').
 */
class ProductVariantUnit extends Model
{
    use LogsProductActivity;

    public const ROLE_BASE      = 'base';
    public const ROLE_COMPOUND  = 'compound';
    public const ROLE_ALTERNATE = 'alternate';

    protected $table = 'product_variant_units';

    protected $fillable = [
        'variant_id',
        'unit_id',
        'role',
        'contains_variant_unit_id',
        'contains_qty',
        'base_factor',
        'price',
        'compare_at_price',
        'is_sellable',
        'is_purchasable',
        'is_default_sale',
        'position',
        'is_active',
    ];

    // base_marker is a DB-generated (STORED GENERATED) column - never fillable,
    // Eloquent should just read it back after save.
    protected $casts = [
        'contains_qty'     => 'decimal:4',
        'base_factor'      => 'decimal:10',
        'price'            => 'decimal:2',
        'compare_at_price' => 'decimal:2',
        'is_sellable'      => 'boolean',
        'is_purchasable'   => 'boolean',
        'is_default_sale'  => 'boolean',
        'is_active'        => 'boolean',
        'base_marker'      => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_id');
    }

    /** For role = compound: the variant unit this one is made up of N of. */
    public function containsVariantUnit(): BelongsTo
    {
        return $this->belongsTo(self::class, 'contains_variant_unit_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeSellable(Builder $query): Builder
    {
        return $query->where('is_sellable', true)->active();
    }

    public function scopePurchasable(Builder $query): Builder
    {
        return $query->where('is_purchasable', true)->active();
    }

    public function scopeBase(Builder $query): Builder
    {
        return $query->where('role', self::ROLE_BASE);
    }

    public function scopeForVariant(Builder $query, int $variantId): Builder
    {
        return $query->where('variant_id', $variantId);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isBase(): bool
    {
        return $this->role === self::ROLE_BASE;
    }

    public function isCompound(): bool
    {
        return $this->role === self::ROLE_COMPOUND;
    }

    /**
     * The price to sell at: this row's own price if set, otherwise derived
     * from the variant's base unit price x base_factor.
     */
    public function effectivePrice(): ?float
    {
        if ($this->price !== null) {
            return (float) $this->price;
        }

        if ($this->isBase()) {
            return null; // base row with no price set - nothing to derive from
        }

        $base = $this->relationLoaded('variant')
            ? $this->variant->units->firstWhere('role', self::ROLE_BASE)
            : self::query()->forVariant($this->variant_id)->base()->first();

        return $base !== null && $base->price !== null
            ? round((float) $base->price * (float) $this->base_factor, 2)
            : null;
    }

    /** Stock available for this unit, expressed in its own unit (base stock / base_factor). */
    public function availableQuantity(): float
    {
        $variant = $this->relationLoaded('variant') ? $this->variant : $this->variant()->first();

        if ($variant === null || (float) $this->base_factor <= 0) {
            return 0.0;
        }

        return round((float) $variant->stock_quantity / (float) $this->base_factor, 4);
    }
}
