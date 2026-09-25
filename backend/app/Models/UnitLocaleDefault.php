<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Which unit a locale defaults to for a given dimension - e.g. locale
 * 'US', dimension 'length' -> unit 'in'; locale 'GB', dimension 'length'
 * -> unit 'mm'. Used to pick a display/entry unit without hardcoding
 * imperial-vs-metric anywhere in the UI layer.
 */
class UnitLocaleDefault extends Model
{
    protected $table = 'unit_locale_defaults';

    protected $fillable = [
        'locale',
        'dimension',
        'unit_id',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeForLocale(Builder $query, string $locale): Builder
    {
        return $query->where('locale', $locale);
    }

    public function scopeForDimension(Builder $query, string $dimension): Builder
    {
        return $query->where('dimension', $dimension);
    }

    // ========================================
    // HELPERS
    // ========================================

    /** The default unit for a locale+dimension, or null if none is configured. */
    public static function defaultFor(string $locale, string $dimension): ?UnitOfMeasure
    {
        return static::query()
            ->forLocale($locale)
            ->forDimension($dimension)
            ->first()
            ?->unit;
    }
}
