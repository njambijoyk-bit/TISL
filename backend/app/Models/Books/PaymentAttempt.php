<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One try at collecting money through a gateway (M-Pesa STK…). The books only see it once it is confirmed. */
class PaymentAttempt extends Model
{
    protected $table = 'payment_attempts';

    protected $fillable = [
        'voucher_id', 'customer_id', 'payment_method_id', 'gateway', 'status', 'amount', 'currency_id', 'gateway_amount', 'gateway_currency',
        'phone', 'merchant_request_id', 'checkout_request_id', 'receipt_number', 'callback_raw', 'failure_reason', 'tenders',
        'settled_voucher_id', 'confirmed_at', 'failed_at', 'created_by', 'notes',
    ];

    protected $casts = ['amount' => 'decimal:2', 'gateway_amount' => 'decimal:2', 'callback_raw' => 'array', 'tenders' => 'array', 'confirmed_at' => 'datetime', 'failed_at' => 'datetime'];

    public const PENDING = 'pending';
    public const CONFIRMED = 'confirmed';
    public const FAILED = 'failed';
    public const CANCELLED = 'cancelled';

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class);
    }

    public function method(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }
}
