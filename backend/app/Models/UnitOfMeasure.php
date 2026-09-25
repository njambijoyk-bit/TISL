<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use InvalidArgumentException;

/**
 * A unit of measure within a dimension (volume, mass, length, count,
 * packaging...). to_base_factor converts 1 of this unit into the
 * dimension's base unit (e.g. 'mL' -> 0.001 of 'L'). Conversion is only
 * meaningful between units sharing the same dimension.
 */
class UnitOfMeasure extends Model
{
    protected $table = 'units_of_measure';

    protected $fillable = [
        'code',
        'name',
        'dimension',
        'unit_system',
        'to_base_factor',
        'is_active',
    ];

    protected $casts = [
        'to_base_factor' => 'decimal:10',
        'is_active'      => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxRates(): HasMany
    {
        return $this->hasMany(TaxRate::class, 'unit_of_measure_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class, 'net_content_unit_id');
    }

    public function variantUnits(): HasMany
    {
        return $this->hasMany(ProductVariantUnit::class, 'unit_id');
    }

    public function localeDefaults(): HasMany
    {
        return $this->hasMany(UnitLocaleDefault::class, 'unit_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeDimension(Builder $query, string $dimension): Builder
    {
        return $query->where('dimension', $dimension);
    }

    public function scopeSystem(Builder $query, string $unitSystem): Builder
    {
        return $query->where('unit_system', $unitSystem);
    }

    // ========================================
    // HELPERS
    // ========================================

    public static function findByCode(string $code): ?self
    {
        return static::where('code', $code)->first();
    }

    /** A quantity of this unit, expressed in the dimension's base unit. */
    public function toBase(float $quantity): float
    {
        return round($quantity * (float) $this->to_base_factor, 10);
    }

    /** A quantity already in the dimension's base unit, expressed in this unit. */
    public function fromBase(float $baseQuantity): float
    {
        if ((float) $this->to_base_factor == 0.0) {
            throw new InvalidArgumentException("Unit [{$this->code}] has a zero to_base_factor.");
        }

        return round($baseQuantity / (float) $this->to_base_factor, 10);
    }

    /**
     * Convert a quantity of this unit into another unit. Both must share
     * the same dimension (e.g. volume -> volume); converting across
     * dimensions (e.g. volume -> mass) is not physically meaningful here.
     */
    public function convertTo(self $target, float $quantity): float
    {
        if ($this->dimension !== $target->dimension) {
            throw new InvalidArgumentException(
                "Cannot convert [{$this->code}] ({$this->dimension}) to [{$target->code}] ({$target->dimension}) - different dimensions."
            );
        }

        return $target->fromBase($this->toBase($quantity));
    }
}
