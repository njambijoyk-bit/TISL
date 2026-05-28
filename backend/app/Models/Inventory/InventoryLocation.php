<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class InventoryLocation extends Model
{
    protected $table = 'inventory_locations';

    protected $fillable = [
        'parent_id', 'name', 'code', 'type', 'address', 'is_active', 'notes', 'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(InventoryLocation::class, 'parent_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'default_location_id');
    }

    public function instances(): HasMany
    {
        return $this->hasMany(InventoryInstance::class, 'current_location_id');
    }

    public function incomingLocationMovements(): HasMany
    {
        return $this->hasMany(InventoryLocationMovement::class, 'to_location_id');
    }

    public function outgoingLocationMovements(): HasMany
    {
        return $this->hasMany(InventoryLocationMovement::class, 'from_location_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    public function scopeOfType($q, string $type)
    {
        return $q->where('type', $type);
    }
}
