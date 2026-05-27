<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

class ReferralCodeUsage extends Model
{
    use HasFactory;

    protected $table = 'referral_code_usage';

    // ========================================
    // FILLABLE
    // ========================================

    protected $fillable = [
        'referral_code_id',
        'customer_id',
        'order_id',
        'hamper_order_id',
        'referrer_id',
        'status',
        'discount_amount',
        'discount_type',
        'order_value',
        'final_price',
        'referrer_reward_amount',
        'referrer_reward_type',
        'referrer_reward_paid',
        'referrer_reward_paid_at',
        'ip_address',
        'user_agent',
        'source',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'registered_at',
        'completed_at',
    ];

    // ========================================
    // CASTS
    // ========================================

    protected $casts = [
        'discount_amount'         => 'decimal:2',
        'order_value'             => 'decimal:2',
        'final_price'             => 'decimal:2',
        'referrer_reward_amount'  => 'decimal:2',
        'referrer_reward_paid'    => 'boolean',
        'referrer_reward_paid_at' => 'datetime',
        'registered_at'           => 'datetime',
        'completed_at'            => 'datetime',
    ];

    // ========================================
    // APPENDS
    // ========================================

    protected $appends = [
        'is_completed',
        'is_pending',
        'days_pending',
        'savings',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the referral code used.
     */
    public function referralCode()
    {
        return $this->belongsTo(ReferralCode::class);
    }

    /**
     * Get the customer (referee) who used the code.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the order created with this code.
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Get the hamper order created with this code.
     */
    public function hamperOrder()
    {
        return $this->belongsTo(HamperOrder::class);
    }

    /**
     * Get the referrer (customer who owns the code).
     */
    public function referrer()
    {
        return $this->belongsTo(Customer::class, 'referrer_id');
    }

    // ========================================
    // ACCESSORS
    // ========================================

    /**
     * Check if usage is completed (order placed).
     */
    public function getIsCompletedAttribute(): bool
    {
        return $this->status === 'completed';
    }

    /**
     * Check if usage is pending (registered but no order yet).
     */
    public function getIsPendingAttribute(): bool
    {
        return $this->status === 'pending';
    }

    /**
     * Days since registration — only meaningful for pending usages.
     */
    public function getDaysPendingAttribute(): ?int
    {
        if (!$this->is_pending || !$this->registered_at) {
            return null;
        }

        return $this->registered_at->diffInDays(now());
    }

    /**
     * Total savings from this referral.
     */
    public function getSavingsAttribute(): float
    {
        return (float) ($this->discount_amount ?? 0);
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeForCode($query, int $codeId)
    {
        return $query->where('referral_code_id', $codeId);
    }

    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    public function scopeForReferrer($query, int $referrerId)
    {
        return $query->where('referrer_id', $referrerId);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeExpired($query)
    {
        return $query->where('status', 'expired');
    }

    public function scopeUnpaidRewards($query)
    {
        return $query->where('referrer_reward_paid', false)
                     ->whereNotNull('referrer_reward_amount')
                     ->where('status', 'completed');
    }

    public function scopePaidRewards($query)
    {
        return $query->where('referrer_reward_paid', true);
    }

    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }

    public function scopeDateRange($query, $startDate, $endDate)
    {
        return $query->whereBetween('created_at', [$startDate, $endDate]);
    }

    // ========================================
    // LIFECYCLE HELPERS
    // ========================================

    /**
     * Complete the referral (order placed).
     * Guard against double-completion — logs a warning and returns early if already done.
     */
    public function complete(Order $order): void
    {
        if ($this->status === 'completed') {
            Log::warning("ReferralCodeUsage #{$this->id} complete() called but already completed.");
            return;
        }

        $this->update([
            'status'          => 'completed',
            'order_id'        => $order->id,
            'order_value'     => $order->subtotal_kes,
            'final_price'     => $order->total_kes,
            'discount_amount' => $order->referral_discount,
            'completed_at'    => now(),
        ]);

        $this->customer->update(['referral_completed_at' => now()]);

        // Only process reward if not already paid — prevents double reward
        if (!$this->referrer_reward_paid) {
            $this->processReferrerReward();
        }
    }

    /**
     * Mark as expired (took too long to complete).
     */
    public function markAsExpired(): void
    {
        $this->update(['status' => 'expired']);
    }

    /**
     * Mark as cancelled (order was cancelled).
     * Reverses the referrer reward if it was already paid.
     */
    public function markAsCancelled(): void
    {
        $this->update(['status' => 'cancelled']);

        if ($this->referrer_reward_paid) {
            $this->reverseReferrerReward();
        }
    }

    // ========================================
    // REWARD PROCESSING
    // ========================================

    /**
     * Give the referrer their reward.
     * Called when the referee's order is completed.
     */
    protected function processReferrerReward(): void
    {
        if (!$this->referrer_id || !$this->referrer_reward_amount) {
            return;
        }

        $referrer = $this->referrer;

        // For customer referral codes paying store_credit, always use the
        // current setting value so admin price changes apply immediately.
        $rewardAmount = ($this->referrer_reward_type === 'store_credit' &&
                        $this->referralCode?->type === 'customer_referral')
            ? (float) \App\Models\LoyaltySetting::get('referral_credit_amount', $this->referrer_reward_amount)
            : (float) $this->referrer_reward_amount;

        switch ($this->referrer_reward_type) {
            case 'store_credit':
                app(\App\Services\LoyaltyService::class)->grantReferralCreditExact(
                    $referrer,
                    $rewardAmount,  // <-- live from settings
                    $this->order
                );
                break;

            case 'percentage':
                $referrer->increment('discount_percentage', $this->referrer_reward_amount);
                break;

            case 'points':
                $referrer->increment('loyalty_points', $this->referrer_reward_amount);
                break;
        }

        $this->update([
            'referrer_reward_paid'    => true,
            'referrer_reward_paid_at' => now(),
            'referrer_reward_amount'  => $rewardAmount, // keep the record accurate
        ]);

        $this->referralCode->increment('total_referrer_rewards', $rewardAmount);

        Notification::referralNotification(
            $referrer,
            $rewardAmount,
            $this->referrer_reward_type
        );
    }

    /**
     * Reverse the referrer's reward when the linked order is cancelled.
     * All values are floored at zero — the referrer may have already spent the reward.
     */
    protected function reverseReferrerReward(): void
    {
        if (!$this->referrer_id || !$this->referrer_reward_paid) {
            return;
        }

        $referrer = $this->referrer;

        // SUBTRACT the reward, floored at zero for each type
        switch ($this->referrer_reward_type) {
            case 'store_credit':
                // Was: $referrer->update(['store_credit' => max(0, ...)]) — no tx record
                app(\App\Services\LoyaltyService::class)->reverseReferralCreditExact(
                    $referrer,
                    (float) $this->referrer_reward_amount,
                    $this->order
                );
                break;

            case 'percentage':
                $referrer->update([
                    'discount_percentage' => max(
                        0,
                        (float) $referrer->discount_percentage - (float) $this->referrer_reward_amount
                    ),
                ]);
                break;

            case 'points':
                $referrer->update([
                    'loyalty_points' => max(
                        0,
                        (int) $referrer->loyalty_points - (int) $this->referrer_reward_amount
                    ),
                ]);
                break;
        }

        $this->update([
            'referrer_reward_paid'    => false,
            'referrer_reward_paid_at' => null,
        ]);

        // Update referral code aggregate, floored at zero
        $this->referralCode->update([
            'total_referrer_rewards' => max(
                0,
                (float) $this->referralCode->total_referrer_rewards - (float) $this->referrer_reward_amount
            ),
        ]);
    }

    /**
     * Re-process the referrer reward after a cancelled order is restored.
     * Only called when the reward was previously reversed during cancellation.
     */
    public function restoreFromCancellation(): void
    {
        if (!$this->referrer_id || !$this->referrer_reward_amount || $this->referrer_reward_paid) {
            return;
        }

        // processReferrerReward handles marking paid + updating code stats
        $this->processReferrerReward();
    }

    // ========================================
    // UTILITY
    // ========================================

    /**
     * Check if usage is about to expire (pending for too long).
     */
    public function isAboutToExpire(int $days = 30): bool
    {
        if (!$this->is_pending) {
            return false;
        }

        return $this->days_pending >= $days;
    }

    /**
     * Human-readable conversion time (registration → order placed).
     */
    public function getConversionTime(): ?string
    {
        if (!$this->is_completed || !$this->registered_at || !$this->completed_at) {
            return null;
        }

        return $this->registered_at->diffForHumans($this->completed_at, true);
    }

    /**
     * UTM parameters as a filtered array.
     */
    public function getUtmParameters(): array
    {
        return array_filter([
            'source'   => $this->utm_source,
            'medium'   => $this->utm_medium,
            'campaign' => $this->utm_campaign,
        ]);
    }

    // ========================================
    // STATIC FACTORIES
    // ========================================

    /**
     * Create a usage record when a new customer registers via referral link.
     */
    public static function createForRegistration(
        ReferralCode $code,
        Customer $customer,
        ?Customer $referrer = null
    ): self {
        // For customer referral codes, always use the current setting value
        // so reward stays in sync when admin updates the setting.
        $referrerRewardAmount = ($code->type === 'customer_referral' && $code->referrer_reward_type === 'store_credit')
            ? (float) \App\Models\LoyaltySetting::get('referral_credit_amount', $code->referrer_reward_value)
            : $code->referrer_reward_value;
        return self::create([
            'referral_code_id'       => $code->id,
            'customer_id'            => $customer->id,
            'referrer_id'            => $referrer?->id,
            'status'                 => 'pending',
            'discount_type'          => $code->reward_type,
            'discount_amount'        => 0, // calculated on order placement
            'referrer_reward_type'   => $code->referrer_reward_type,
            'referrer_reward_amount' => $referrerRewardAmount,
            'ip_address'             => request()?->ip(),
            'user_agent'             => request()?->userAgent(),
            'source'                 => request()?->input('source'),
            'utm_source'             => request()?->input('utm_source'),
            'utm_medium'             => request()?->input('utm_medium'),
            'utm_campaign'           => request()?->input('utm_campaign'),
            'registered_at'          => now(),
        ]);
    }

    /**
     * Create a usage record for a hamper order (already completed at creation).
     */
    public static function createForHamperOrder(
        ReferralCode $code,
        Customer $customer,
        HamperOrder $hamperOrder,
        float $discount,
        float $orderValue,
        float $finalPrice
    ): self {
        $referrerRewardAmount = ($code->type === 'customer_referral' && $code->referrer_reward_type === 'store_credit')
        ? (float) \App\Models\LoyaltySetting::get('referral_credit_amount', $code->referrer_reward_value)
        : $code->referrer_reward_value;
        return self::create([
            'referral_code_id'       => $code->id,
            'customer_id'            => $customer->id,
            'hamper_order_id'        => $hamperOrder->id,
            'referrer_id'            => $code->customer_id,
            'status'                 => 'completed',
            'discount_amount'        => $discount,
            'discount_type'          => $code->reward_type,
            'order_value'            => $orderValue,
            'final_price'            => $finalPrice,
            'referrer_reward_type'   => $code->referrer_reward_type,
            'referrer_reward_amount' => $referrerRewardAmount,
            'ip_address'             => request()?->ip(),
            'user_agent'             => request()?->userAgent(),
            'completed_at'           => now(),
        ]);
    }

    // ========================================
    // STATIC AGGREGATES
    // ========================================

    /**
     * Total rewards earned by a referrer (paid only).
     */
    public static function totalEarnedBy(Customer $referrer): float
    {
        return self::forReferrer($referrer->id)
                   ->completed()
                   ->sum('referrer_reward_amount');
    }

    /**
     * Pending reward earnings for a referrer.
     */
    public static function pendingEarningsFor(Customer $referrer): float
    {
        return self::forReferrer($referrer->id)
                   ->pending()
                   ->sum('referrer_reward_amount');
    }

    /**
     * Referral statistics for a customer — all aggregation done in SQL.
     */
    public static function getStatsFor(Customer $customer): array
    {
        $base = self::forReferrer($customer->id);

        $counts = (clone $base)
            ->selectRaw("
                COUNT(*) as total_referrals,
                SUM(status = 'pending')   as pending_referrals,
                SUM(status = 'completed') as completed_referrals
            ")
            ->first();

        $earnings = (clone $base)
            ->selectRaw("
                SUM(CASE WHEN referrer_reward_paid = 1 THEN referrer_reward_amount ELSE 0 END) as total_earned,
                SUM(CASE WHEN status = 'pending'      THEN referrer_reward_amount ELSE 0 END) as pending_earnings,
                SUM(CASE WHEN status = 'completed'    THEN order_value            ELSE 0 END) as total_orders_value,
                AVG(CASE WHEN status = 'completed'    THEN order_value            END)        as average_order_value
            ")
            ->first();

        return [
            'total_referrals'     => (int)   ($counts->total_referrals      ?? 0),
            'pending_referrals'   => (int)   ($counts->pending_referrals    ?? 0),
            'completed_referrals' => (int)   ($counts->completed_referrals  ?? 0),
            'total_earned'        => (float) ($earnings->total_earned        ?? 0),
            'pending_earnings'    => (float) ($earnings->pending_earnings    ?? 0),
            'total_orders_value'  => (float) ($earnings->total_orders_value  ?? 0),
            'average_order_value' => (float) ($earnings->average_order_value ?? 0),
        ];
    }
}