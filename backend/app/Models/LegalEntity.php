<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * A company with its own books. Groundwork: there is one (the default, made from the company profile and base currency), every location
 * belongs to it, and nothing else changes yet. Later steps give each entity its own chart, base currency, period lock and numbering.
 */
class LegalEntity extends Model
{
    protected $fillable = ['name', 'short_code', 'legal_name', 'country', 'tax_pin', 'base_currency_id', 'is_default', 'is_active', 'sort_order'];

    protected $casts = ['is_default' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];

    /** Has script 100 been run? Before it, the system behaves as one company and nothing asks for an entity. */
    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('legal_entities');
    }

    public function locations()
    {
        return $this->hasMany(Location::class, 'legal_entity_id');
    }

    public function baseCurrency()
    {
        return $this->belongsTo(Currency::class, 'base_currency_id');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    /** The default entity (or the first active one). */
    public static function default(): ?self
    {
        if (! static::ready()) {
            return null;
        }

        return static::query()->where('is_default', true)->first() ?? static::query()->active()->orderBy('sort_order')->orderBy('id')->first();
    }
}
