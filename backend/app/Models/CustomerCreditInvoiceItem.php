<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditInvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id',
        'transaction_id',
        'description',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(CustomerCreditInvoice::class, 'invoice_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(CustomerCreditTransaction::class, 'transaction_id');
    }
}