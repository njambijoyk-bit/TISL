<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};
use App\Traits\Inventory\HasConditionScore;
use App\Traits\Inventory\WritesLifecycleMovements;

class InventoryInstance extends Model
{
    use SoftDeletes, HasConditionScore, WritesLifecycleMovements;

    protected $table = 'inventory_instances';

    protected $fillable = [
        'item_id', 'serial_number', 'asset_tag', 'barcode',
        'status', 'condition', 'condition_score', 'condition_score_override',
        'current_location_id', 'current_assignee_type', 'current_assignee_id',
        'current_assignee_label', 'current_assignment_id',
        'purchase_date', 'purchase_cost', 'warranty_expiry', 'useful_life_years',
        'is_obsolete', 'obsolete_reason', 'obsolete_declared_at', 'obsolete_declared_by',
        'notes', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'purchase_date'            => 'date',
        'warranty_expiry'          => 'date',
        'obsolete_declared_at'     => 'datetime',
        'purchase_cost'            => 'decimal:2',
        'condition_score'          => 'decimal:2',
        'condition_score_override' => 'decimal:2',
        'is_obsolete'              => 'boolean',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function currentLocation(): BelongsTo
    {
        return $this->belongsTo(InventoryLocation::class, 'current_location_id');
    }

    public function currentAssignment(): BelongsTo
    {
        return $this->belongsTo(InventoryAssignment::class, 'current_assignment_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(InventoryAssignment::class, 'instance_id');
    }

    public function repairs(): HasMany
    {
        return $this->hasMany(InventoryRepair::class, 'instance_id');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(InventoryDispute::class, 'instance_id');
    }

    public function lifecycleMovements(): HasMany
    {
        return $this->hasMany(InventoryLifecycleMovement::class, 'instance_id');
    }

    public function locationMovements(): HasMany
    {
        return $this->hasMany(InventoryLocationMovement::class, 'instance_id');
    }

    public function obsoleteDeclaredBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'obsolete_declared_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'updated_by');
    }

    public function getIsUnderWarrantyAttribute(): bool
    {
        return $this->warranty_expiry && $this->warranty_expiry->isFuture();
    }

    public function getRepairCountAttribute(): int
    {
        return $this->repairs()->count();
    }

    public function scopeAvailable($q) { return $q->where('status', 'available'); }
    public function scopeIssued($q)    { return $q->where('status', 'issued'); }
    public function scopeLoaned($q)    { return $q->where('status', 'loaned'); }
    public function scopeInRepair($q)  { return $q->where('status', 'in_repair'); }
    public function scopeRetired($q)   { return $q->where('status', 'retired'); }
    public function scopeObsolete($q)  { return $q->where('is_obsolete', true); }
    public function scopeActive($q)
    {
        return $q->whereNotIn('status', ['retired', 'disposed', 'lost'])
                 ->where('is_obsolete', false);
    }
}
