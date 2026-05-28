<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};
use App\Traits\Inventory\HasPolymorphicAssignee;

class InventoryAssignment extends Model
{
    use HasPolymorphicAssignee;

    protected $table = 'inventory_assignments';

    protected $fillable = [
        'item_id', 'instance_id', 'quantity', 'assignment_type',
        'assignee_type', 'assignee_id', 'assignee_label',
        'issued_by', 'issued_at', 'expected_return_date',
        'issue_condition', 'issue_condition_score', 'issue_notes',
        'returned_at', 'received_by',
        'return_condition', 'return_condition_score', 'return_score_override',
        'return_notes', 'return_discrepancy_notes',
        'status',
    ];

    protected $casts = [
        'issued_at'                => 'datetime',
        'returned_at'              => 'datetime',
        'expected_return_date'     => 'date',
        'quantity'                 => 'decimal:2',
        'issue_condition_score'    => 'decimal:2',
        'return_condition_score'   => 'decimal:2',
        'return_score_override'    => 'decimal:2',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'item_id');
    }

    public function instance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'instance_id');
    }

    public function issuedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'issued_by');
    }

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'received_by');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(InventoryDispute::class, 'assignment_id');
    }

    public function auditItems(): HasMany
    {
        return $this->hasMany(InventoryReturnAuditItem::class, 'assignment_id');
    }

    public function getFinalReturnScoreAttribute(): ?float
    {
        return $this->return_score_override ?? $this->return_condition_score;
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->status === 'active'
            && $this->expected_return_date
            && $this->expected_return_date->isPast();
    }

    public function getDaysOverdueAttribute(): int
    {
        if (! $this->is_overdue) return 0;
        return (int) $this->expected_return_date->diffInDays(now());
    }

    public function scopeActive($q)    { return $q->where('status', 'active'); }
    public function scopeReturned($q)  { return $q->where('status', 'returned'); }
    public function scopeOverdue($q)   { return $q->where('status', 'overdue'); }
    public function scopeLost($q)      { return $q->where('status', 'lost'); }
    public function scopeDisputed($q)  { return $q->where('status', 'disputed'); }
    public function scopeLoans($q)     { return $q->where('assignment_type', 'loan'); }

    public function scopeForAssignee($q, string $type, ?int $id)
    {
        return $q->where('assignee_type', $type)->where('assignee_id', $id);
    }
}
