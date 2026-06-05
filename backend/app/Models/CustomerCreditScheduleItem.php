<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditScheduleItem extends Model
{
    protected $fillable = [
        'schedule_id',
        'installment_number',
        'amount',
        'due_date',
        'paid_at',
        'transaction_id',
        'status',
    ];

    protected $casts = [
        'amount'   => 'decimal:2',
        'due_date' => 'date',
        'paid_at'  => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(CustomerCreditSchedule::class, 'schedule_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(CustomerCreditTransaction::class, 'transaction_id');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isActionable(): bool
    {
        return in_array($this->status, ['pending', 'overdue']);
    }

    public function isOverdue(): bool
    {
        return $this->status === 'pending' && $this->due_date->isPast();
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeOverdue($query)
    {
        return $query->where('status', 'overdue');
    }

    public function scopeDueBefore($query, string $date)
    {
        return $query->whereDate('due_date', '<=', $date);
    }
}