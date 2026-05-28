<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryLifecycleMovement extends Model
{
    const UPDATED_AT = null;

    protected $table = 'inventory_lifecycle_movements';

    protected $fillable = [
        'item_id', 'instance_id', 'quantity', 'movement_type',
        'condition_before', 'condition_after',
        'status_before', 'status_after',
        'score_before', 'score_after',
        'reference_type', 'reference_id',
        'performed_by', 'performed_at', 'notes',
    ];

    protected $casts = [
        'performed_at' => 'datetime',
        'quantity'     => 'decimal:2',
        'score_before' => 'decimal:2',
        'score_after'  => 'decimal:2',
    ];

    public static function boot(): void
    {
        parent::boot();
        static::updating(fn() => throw new \LogicException('Lifecycle movements are immutable.'));
        static::deleting(fn() => throw new \LogicException('Lifecycle movements cannot be deleted.'));
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'instance_id');
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'performed_by');
    }

    public function scopeOfType($q, string $type) { return $q->where('movement_type', $type); }
    public function scopeForReference($q, string $type, int $id)
    {
        return $q->where('reference_type', $type)->where('reference_id', $id);
    }
}
