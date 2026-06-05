<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerCreditSchedule extends Model
{
    protected $fillable = [
        'customer_id',
        'total_amount',
        'installments',
        'frequency',
        'started_at',
        'next_due_date',
        'status',
        'note',
        'created_by',
    ];

    protected $casts = [
        'total_amount'  => 'decimal:2',
        'started_at'    => 'date',
        'next_due_date' => 'date',
        'created_at'    => 'datetime',
        'updated_at'    => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CustomerCreditScheduleItem::class, 'schedule_id')
                    ->orderBy('installment_number');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Amount paid so far across all paid items.
     */
    public function amountPaid(): float
    {
        return (float) $this->items()->where('status', 'paid')->sum('amount');
    }

    /**
     * Amount still outstanding (pending + overdue items).
     */
    public function amountOutstanding(): float
    {
        return (float) $this->items()
            ->whereIn('status', ['pending', 'overdue'])
            ->sum('amount');
    }

    /**
     * True when all items are paid or waived.
     */
    public function isFullySettled(): bool
    {
        return $this->items()
            ->whereNotIn('status', ['paid', 'waived'])
            ->doesntExist();
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeDueOn($query, string $date)
    {
        return $query->where('next_due_date', '<=', $date);
    }
}