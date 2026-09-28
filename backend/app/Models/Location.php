<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A branch / physical location (Core, multi-location).
 *
 * A single-branch business has exactly one row ("Main") and never sees the
 * location UI. A branch carries its own currency and tax district, which is
 * what lets price and tax resolve per branch (see PriceResolver). Stock is NOT
 * here — it lives in the Inventory (Extras) tier, keyed by location_id.
 */
class Location extends Model
{
    protected $table = 'locations';

    protected $fillable = [
        'name', 'code', 'currency_id', 'tax_district_id',
        'phone', 'email',
        'address_line1', 'address_line2', 'city', 'state', 'country', 'postal_code',
        'latitude', 'longitude', 'timezone', 'opening_hours',
        'price_display_default', 'accepts_pickup', 'accepts_delivery', 'delivery_zone',
        'is_default', 'is_active', 'sort_order',
    ];

    protected $casts = [
        'opening_hours'    => 'array',
        'delivery_zone'    => 'array',
        'latitude'         => 'decimal:7',
        'longitude'        => 'decimal:7',
        'accepts_pickup'   => 'boolean',
        'accepts_delivery' => 'boolean',
        'is_default'       => 'boolean',
        'is_active'        => 'boolean',
        'sort_order'       => 'integer',
    ];

    // ── Relationships ───────────────────────────────────────────────────────

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function taxDistrict(): BelongsTo
    {
        return $this->belongsTo(TaxDistrict::class, 'tax_district_id');
    }

    /** Staff assigned to (cleared for) this branch. */
    public function staff(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'location_user')
            ->withPivot('role_scope')
            ->withTimestamps();
    }

    public function offerings(): HasMany
    {
        return $this->hasMany(LocationOffering::class);
    }

    public function priceOverrides(): HasMany
    {
        return $this->hasMany(LocationPrice::class);
    }

    // ── Scopes ──────────────────────────────────────────────────────────────

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }

    public function scopeOrdered(Builder $q): Builder
    {
        return $q->orderBy('sort_order')->orderBy('name');
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** The default branch (or the first active one, or any). */
    public static function default(): ?self
    {
        return static::query()->where('is_default', true)->first()
            ?? static::query()->active()->ordered()->first()
            ?? static::query()->ordered()->first();
    }

    /** True once the business runs more than one branch (drives the UI). */
    public static function isMultiBranch(): bool
    {
        return static::query()->count() > 1;
    }
}
