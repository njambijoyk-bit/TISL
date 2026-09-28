<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * "Priced-at": an optional per-branch price override for any sellable.
 *
 * `amount` is ALWAYS stored net (tax-exclusive) — inclusive is derived per
 * branch at display/checkout. `is_tax_inclusive` only records how the admin
 * typed it, so the editor can round-trip; the resolver always treats `amount`
 * as net. No row = use the base price (auto-converted to the branch currency).
 */
class LocationPrice extends Model
{
    protected $table = 'location_price';

    protected $fillable = [
        'sellable_type', 'sellable_id', 'location_id',
        'amount', 'currency_id', 'is_tax_inclusive',
    ];

    protected $casts = [
        'amount'           => 'decimal:4',
        'is_tax_inclusive' => 'boolean',
    ];

    public function sellable(): MorphTo
    {
        return $this->morphTo(null, 'sellable_type', 'sellable_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }
}
