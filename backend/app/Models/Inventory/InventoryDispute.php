<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\Inventory\HasPolymorphicAssignee;

class InventoryDispute extends Model
{
    use HasPolymorphicAssignee;

    protected $table = 'inventory_disputes';

    protected $fillable = [
        'assignment_id', 'instance_id', 'item_id',
        'raised_by', 'raised_at', 'dispute_type',
        'description', 'evidence_notes',
        'against_assignee_type', 'against_assignee_id', 'against_assignee_label',
        'ruling', 'ruling_notes', 'ruling_by', 'ruling_at',
        'replacement_required', 'replacement_instance_id',
        'repair_required', 'repair_id',
        'financial_liability', 'status', 'notes',
    ];

    protected $casts = [
        'raised_at'            => 'datetime',
        'ruling_at'            => 'datetime',
        'replacement_required' => 'boolean',
        'repair_required'      => 'boolean',
        'financial_liability'  => 'decimal:2',
    ];

    public function resolveAssignee(): mixed
    {
        $type = $this->against_assignee_type;
        $id   = $this->against_assignee_id;
        if (! $type || ! $id) return null;
        return match ($type) {
            'employee' => \App\Models\Employee::find($id),
            'customer' => \App\Models\Customer::find($id),
            'group'    => InventoryGroup::find($id),
            default    => null,
        };
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

    public function raisedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'raised_by');
    }

    public function rulingBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'ruling_by');
    }

    public function replacementInstance(): BelongsTo
    {
        return $this->belongsTo(InventoryInstance::class, 'replacement_instance_id');
    }

    public function repair(): BelongsTo
    {
        return $this->belongsTo(InventoryRepair::class, 'repair_id');
    }

    public function scopeOpen($q)           { return $q->where('status', 'open'); }
    public function scopeUnresolved($q)     { return $q->whereIn('status', ['open', 'under_review', 'escalated']); }
    public function scopeResolved($q)       { return $q->where('status', 'resolved'); }
    public function scopeAssigneeLiable($q) { return $q->where('ruling', 'assignee_liable'); }
}
