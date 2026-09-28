<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * "Offered-at": whether a sellable is available at a branch.
 *
 * Polymorphic over the morph aliases (product, service, menu_item, room…), so
 * every module reuses the same table. A sellable with `location_mode = all`
 * needs no rows here — it's offered everywhere.
 */
class LocationOffering extends Model
{
    protected $table = 'location_offering';

    protected $fillable = ['sellable_type', 'sellable_id', 'location_id', 'is_available'];

    protected $casts = [
        'is_available' => 'boolean',
    ];

    public function sellable(): MorphTo
    {
        return $this->morphTo(null, 'sellable_type', 'sellable_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
