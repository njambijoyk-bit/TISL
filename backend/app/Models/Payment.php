<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $fillable = [
        // Core references — order_id OR auction_order_id (mutually exclusive)
        'order_id',
        'auction_order_id',
        'customer_id',
        'initiated_by',
        'previous_payment_id',

        // Identity
        'payment_number',
        'method',
        'status',

        // Currency
        'currency',
        'exchange_rate_to_kes',

        // Amounts
        'amount_expected',
        'amount_received',
        'is_partial',

        // Snapshot — set once at initiation, never updated
        'snapshot_subtotal_kes',
        'snapshot_tax_kes',
        'snapshot_discount_kes',
        'snapshot_shipping_kes',
        'snapshot_total_kes',
        'snapshot_amount_previously_paid_kes',
        'snapshot_amount_still_owed_kes',

        // M-Pesa request fields
        'phone_number',
        'phone_overridden',
        'phone_override_reason',
        'merchant_request_id',
        'checkout_request_id',

        // M-Pesa callback confirmed fields — written by callback handler only
        'mpesa_receipt_number',
        'mpesa_transaction_date',
        'mpesa_phone_confirmed',
        'mpesa_amount_confirmed',

        // Raw callback storage
        'callback_raw',
        'callback_received_at',
        'callback_result_code',
        'callback_result_desc',

        // Retry tracking
        'retry_count',
        'is_retry',

        // Dispute
        'dispute_status',
        'dispute_reason',
        'dispute_raised_at',
        'dispute_raised_by',
        'dispute_resolved_at',
        'dispute_resolved_by',
        'dispute_resolution_notes',
        'dispute_evidence',

        // Notes & audit
        'notes',
        'admin_notes',
        'failure_reason',

        // Timestamps
        'initiated_at',
        'confirmed_at',
        'failed_at',
        'cancelled_at',
    ];

    protected $casts = [
        'amount_expected'                    => 'decimal:2',
        'amount_received'                    => 'decimal:2',
        'exchange_rate_to_kes'               => 'decimal:6',
        'snapshot_subtotal_kes'              => 'decimal:2',
        'snapshot_tax_kes'                   => 'decimal:2',
        'snapshot_discount_kes'              => 'decimal:2',
        'snapshot_shipping_kes'              => 'decimal:2',
        'snapshot_total_kes'                 => 'decimal:2',
        'snapshot_amount_previously_paid_kes'=> 'decimal:2',
        'snapshot_amount_still_owed_kes'     => 'decimal:2',
        'mpesa_amount_confirmed'             => 'decimal:2',
        'is_partial'                         => 'boolean',
        'is_retry'                           => 'boolean',
        'phone_overridden'                   => 'boolean',
        'callback_raw'                       => 'array',
        'dispute_evidence'                   => 'array',
        'mpesa_transaction_date'             => 'datetime',
        'callback_received_at'               => 'datetime',
        'dispute_raised_at'                  => 'datetime',
        'dispute_resolved_at'                => 'datetime',
        'initiated_at'                       => 'datetime',
        'confirmed_at'                       => 'datetime',
        'failed_at'                          => 'datetime',
        'cancelled_at'                       => 'datetime',
    ];

    public const IMMUTABLE_AFTER_CONFIRM = [
        'callback_raw',
        'mpesa_receipt_number',
        'mpesa_amount_confirmed',
        'mpesa_transaction_date',
        'mpesa_phone_confirmed',
        'confirmed_at',
        'snapshot_subtotal_kes',
        'snapshot_tax_kes',
        'snapshot_discount_kes',
        'snapshot_shipping_kes',
        'snapshot_total_kes',
        'snapshot_amount_previously_paid_kes',
        'snapshot_amount_still_owed_kes',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function auctionOrder(): BelongsTo
    {
        return $this->belongsTo(AuctionOrder::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function initiatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function previousPayment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'previous_payment_id');
    }

    public function disputeRaisedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispute_raised_by');
    }

    public function disputeResolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispute_resolved_by');
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeConfirmed($query)
    {
        return $query->where('status', 'confirmed');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    public function scopeForOrder($query, int $orderId)
    {
        return $query->where('order_id', $orderId);
    }

    public function scopeForAuctionOrder($query, int $auctionOrderId)
    {
        return $query->where('auction_order_id', $auctionOrderId);
    }

    public function scopeHasOpenDispute($query)
    {
        return $query->whereIn('dispute_status', ['raised', 'investigating']);
    }

    // =========================================================================
    // HELPERS — status checks
    // =========================================================================

    public function isConfirmed(): bool
    {
        return $this->status === 'confirmed';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isFailed(): bool
    {
        return $this->status === 'failed';
    }

    public function isCancelled(): bool
    {
        return $this->status === 'cancelled';
    }

    public function isImmutable(): bool
    {
        return in_array($this->status, ['confirmed', 'refunded']);
    }

    public function hasOpenDispute(): bool
    {
        return in_array($this->dispute_status, ['raised', 'investigating']);
    }

    // =========================================================================
    // HELPERS — polymorphic order resolution
    // =========================================================================

    /**
     * Get the parent order (regular or auction) for this payment.
     */
    public function parentOrder(): Order|AuctionOrder|null
    {
        return $this->order ?? $this->auctionOrder;
    }

    /**
     * Get the order type for display purposes.
     */
    public function orderType(): string
    {
        return $this->auction_order_id ? 'auction' : 'regular';
    }

    /**
     * Get the order number for display.
     */
    public function orderNumber(): ?string
    {
        return $this->order?->order_number ?? $this->auctionOrder?->order_number;
    }

    /**
     * The authoritative amount received for this payment.
     */
    public function authoritativeAmountReceived(): float
    {
        return (float) ($this->mpesa_amount_confirmed ?? $this->amount_received ?? 0);
    }

    /**
     * Whether this payment covers the full outstanding balance.
     */
    public function coversFullBalance(): bool
    {
        return $this->authoritativeAmountReceived() >= (float) $this->snapshot_amount_still_owed_kes;
    }

    // =========================================================================
    // PAYMENT NUMBER GENERATOR
    // =========================================================================

    public static function generatePaymentNumber(int $orderId, string $type = 'regular'): string
    {
        $year     = date('Y');
        $prefix   = $type === 'auction' ? 'AUC' : 'PAY';
        $sequence = static::where(function ($q) use ($orderId, $type) {
            if ($type === 'auction') {
                $q->where('auction_order_id', $orderId);
            } else {
                $q->where('order_id', $orderId);
            }
        })->count() + 1;
        $seq = str_pad($sequence, 3, '0', STR_PAD_LEFT);

        return "{$prefix}-{$year}-{$orderId}-{$seq}";
    }

    // =========================================================================
    // SNAPSHOT BUILDER — polymorphic for both order types
    // =========================================================================

    public static function buildSnapshot(Order|AuctionOrder $order): array
    {
        $isAuction = $order instanceof AuctionOrder;
        $orderId   = $order->id;

        $previouslyPaid = static::query()
            ->where($isAuction ? 'auction_order_id' : 'order_id', $orderId)
            ->where('status', 'confirmed')
            ->sum('mpesa_amount_confirmed');

        $totalKes = (float) ($order->total_kes ?? $order->total ?? 0);
        $creditDeduction = (float) ($order->metadata['credit_account_deduction'] ?? 0);
        $effectiveTotalKes = $totalKes + $creditDeduction;
        $stillOwed = max(0, $effectiveTotalKes - (float) $previouslyPaid);
        $rate = $order->exchange_rate_to_kes ?? 1;

        return [
            'snapshot_subtotal_kes'               => (float) ($order->subtotal_kes ?? round(((float)($order->subtotal ?? 0)) * $rate, 2)),
            'snapshot_tax_kes'                    => (float) round(((float)($order->tax ?? 0)) * $rate, 2),
            'snapshot_discount_kes'               => (float) round(((float)($order->discount ?? 0)) * $rate, 2),
            'snapshot_shipping_kes'               => (float) round(((float)($order->shipping_cost ?? 0)) * $rate, 2),
            'snapshot_total_kes'                  => $effectiveTotalKes,
            'snapshot_amount_previously_paid_kes' => (float) $previouslyPaid,
            'snapshot_amount_still_owed_kes'      => $stillOwed,
        ];
    }

    // =========================================================================
    // ORDER PAYMENT STATUS SYNC — polymorphic
    // =========================================================================

    public function syncOrderPaymentStatus(): void
    {
        $order = $this->parentOrder();
        if (!$order) return;

        $isAuction = $this->auction_order_id !== null;

        $totalConfirmed = static::query()
            ->where($isAuction ? 'auction_order_id' : 'order_id', $order->id)
            ->where('status', 'confirmed')
            ->sum(\Illuminate\Support\Facades\DB::raw('CASE WHEN method = "refund" THEN -mpesa_amount_confirmed ELSE mpesa_amount_confirmed END'));

        $totalKes = (float) ($order->total_kes ?? $order->total ?? 0);

        $newPaymentStatus = match(true) {
            $totalConfirmed <= 0             => 'unpaid',
            $totalConfirmed > $totalKes      => 'overpayment',
            $totalConfirmed >= $totalKes     => 'paid',
            default                          => 'partially_paid',
        };

        if ($newPaymentStatus === 'paid' && !$order->paid_at && method_exists($order, 'markAsPaid')) {
            $order->markAsPaid($this->mpesa_receipt_number);
        } else {
            $order->update(['payment_status' => $newPaymentStatus]);
        }
    }
}
