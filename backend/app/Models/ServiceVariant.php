<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A package: one purchasable version of a service, with its own price,
 * duration and price unit. Generated from option combinations (like product
 * variants) or hand-made (is_custom). Prices are in the service's currency and
 * exclude tax.
 */
class ServiceVariant extends Model
{
    protected $table = 'service_variants';

    protected $fillable = [
        'service_id', 'name', 'description', 'combination_key', 'is_custom', 'is_default', 'status',
        'price', 'compare_at_price', 'duration_value', 'duration_unit_id', 'price_unit_id', 'position',
    ];

    protected $casts = [
        'is_custom'        => 'boolean',
        'is_default'       => 'boolean',
        'price'            => 'decimal:2',
        'compare_at_price' => 'decimal:2',
        'duration_value'   => 'decimal:2',
    ];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function optionValues(): BelongsToMany
    {
        return $this->belongsToMany(ServiceOptionValue::class, 'service_variant_options', 'variant_id', 'option_value_id');
    }

    /** The materials this package normally uses (charged or included). */
    public function materials(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ServiceVariantMaterial::class, 'service_variant_id')->orderBy('position')->orderBy('id');
    }

    public function durationUnit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'duration_unit_id');
    }

    public function priceUnit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'price_unit_id');
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('status', 'active');
    }

    /** "Type: Gel / Size: Large" from the loaded option values. */
    public function optionLabel(): string
    {
        return $this->optionValues->map(fn ($v) => $v->value)->implode(' / ');
    }

    /** Stable key for a set of option value ids (sorted, dash-joined). */
    public static function keyFor(array $optionValueIds): string
    {
        $ids = array_map('intval', $optionValueIds);
        sort($ids);

        return implode('-', $ids);
    }
}
