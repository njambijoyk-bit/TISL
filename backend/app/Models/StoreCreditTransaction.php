<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StoreCreditTransaction extends Model
{
    protected $fillable = [
        'customer_id',
        'amount',
        'balance_after',
        'type',
        'reference_type',
        'reference_id',
        'note',
        'created_by',
        'expires_at',
        'expired_at',
        'metadata',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'balance_after' => 'decimal:2',
        'expires_at'   => 'datetime',
        'expired_at'   => 'datetime',
        'metadata'     => 'array',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reference()
    {
        return $this->morphTo();
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeForCustomer($q, int $customerId)
    {
        return $q->where('customer_id', $customerId);
    }

    public function scopeByType($q, string $type)
    {
        return $q->where('type', $type);
    }

    public function scopeCredits($q)
    {
        return $q->where('amount', '>', 0);
    }

    public function scopeDebits($q)
    {
        return $q->where('amount', '<', 0);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getTypeColorAttribute(): string
    {
        return match($this->type) {
            'admin_grant'        => 'blue',
            'referral_reward'    => 'purple',
            'points_redemption'  => 'green',
            'order_refund'       => 'teal',
            'order_spend'        => 'orange',
            'admin_deduct'       => 'red',
            'adjustment'         => 'yellow',
            'expiry'             => 'gray',
            default              => 'gray',
        };
    }

    public function getTypeLabelAttribute(): string
    {
        return match($this->type) {
            'admin_grant'       => 'Admin Grant',
            'admin_deduct'      => 'Admin Deduct',
            'referral_reward'   => 'Referral Reward',
            'points_redemption' => 'Points Redeemed',
            'order_refund'      => 'Order Refund',
            'order_spend'       => 'Used at Checkout',
            'adjustment'        => 'Adjustment',
            'expiry'            => 'Expired',
            default             => ucfirst($this->type),
        };
    }
}