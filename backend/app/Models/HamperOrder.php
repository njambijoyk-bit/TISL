<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HamperOrder extends Model
{
    protected $fillable = [
        'order_number',
        'customer_id',
        'hamper_id',
        'hamper_snapshot',
        'status',
        'subtotal',
        'vat_amount',
        'discount_amount',
        'store_credit_used',
        'shipping_cost',
        'total',
        'promo_code',
        'referral_code_id',
        'loyalty_points_earned',
        'shipping_address',
        'notes',
    ];

    protected $casts = [
        'hamper_snapshot'       => 'array',
        'shipping_address'      => 'array',
        'subtotal'              => 'decimal:2',
        'vat_amount'            => 'decimal:2',
        'discount_amount'       => 'decimal:2',
        'store_credit_used'     => 'decimal:2',
        'shipping_cost'         => 'decimal:2',
        'total'                 => 'decimal:2',
        'loyalty_points_earned' => 'integer',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function hamper(): BelongsTo
    {
        return $this->belongsTo(Hamper::class);
    }

    public function referralCode(): BelongsTo
    {
        return $this->belongsTo(ReferralCode::class, 'referral_code_id');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public static function generateOrderNumber(): string
    {
        $year   = now()->format('Y');
        $date   = now()->format('dmy');
        $random = strtoupper(substr(uniqid(), -6));
        return "HMP-{$year}-{$date}-{$random}";
    }
}