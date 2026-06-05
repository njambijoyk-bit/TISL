<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerCreditInvoice extends Model
{
    protected $fillable = [
        'customer_id',
        'invoice_number',
        'currency_id',
        'subtotal',
        'interest_amount',
        'total',
        'status',
        'due_date',
        'paid_at',
        'sent_at',
        'note',
        'created_by',
    ];

    protected $casts = [
        'subtotal'        => 'decimal:2',
        'interest_amount' => 'decimal:2',
        'total'           => 'decimal:2',
        'due_date'        => 'date',
        'paid_at'         => 'datetime',
        'sent_at'         => 'datetime',
        'created_at'      => 'datetime',
        'updated_at'      => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CustomerCreditInvoiceItem::class, 'invoice_id');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isEditable(): bool
    {
        return $this->status === 'draft';
    }

    public function isSendable(): bool
    {
        return in_array($this->status, ['draft', 'overdue']);
    }

    public function isOverdue(): bool
    {
        return $this->status === 'sent'
            && $this->due_date
            && $this->due_date->isPast();
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeOverdue($query)
    {
        return $query->where('status', 'sent')
                     ->whereDate('due_date', '<', now());
    }

    public function scopeVisible($query)
    {
        return $query->whereNotIn('status', ['draft', 'void']);
    }
}