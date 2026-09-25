<?php

namespace App\Models;

use App\Traits\LogsProductActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProductVariant extends Model
{
    use LogsProductActivity, SoftDeletes;

    public const STATUS_ACTIVE       = 'active';
    public const STATUS_INACTIVE     = 'inactive';
    public const STATUS_DISCONTINUED = 'discontinued';

    protected $table = 'product_variants';

    protected $fillable = [
        'product_id',
        'sku',
        'barcode',
        'name',
        'combination_key',
        'is_default',
        'net_content_qty',
        'net_content_unit_id',
        'stock_quantity',
        'status',
    ];

    protected $casts = [
        'is_default'      => 'boolean',
        'net_content_qty' => 'decimal:4',
        'stock_quantity'  => 'decimal:4',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** The unit net_content_qty is expressed in (e.g. 0.5 of 'L'). */
    public function contentUnit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'net_content_unit_id');
    }

    public function units(): HasMany
    {
        return $this->hasMany(ProductVariantUnit::class, 'variant_id')->orderBy('position');
    }

    public function baseUnit(): HasOne
    {
        return $this->hasOne(ProductVariantUnit::class, 'variant_id')->where('role', ProductVariantUnit::ROLE_BASE);
    }

    public function optionValues(): BelongsToMany
    {
        return $this->belongsToMany(
            ProductOptionValue::class,
            'product_variant_options',
            'variant_id',
            'option_value_id'
        )->using(ProductVariantOption::class)->withPivot('option_id');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class, 'variant_id')->orderBy('position');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopeForProduct(Builder $query, int $productId): Builder
    {
        return $query->where('product_id', $productId);
    }

    public function scopeDefault(Builder $query): Builder
    {
        return $query->where('is_default', true);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function isDefault(): bool
    {
        return (bool) $this->is_default;
    }

    public function inStock(): bool
    {
        return (float) $this->stock_quantity > 0;
    }

    /**
     * Assign this variant's option values, one per option, keyed by
     * option_id => option_value_id. Replaces any existing selections.
     */
    public function syncOptionValues(array $optionValueIdsByOptionId): void
    {
        $attach = [];

        foreach ($optionValueIdsByOptionId as $optionId => $optionValueId) {
            $attach[$optionValueId] = ['option_id' => $optionId];
        }

        $this->optionValues()->sync($attach);
    }
}
