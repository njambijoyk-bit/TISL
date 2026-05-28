<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};
use App\Traits\Inventory\HasConditionScore;

class InventoryRepair extends Model
{
    use HasConditionScore;

    protected $table = 'inventory_repairs';

    protected $fillable = [
        'instance_id', 'item_id', 'reported_by', 'reported_at',
        'fault_category', 'issue_description',
        'condition_before', 'condition_score_before',
        'vendor_name', 'technician_name', 'repair_location',
        'estimated_cost', 'actual_cost',
        'sent_at', 'expected_return_date', 'returned_at',
        'resolution_notes', 'condition_after', 'condition_score_after',
        'status', 'repair_sequence', 'notes',
    ];

    protected $casts = [
        'reported_at'            => 'datetime',
        'sent_at'                => 'datetime',
        'returned_at'            => 'datetime',
        'expected_return_date'   => 'date',
        'estimated_cost'         => 'decimal:2',
        'actual_cost'            => 'decimal:2',
        'condition_score_before' => 'decimal:2',
        'condition_score_after'  => 'decimal:2',
    ];

    public function getFinalScoreAttribute(): ?float
    {
        return $this->condition_score_after;
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'instance_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function reportedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'reported_by');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(InventoryDispute::class, 'repair_id');
    }

    public function getIsActiveAttribute(): bool
    {
        return in_array($this->status, ['reported', 'sent', 'in_progress']);
    }

    public function getDaysInRepairAttribute(): ?int
    {
        if (! $this->sent_at) return null;
        $end = $this->returned_at ?? now();
        return (int) $this->sent_at->diffInDays($end);
    }

    public function getConditionDeltaAttribute(): ?float
    {
        if ($this->condition_score_before === null || $this->condition_score_after === null) return null;
        return $this->condition_score_after - $this->condition_score_before;
    }

    public function scopeActive($q)
    {
        return $q->whereIn('status', ['reported', 'sent', 'in_progress']);
    }

    public function scopeCompleted($q) { return $q->where('status', 'completed'); }

    public function scopeOverdue($q)
    {
        return $q->whereIn('status', ['sent', 'in_progress'])
                 ->whereNotNull('expected_return_date')
                 ->whereDate('expected_return_date', '<', now());
    }

    public function scopeChronicProblems($q, int $minRepairs = 3)
    {
        return $q->where('repair_sequence', '>=', $minRepairs);
    }
}
