<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReferralCodeUsage extends Model
{
    use HasFactory;

    protected $table = 'referral_code_usage';

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'referral_code_id',
        'customer_id',
        'order_id',
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

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'discount_amount' => 'decimal:2',
        'order_value' => 'decimal:2',
        'final_price' => 'decimal:2',
        'referrer_reward_amount' => 'decimal:2',
        'referrer_reward_paid' => 'boolean',
        'referrer_reward_paid_at' => 'datetime',
        'registered_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
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
     * Get the referrer (customer who owns the code).
     */
    public function referrer()
    {
        return $this->belongsTo(Customer::class, 'referrer_id');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Check if usage is completed (order placed).
     */
    public function getIsCompletedAttribute(): bool
    {
        return $this->status === 'completed';
    }

    /**
     * Check if usage is pending (registered but no order).
     */
    public function getIsPendingAttribute(): bool
    {
        return $this->status === 'pending';
    }

    /**
     * Get days since registration (for pending).
     */
    public function getDaysPendingAttribute(): ?int
    {
        if (!$this->is_pending || !$this->registered_at) {
            return null;
        }
        
        return $this->registered_at->diffInDays(now());
    }

    /**
     * Get total savings from referral.
     */
    public function getSavingsAttribute(): float
    {
        return $this->discount_amount ?? 0;
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get usage for a specific code.
     */
    public function scopeForCode($query, int $codeId)
    {
        return $query->where('referral_code_id', $codeId);
    }

    /**
     * Scope to get usage for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get usage for a specific referrer.
     */
    public function scopeForReferrer($query, int $referrerId)
    {
        return $query->where('referrer_id', $referrerId);
    }

    /**
     * Scope to get usage by status.
     */
    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to get completed usages.
     */
    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    /**
     * Scope to get pending usages.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope to get expired usages.
     */
    public function scopeExpired($query)
    {
        return $query->where('status', 'expired');
    }

    /**
     * Scope to get usages with unpaid rewards.
     */
    public function scopeUnpaidRewards($query)
    {
        return $query->where('referrer_reward_paid', false)
                     ->whereNotNull('referrer_reward_amount')
                     ->where('status', 'completed');
    }

    /**
     * Scope to get usages with paid rewards.
     */
    public function scopePaidRewards($query)
    {
        return $query->where('referrer_reward_paid', true);
    }

    /**
     * Scope to get recent usages.
     */
    public function scopeRecent($query, int $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days));
    }

    /**
     * Scope to get usages within date range.
     */
    public function scopeDateRange($query, $startDate, $endDate)
    {
        return $query->whereBetween('created_at', [$startDate, $endDate]);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Complete the referral (order placed).
     */
    public function complete(Order $order): void
    {
        $this->update([
            'status' => 'completed',
            'order_id' => $order->id,
            'order_value' => $order->subtotal_kes,
            'final_price' => $order->total_kes,
            'discount_amount' => $order->referral_discount,
            'completed_at' => now(),
        ]);
        
        // Update customer's referral completion date
        $this->customer->update([
            'referral_completed_at' => now(),
        ]);
        
        // Process referrer rewards
        $this->processReferrerReward();
    }

    /**
     * Mark as expired (took too long to complete).
     */
    public function markAsExpired(): void
    {
        $this->update(['status' => 'expired']);
    }

    /**
     * Mark as cancelled (order cancelled).
     */
    public function markAsCancelled(): void
    {
        $this->update(['status' => 'cancelled']);
        
        // Reverse referrer reward if already paid
        if ($this->referrer_reward_paid) {
            $this->reverseReferrerReward();
        }
    }

    /**
     * Process referrer reward.
     */
    protected function processReferrerReward(): void
    {
        if (!$this->referrer_id || !$this->referrer_reward_amount) {
            return;
        }
        
        $referrer = $this->referrer;
        
        // Give reward based on type
        switch ($this->referrer_reward_type) {
            case 'store_credit':
                $referrer->addStoreCredit(
                    $this->referrer_reward_amount,
                    "Referral reward for referring {$this->customer->full_name}"
                );
                break;
                
            case 'percentage':
                // Permanent discount increase
                $referrer->increment('discount_percentage', $this->referrer_reward_amount);
                break;
                
            case 'points':
                // Loyalty points
                $referrer->increment('loyalty_points', $this->referrer_reward_amount);
                break;
        }
        
        // Mark as paid
        $this->update([
            'referrer_reward_paid' => true,
            'referrer_reward_paid_at' => now(),
        ]);
        
        // Update referral code statistics
        $this->referralCode->increment('total_referrer_rewards', $this->referrer_reward_amount);
        
        // Send notification to referrer
        Notification::referralNotification(
            $referrer,
            $this->referrer_reward_amount,
            $this->referrer_reward_type
        );
    }

    /**
     * Reverse referrer reward (if order cancelled).
     */
    protected function reverseReferrerReward(): void
    {
        if (!$this->referrer_id || !$this->referrer_reward_paid) {
            return;
        }
        
        $referrer = $this->referrer;
        
        // Reverse reward based on type
        switch ($this->referrer_reward_type) {
            case 'store_credit':
                $referrer->decrement('store_credit', $this->referrer_reward_amount);
                break;
                
            case 'percentage':
                $referrer->decrement('discount_percentage', $this->referrer_reward_amount);
                break;
                
            case 'points':
                $referrer->decrement('loyalty_points', $this->referrer_reward_amount);
                break;
        }
        
        // Mark as unpaid
        $this->update([
            'referrer_reward_paid' => false,
            'referrer_reward_paid_at' => null,
        ]);
        
        // Update referral code statistics
        $this->referralCode->decrement('total_referrer_rewards', $this->referrer_reward_amount);
    }

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
     * Get conversion time (time from registration to order).
     */
    public function getConversionTime(): ?string
    {
        if (!$this->is_completed || !$this->registered_at || !$this->completed_at) {
            return null;
        }
        
        return $this->registered_at->diffForHumans($this->completed_at, true);
    }

    /**
     * Get UTM parameters as array.
     */
    public function getUtmParameters(): array
    {
        return array_filter([
            'source' => $this->utm_source,
            'medium' => $this->utm_medium,
            'campaign' => $this->utm_campaign,
        ]);
    }

    /**
     * Create usage record for new registration.
     */
    public static function createForRegistration(
        ReferralCode $code,
        Customer $customer,
        ?Customer $referrer = null
    ): self {
        return self::create([
            'referral_code_id' => $code->id,
            'customer_id' => $customer->id,
            'referrer_id' => $referrer?->id,
            'status' => 'pending',
            'discount_type' => $code->reward_type,
            'discount_amount' => 0, // Will be calculated on order
            'referrer_reward_type' => $code->referrer_reward_type,
            'referrer_reward_amount' => $code->referrer_reward_value,
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'source' => request()?->input('source'),
            'utm_source' => request()?->input('utm_source'),
            'utm_medium' => request()?->input('utm_medium'),
            'utm_campaign' => request()?->input('utm_campaign'),
            'registered_at' => now(),
        ]);
    }

    /**
     * Calculate total earned by referrer.
     */
    public static function totalEarnedBy(Customer $referrer): float
    {
        return self::forReferrer($referrer->id)
                   ->completed()
                   ->sum('referrer_reward_amount');
    }

    /**
     * Get pending earnings for referrer.
     */
    public static function pendingEarningsFor(Customer $referrer): float
    {
        return self::forReferrer($referrer->id)
                   ->pending()
                   ->sum('referrer_reward_amount');
    }

    /**
     * Get referral statistics for customer.
     */
    public static function getStatsFor(Customer $customer): array
    {
        $referrals = self::forReferrer($customer->id)->get();
        
        return [
            'total_referrals' => $referrals->count(),
            'pending_referrals' => $referrals->where('status', 'pending')->count(),
            'completed_referrals' => $referrals->where('status', 'completed')->count(),
            'total_earned' => $referrals->where('referrer_reward_paid', true)->sum('referrer_reward_amount'),
            'pending_earnings' => $referrals->where('status', 'pending')->sum('referrer_reward_amount'),
            'total_orders_value' => $referrals->where('status', 'completed')->sum('order_value'),
            'average_order_value' => $referrals->where('status', 'completed')->avg('order_value') ?? 0,
        ];
    }
}