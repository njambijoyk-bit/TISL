<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};
use App\Traits\Inventory\HasPolymorphicAssignee;

class InventoryReturnAudit extends Model
{
    use HasPolymorphicAssignee;

    protected $table = 'inventory_return_audits';

    protected $fillable = [
        'trigger_type',
        'assignee_type', 'assignee_id', 'assignee_label',
        'conducted_by', 'audit_date',
        'auto_score', 'score_override', 'final_score',
        'items_expected', 'items_returned', 'items_missing', 'items_damaged',
        'status', 'notes',
    ];

    protected $casts = [
        'audit_date'     => 'date',
        'auto_score'     => 'decimal:2',
        'score_override' => 'decimal:2',
        'final_score'    => 'decimal:2',
    ];

    public function auditItems(): HasMany
    {
        return $this->hasMany(InventoryReturnAuditItem::class, 'audit_id');
    }

    public function conductedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'conducted_by');
    }

    public function computeAutoScore(): float
    {
        $items = $this->auditItems;
        if ($items->isEmpty()) return 0;
        $total = $items->sum(fn($item) => $item->is_returned ? ($item->final_score ?? 0) : 0);
        return round($total / $items->count(), 2);
    }

    public function getEffectiveScoreAttribute(): ?float
    {
        return $this->score_override ?? $this->auto_score;
    }

    public function getReturnRateAttribute(): ?float
    {
        if (! $this->items_expected) return null;
        return round(($this->items_returned / $this->items_expected) * 100, 1);
    }

    public function scopePending($q)    { return $q->where('status', 'pending'); }
    public function scopeInProgress($q) { return $q->where('status', 'in_progress'); }
    public function scopeCompleted($q)  { return $q->where('status', 'completed'); }

    public function scopeForAssignee($q, string $type, ?int $id)
    {
        return $q->where('assignee_type', $type)->where('assignee_id', $id);
    }
}
