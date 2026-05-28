<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\Inventory\HasConditionScore;

class InventoryReturnAuditItem extends Model
{
    use HasConditionScore;

    protected $table = 'inventory_return_audit_items';

    protected $fillable = [
        'audit_id', 'assignment_id', 'instance_id', 'item_id',
        'item_name', 'asset_tag', 'serial_number',
        'expected_condition', 'expected_score',
        'is_returned', 'actual_condition', 'actual_score',
        'score_override', 'final_score',
        'discrepancy_notes', 'disposition',
    ];

    protected $casts = [
        'is_returned'    => 'boolean',
        'expected_score' => 'decimal:2',
        'actual_score'   => 'decimal:2',
        'score_override' => 'decimal:2',
        'final_score'    => 'decimal:2',
    ];

    public function getFinalScoreAttribute(): float
    {
        if (! $this->is_returned) return 0;
        return $this->score_override ?? $this->actual_score ?? 0;
    }

    public function getScoreDeltaAttribute(): ?float
    {
        if ($this->expected_score === null || $this->actual_score === null) return null;
        return $this->actual_score - $this->expected_score;
    }

    public function audit(): BelongsTo
    {
        return $this->belongsTo(InventoryReturnAudit::class, 'audit_id');
    }

    public function assignment(): BelongsTo
    {
        return $this->belongsTo(InventoryAssignment::class, 'assignment_id');
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'instance_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function scopeReturned($q) { return $q->where('is_returned', true); }
    public function scopeMissing($q)  { return $q->where('disposition', 'missing'); }
    public function scopePending($q)  { return $q->where('disposition', 'pending'); }
    public function scopeDamaged($q)
    {
        return $q->whereIn('disposition', ['damaged_accepted', 'replacement_required', 'written_off']);
    }
}
