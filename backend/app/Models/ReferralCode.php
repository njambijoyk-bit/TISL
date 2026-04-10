<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ReferralCode extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'name',
        'code',
        'description',
        'type',
        'customer_id',
        'max_uses',
        'times_used',
        'max_uses_per_customer',
        'valid_from',
        'valid_until',
        'min_order_value',
        'min_items',
        'reward_type',
        'reward_value',
        'referrer_reward_type',
        'referrer_reward_value',
        'total_referrer_rewards',
        'applicable_categories',
        'applicable_products',
        'excluded_products',
        'applicable_customer_types',
        'applicable_tiers',
        'stackable',
        'cannot_combine_with',
        'total_discount_given',
        'total_orders',
        'total_revenue',
        'average_order_value',
        'views',
        'attempts',
        'successful_uses',
        'conversion_rate',
        'status',
        'is_public',
        'auto_apply',
        'promo_image',
        'promo_color',
        'display_tags',
        'notify_on_use',
        'notify_on_expiry',
        'created_by',
        'updated_by',
        'admin_notes',
        'metadata',
        'event_type',
        'target_customer_id',
        'milestone_trigger',
        'inactive_days',
        'auto_generated',
        'generation_batch',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'max_uses' => 'integer',
        'times_used' => 'integer',
        'max_uses_per_customer' => 'integer',
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
        'min_order_value' => 'decimal:2',
        'min_items' => 'integer',
        'reward_value' => 'decimal:2',
        'referrer_reward_value' => 'decimal:2',
        'total_referrer_rewards' => 'decimal:2',
        'applicable_categories' => 'array',
        'applicable_products' => 'array',
        'excluded_products' => 'array',
        'applicable_customer_types' => 'array',
        'applicable_tiers' => 'array',
        'stackable' => 'boolean',
        'cannot_combine_with' => 'array',
        'total_discount_given' => 'decimal:2',
        'total_orders' => 'integer',
        'total_revenue' => 'decimal:2',
        'average_order_value' => 'decimal:2',
        'views' => 'integer',
        'attempts' => 'integer',
        'successful_uses' => 'integer',
        'conversion_rate' => 'decimal:2',
        'is_public' => 'boolean',
        'auto_apply' => 'boolean',
        'display_tags' => 'array',
        'notify_on_use' => 'boolean',
        'notify_on_expiry' => 'boolean',
        'metadata' => 'array',
        'auto_generated'   => 'boolean',
        'milestone_trigger'=> 'integer',
        'inactive_days'    => 'integer',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'is_valid',
        'is_expired',
        'is_depleted',
        'is_active',
        'uses_remaining',
        'days_until_expiry',
        'share_url',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer who owns this code (for customer_referral type).
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the user who created this code.
     */
    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated this code.
     */
    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get all usage records for this code.
     */
    public function usages()
    {
        return $this->hasMany(ReferralCodeUsage::class);
    }

    /**
     * Get completed usages.
     */
    public function completedUsages()
    {
        return $this->usages()->where('status', 'completed');
    }

    /**
     * Get pending usages.
     */
    public function pendingUsages()
    {
        return $this->usages()->where('status', 'pending');
    }

    /**
     * Get customers referred by this code.
     */
    public function referredCustomers()
    {
        return $this->hasMany(Customer::class, 'referred_by_code_id');
    }

    /**
     * Get orders that used this code.
     */
    public function orders()
    {
        return $this->hasMany(Order::class, 'referral_code_id');
    }

    /**
     * Get the target customer for per-customer promo codes.
     */
    public function targetCustomer()
    {
        return $this->belongsTo(Customer::class, 'target_customer_id');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Check if code is valid (not expired, not depleted, active).
     */
    public function getIsValidAttribute(): bool
    {
        return $this->status === 'active' &&
               !$this->is_expired &&
               !$this->is_depleted;
    }

    /**
     * Check if code is expired.
     */
    public function getIsExpiredAttribute(): bool
    {
        if (!$this->valid_until) {
            return false;
        }
        
        if ($this->valid_from && $this->valid_from > now()) {
            return true; // Not yet valid
        }
        
        return $this->valid_until < now();
    }

    /**
     * Check if code is depleted (reached max uses).
     */
    public function getIsDepletedAttribute(): bool
    {
        if (!$this->max_uses) {
            return false; // Unlimited uses
        }
        
        return $this->times_used >= $this->max_uses;
    }

    /**
     * Check if code is active and usable.
     */
    public function getIsActiveAttribute(): bool
    {
        return $this->is_valid;
    }

    /**
     * Get remaining uses.
     */
    public function getUsesRemainingAttribute(): ?int
    {
        if (!$this->max_uses) {
            return null; // Unlimited
        }
        
        return max(0, $this->max_uses - $this->times_used);
    }

    /**
     * Get days until expiry.
     */
    public function getDaysUntilExpiryAttribute(): ?int
    {
        if (!$this->valid_until) {
            return null;
        }
        
        return max(0, now()->diffInDays($this->valid_until, false));
    }

    /**
     * Get share URL for customer referral codes.
     */
    public function getShareUrlAttribute(): ?string
    {
        if ($this->type !== 'customer_referral') {
            return null;
        }
        
        $frontendUrl = env('APP_FRONTEND_URL', 'http://localhost:5173');
return $frontendUrl . '/register?ref=' . $this->code;
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get active codes.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get valid codes (active, not expired, not depleted).
     */
    public function scopeValid($query)
    {
        return $query->where('status', 'active')
                     ->where(function ($q) {
                         $q->whereNull('valid_until')
                           ->orWhere('valid_until', '>', now());
                     })
                     ->where(function ($q) {
                         $q->whereNull('max_uses')
                           ->orWhereRaw('times_used < max_uses');
                     });
    }

    /**
     * Scope to get codes by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    /**
     * Scope to get customer referral codes.
     */
    public function scopeCustomerReferral($query)
    {
        return $query->where('type', 'customer_referral');
    }

    /**
     * Scope to get public codes.
     */
    public function scopePublic($query)
    {
        return $query->where('is_public', true);
    }

    /**
     * Scope to get codes for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get codes by reward type.
     */
    public function scopeByRewardType($query, string $rewardType)
    {
        return $query->where('reward_type', $rewardType);
    }

    /**
     * Scope to search codes.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('code', 'like', "%{$search}%")
              ->orWhere('name', 'like', "%{$search}%")
              ->orWhere('description', 'like', "%{$search}%");
        });
    }

    /**
     * Scope to get expiring soon (within days).
     */
    public function scopeExpiringSoon($query, int $days = 7)
    {
        return $query->whereNotNull('valid_until')
                     ->whereBetween('valid_until', [now(), now()->addDays($days)]);
    }

    /**
     * Scope to get top performing codes.
     */
    public function scopeTopPerforming($query, int $limit = 10)
    {
        return $query->orderBy('total_revenue', 'desc')->limit($limit);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Check if code can be used by customer.
     */
    public function canBeUsedBy(Customer $customer, float $orderValue = 0, int $itemCount = 0): bool
    {
        // Check if code is valid
        if (!$this->is_valid) {
            return false;
        }
        
        // Check minimum order value
        if ($this->min_order_value && $orderValue < $this->min_order_value) {
            return false;
        }
        
        // Check minimum items
        if ($this->min_items && $itemCount < $this->min_items) {
            return false;
        }
        
        // Check customer type restrictions
        if ($this->applicable_customer_types && 
            !in_array($customer->customer_type, $this->applicable_customer_types)) {
            return false;
        }
        
        // Check tier restrictions
        if ($this->applicable_tiers && 
            !in_array($customer->tier, $this->applicable_tiers)) {
            return false;
        }
        
        // Check usage limit per customer
        $customerUsageCount = $this->usages()
            ->where('customer_id', $customer->id)
            ->count();
        
        if ($customerUsageCount >= $this->max_uses_per_customer) {
            return false;
        }
        
        return true;
    }

    /**
     * Calculate discount amount for order.
     */
    public function calculateDiscount(float $orderValue): float
    {
        return match($this->reward_type) {
            'percentage' => ($this->reward_value / 100) * $orderValue,
            'fixed_amount' => $this->reward_value,
            'free_shipping' => 0, // Handled separately
            'store_credit' => 0, // Handled separately
            default => 0,
        };
    }

    /**
     * Record code view.
     */
    public function recordView(): void
    {
        $this->increment('views');
    }

    /**
     * Record code attempt.
     */
    public function recordAttempt(): void
    {
        $this->increment('attempts');
        $this->updateConversionRate();
    }

    /**
     * Record successful use.
     */
    public function recordSuccess(float $discountAmount, float $orderValue): void
    {
        $this->increment('times_used');
        $this->increment('successful_uses');
        $this->increment('total_orders');
        $this->increment('total_discount_given', $discountAmount);
        $this->increment('total_revenue', $orderValue);
        
        // Update average order value
        $this->update([
            'average_order_value' => $this->total_revenue / $this->total_orders,
        ]);
        
        $this->updateConversionRate();
        $this->checkIfDepleted();
    }

    /**
     * Update conversion rate.
     */
    protected function updateConversionRate(): void
    {
        if ($this->attempts > 0) {
            $this->update([
                'conversion_rate' => ($this->successful_uses / $this->attempts) * 100,
            ]);
        }
    }

    /**
     * Check if depleted and update status.
     */
    protected function checkIfDepleted(): void
    {
        if ($this->is_depleted && $this->status !== 'depleted') {
            $this->update(['status' => 'depleted']);
        }
    }

    /**
     * Activate the code.
     */
    public function activate(): void
    {
        $this->update(['status' => 'active']);
    }

    /**
     * Pause the code.
     */
    public function pause(): void
    {
        $this->update(['status' => 'paused']);
    }

    /**
     * Archive the code.
     */
    public function archive(): void
    {
        $this->update(['status' => 'archived']);
    }

    /**
     * Generate unique referral code.
     */
    public static function generateUniqueCode(int $length = 8): string
    {
        do {
            $code = strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, $length));
        } while (self::where('code', $code)->exists());
        
        return $code;
    }

    /**
     * Create personal referral code for customer.
     */
    public static function createForCustomer(Customer $customer): self
    {
        $code = self::generateUniqueCode();
        
        return self::create([
            'name' => "{$customer->full_name}'s Referral Code",
            'code' => $code,
            'description' => "Personal referral code for {$customer->full_name}",
            'type' => 'customer_referral',
            'customer_id' => $customer->id,
            'reward_type' => 'percentage',
            'reward_value' => 5, // 5% for referee
            'referrer_reward_type' => 'store_credit',
            'referrer_reward_value' => 500, // KSh 500 for referrer
            'status' => 'active',
            'is_public' => false,
            'max_uses_per_customer' => 1,
        ]);
    }

    /**
     * Get performance metrics.
     */
    public function getPerformanceMetrics(): array
    {
        return [
            'total_views' => $this->views,
            'total_attempts' => $this->attempts,
            'successful_uses' => $this->successful_uses,
            'conversion_rate' => $this->conversion_rate,
            'total_orders' => $this->total_orders,
            'total_revenue' => $this->total_revenue,
            'total_discount' => $this->total_discount_given,
            'average_order_value' => $this->average_order_value,
            'pending_referrals' => $this->pendingUsages()->count(),
            'completed_referrals' => $this->completedUsages()->count(),
        ];
    }
}