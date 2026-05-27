<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralActivityLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'entity_type',
        'entity_id',
        'action',
        'actor_user_id',
        'actor_type',
        'order_id',
        'amount',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'amount'     => 'decimal:2',
        'created_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────────────────────────────────
    //  RELATIONSHIPS
    // ─────────────────────────────────────────────────────────────────────────

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function referralCode(): BelongsTo
    {
        return $this->belongsTo(ReferralCode::class, 'entity_id');
    }

    public function promoCode(): BelongsTo
    {
        return $this->belongsTo(ReferralCode::class, 'entity_id');
    }

    public function getEntityAttribute(): ?ReferralCode
    {
        if (in_array($this->entity_type, ['promo_code', 'referral_code'])) {
            return ReferralCode::find($this->entity_id);
        }
        return null;
    }

    public function scopeForPromos($query)
    {
        return $query->where('entity_type', 'promo_code');
    }

    public function scopeForReferrals($query)
    {
        return $query->where('entity_type', 'referral_code');
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ACCESSORS
    // ─────────────────────────────────────────────────────────────────────────

    public function getIsSystemAttribute(): bool
    {
        return $this->actor_user_id === null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SCOPES
    // ─────────────────────────────────────────────────────────────────────────

    public function scopeForEntity($query, string $type, int $id)
    {
        return $query->where('entity_type', $type)->where('entity_id', $id);
    }

    public function scopeForOrder($query, int $orderId)
    {
        return $query->where('order_id', $orderId);
    }

    public function scopeByAction($query, string $action)
    {
        return $query->where('action', $action);
    }

    public function scopeByActor($query, string $actorType)
    {
        return $query->where('actor_type', $actorType);
    }

    public function scopeReversals($query)
    {
        return $query->whereIn('action', ['REVERSED', 'CANCELLED', 'REWARD_REVERSED']);
    }

    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }
}