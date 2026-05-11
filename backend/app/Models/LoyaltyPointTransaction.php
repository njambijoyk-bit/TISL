<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyPointTransaction extends Model
{
    protected $fillable = [
        'customer_id',
        'points',
        'balance_after',
        'type',
        'point_type',
        'expires_at',
        'expired_at',
        'reference_type',
        'reference_id',
        'note',
        'created_by',
        'metadata',
    ];

    protected $casts = [
        'points'      => 'integer',
        'balance_after' => 'integer',
        'expires_at'  => 'datetime',
        'expired_at'  => 'datetime',
        'metadata'    => 'array',
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

    public function scopePermanent($q)
    {
        return $q->where('point_type', 'permanent');
    }

    public function scopeExpiring($q)
    {
        return $q->where('point_type', 'expiring');
    }

    public function scopeActive($q)
    {
        return $q->where('points', '>', 0)->whereNull('expired_at');
    }

    public function scopeExpired($q)
    {
        return $q->whereNotNull('expired_at');
    }

    public function scopeDue($q)
    {
        return $q->where('point_type', 'expiring')
                 ->whereNull('expired_at')
                 ->where('points', '>', 0)
                 ->where('expires_at', '<=', now());
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getIsExpiredAttribute(): bool
    {
        return $this->expired_at !== null;
    }

    public function getTypeColorAttribute(): string
    {
        return match($this->type) {
            'order_earn'     => 'green',
            'admin_grant'    => 'blue',
            'referral_bonus' => 'purple',
            'birthday_bonus' => 'pink',
            'review_bonus'   => 'teal',
            'redemption'     => 'orange',
            'expiry'         => 'gray',
            'admin_deduct'   => 'red',
            'adjustment'     => 'yellow',
            default          => 'gray',
        };
    }

    public function getTypeLabelAttribute(): string
    {
        return match($this->type) {
            'order_earn'     => 'Order Earned',
            'admin_grant'    => 'Admin Grant',
            'admin_deduct'   => 'Admin Deduct',
            'referral_bonus' => 'Referral Bonus',
            'birthday_bonus' => 'Birthday Bonus',
            'review_bonus'   => 'Review Bonus',
            'redemption'     => 'Redeemed',
            'expiry'         => 'Expired',
            'adjustment'     => 'Adjustment',
            default          => ucfirst($this->type),
        };
    }
}