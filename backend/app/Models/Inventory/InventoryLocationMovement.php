<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryLocationMovement extends Model
{
    const UPDATED_AT = null;

    protected $table = 'inventory_location_movements';

    protected $fillable = [
        'item_id', 'instance_id', 'quantity',
        'from_location_id', 'to_location_id',
        'from_location_label', 'to_location_label',
        'reason', 'reference_type', 'reference_id',
        'moved_by', 'moved_at', 'notes',
    ];

    protected $casts = [
        'moved_at' => 'datetime',
        'quantity' => 'decimal:2',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'instance_id');
    }

    public function fromLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'from_location_id');
    }

    public function toLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'to_location_id');
    }

    public function movedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'moved_by');
    }
}
