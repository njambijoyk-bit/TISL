<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class InventoryItem extends Model
{
    use SoftDeletes;

    protected $table = 'inventory_items';

    protected $fillable = [
        'category_id', 'product_id', 'name', 'description', 'brand', 'model',
        'type', 'is_serialized', 'unit_of_measure', 'default_location_id',
        'purchase_cost', 'replacement_cost', 'is_loanable', 'max_loan_days',
        'low_stock_threshold',
        'total_qty', 'available_qty', 'reserved_qty', 'issued_qty',
        'loaned_qty', 'in_repair_qty', 'retired_qty',
        'is_active', 'notes', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'is_serialized'    => 'boolean',
        'is_loanable'      => 'boolean',
        'is_active'        => 'boolean',
        'purchase_cost'    => 'decimal:2',
        'replacement_cost' => 'decimal:2',
        'total_qty'        => 'decimal:2',
        'available_qty'    => 'decimal:2',
        'reserved_qty'     => 'decimal:2',
        'issued_qty'       => 'decimal:2',
        'loaned_qty'       => 'decimal:2',
        'in_repair_qty'    => 'decimal:2',
        'retired_qty'      => 'decimal:2',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'category_id');
    }

    public function defaultLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'default_location_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Product::class, 'product_id');
    }

    public function instances(): HasMany
    {
        return $this->hasMany(InventoryInstance::class, 'item_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(InventoryAssignment::class, 'item_id');
    }

    public function lifecycleMovements(): HasMany
    {
        return $this->hasMany(InventoryLifecycleMovement::class, 'item_id');
    }

    public function locationMovements(): HasMany
    {
        return $this->hasMany(InventoryLocationMovement::class, 'item_id');
    }

    public function repairs(): HasMany
    {
        return $this->hasMany(InventoryRepair::class, 'item_id');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(InventoryDispute::class, 'item_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'updated_by');
    }

    public function getIsLowStockAttribute(): bool
    {
        if (! $this->low_stock_threshold) return false;
        return $this->available_qty <= $this->low_stock_threshold;
    }

    public function scopeActive($q)        { return $q->where('is_active', true); }
    public function scopeSerialized($q)    { return $q->where('is_serialized', true); }
    public function scopeNonSerialized($q) { return $q->where('is_serialized', false); }
    public function scopeOfType($q, string $type) { return $q->where('type', $type); }
    public function scopeLowStock($q)
    {
        return $q->whereNotNull('low_stock_threshold')
                 ->whereColumn('available_qty', '<=', 'low_stock_threshold');
    }
}
