<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;
use App\Models\CustomerTier;
use App\Models\CustomerTypeDiscount;

class Customer extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'user_id',
        'customer_number',
        'first_name',
        'last_name',
        'email',
        'phone',
        'profile_image',
        'birthday',
        'alternate_phone',
        'company_name',
        'company_registration_number',
        'tax_id',
        'customer_type',
        'tier',
        'default_shipping_address',
        'default_billing_address',
        'has_credit_account',
        'credit_limit',
        'credit_used',
        'total_orders',
        'total_spent',
        'average_order_value',
        'first_order_date',
        'last_order_date',
        'discount_percentage',
        'store_credit',
        'loyalty_points',
        'status',
        'status_reason',
        'is_verified',
        'email_verified',
        'phone_verified',
        'verified_at',
        'tags',
        'notes',
        'referred_by_code_id',
        'referred_by_customer_id',
        'referral_registered_at',
        'referral_completed_at',
        'assigned_sales_rep',
        'preferences',
        'website',
        'whatsapp',
        'created_by',
        'last_login_at',
        'last_login_ip',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'birthday' => 'date',
        'has_credit_account' => 'boolean',
        'credit_limit' => 'decimal:2',
        'credit_used' => 'decimal:2',
        'total_orders' => 'integer',
        'total_spent' => 'decimal:2',
        'average_order_value' => 'decimal:2',
        'first_order_date' => 'datetime',
        'last_order_date' => 'datetime',
        'discount_percentage' => 'decimal:2',
        'store_credit' => 'decimal:2',
        'loyalty_points' => 'integer',
        'is_verified' => 'boolean',
        'email_verified' => 'boolean',
        'phone_verified' => 'boolean',
        'verified_at' => 'datetime',
        'tags' => 'array',
        'preferences' => 'array',
        'referral_registered_at' => 'datetime',
        'referral_completed_at' => 'datetime',
        'last_login_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'full_name',
        'profile_image_url',
        'available_credit',
        'tier_benefits',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the user that owns the customer.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get all orders for this customer.
     */
    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    /**
     * Get all quotes for this customer.
     */
    public function quotes()
    {
        return $this->hasMany(Quote::class);
    }

    /**
     * Get all reviews by this customer.
     */
    public function reviews()
    {
        return $this->hasMany(ProductReview::class);
    }

    /**
     * Get the referral code that was used (if referred).
     */
    public function referralCode()
    {
        return $this->belongsTo(ReferralCode::class, 'referred_by_code_id');
    }

    /**
     * Get the customer who referred this customer.
     */
    public function referrer()
    {
        return $this->belongsTo(Customer::class, 'referred_by_customer_id');
    }

    /**
     * Get customers referred by this customer.
     */
    public function referrals()
    {
        return $this->hasMany(Customer::class, 'referred_by_customer_id');
    }

    /**
     * Get pending referrals (registered but no order yet).
     */
    public function pendingReferrals()
    {
        return $this->referrals()->where('total_orders', 0);
    }

    /**
     * Get completed referrals (made first order).
     */
    public function completedReferrals()
    {
        return $this->referrals()->where('total_orders', '>', 0);
    }

    /**
     * Get this customer's personal referral code.
     */
    public function myReferralCode()
    {
        return $this->hasOne(ReferralCode::class, 'customer_id')
            ->where('type', 'customer_referral');
    }

    public function loyaltyPointTransactions()
    {
        return $this->hasMany(\App\Models\LoyaltyPointTransaction::class);
    }
    
    public function storeCreditTransactions()
    {
        return $this->hasMany(\App\Models\StoreCreditTransaction::class);
    }

    /**
     * Get the sales representative assigned to this customer.
     */
    public function salesRep()
    {
        return $this->belongsTo(User::class, 'assigned_sales_rep');
    }

    /**
     * Get all addresses for this customer.
     */
    public function addresses()
    {
        return $this->hasMany(CustomerAddress::class);
    }

    /**
     * Get the default shipping address.
     */
    public function defaultShippingAddress()
    {
        return $this->hasOne(CustomerAddress::class)
            ->where('is_default_shipping', true);
    }

    /**
     * Get the default billing address.
     */
    public function defaultBillingAddress()
    {
        return $this->hasOne(CustomerAddress::class)
            ->where('is_default_billing', true);
    }

    /**
     * Get the admin who created this customer.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get all referral code usage by this customer.
     */
    public function referralUsage()
    {
        return $this->hasMany(ReferralCodeUsage::class);
    }

    /**
     * Get all notifications for this customer.
     */
    public function notifications()
    {
        return $this->morphMany(Notification::class, 'notifiable');
    }

    /**
     * Get unread notifications.
     */
    public function unreadNotifications()
    {
        return $this->morphMany(Notification::class, 'notifiable')
            ->whereNull('read_at')
            ->orderBy('created_at', 'desc');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get customer's full name.
     */
    public function getFullNameAttribute(): string
    {
        return trim($this->first_name . ' ' . $this->last_name);
    }

    /**
     * Get profile image URL with fallback.
     */
    public function getProfileImageUrlAttribute(): string
    {
        if (!$this->profile_image) {
            return 'https://ui-avatars.com/api/?name=' . urlencode($this->full_name)
                . '&size=200&background=0D8ABC&color=fff';
        }

        // Full URL already (OAuth provider image or external)
        if (str_starts_with($this->profile_image, 'http://') ||
            str_starts_with($this->profile_image, 'https://')) {
            return $this->profile_image;
        }

        // Already a /storage/ absolute path
        if (str_starts_with($this->profile_image, '/storage/')) {
            return url($this->profile_image);
        }

        // Relative path stored by Storage::store() — e.g. "customers/abc.jpg"
        return url(Storage::url($this->profile_image));
    }

    /**
     * Get available credit (limit - used).
     */
    public function getAvailableCreditAttribute(): float
    {
        if (!$this->has_credit_account || !$this->credit_limit) {
            return 0;
        }

        return max(0, $this->credit_limit - $this->credit_used);
    }

    /**
     * Get tier benefits from DB.
     */
    public function getTierBenefitsAttribute(): array
    {
        $tier = CustomerTier::where('slug', $this->tier)->first();

        if (!$tier) {
            $tier = CustomerTier::where('slug', 'bronze')->first();
        }

        if (!$tier) {
            return [
                'discount' => 0,
                'priority_support' => false,
                'free_shipping_threshold' => 50000,
                'loyalty_points_multiplier' => 1,
            ];
        }

        return [
            'discount' => (float) $tier->discount_percentage,
            'priority_support' => (bool) $tier->priority_support,
            'free_shipping_threshold' => $tier->free_shipping_threshold !== null ? (float) $tier->free_shipping_threshold : 0,
            'loyalty_points_multiplier' => (float) $tier->loyalty_points_multiplier,
        ];
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get only active customers.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get suspended customers.
     */
    public function scopeSuspended($query)
    {
        return $query->where('status', 'suspended');
    }

    /**
     * Scope to get verified customers.
     */
    public function scopeVerified($query)
    {
        return $query->where('is_verified', true);
    }

    /**
     * Scope to filter by customer type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('customer_type', $type);
    }

    /**
     * Scope to filter by tier.
     */
    public function scopeByTier($query, string $tier)
    {
        return $query->where('tier', $tier);
    }

    /**
     * Scope to get VIP customers (gold and platinum).
     */
    public function scopeVip($query)
    {
        $vipSlugs = CustomerTier::where('is_active', true)
            ->where('priority_support', true)
            ->pluck('slug');
        return $query->whereIn('tier', $vipSlugs);
    }
    /**
     * Scope to get customers with credit accounts.
     */
    public function scopeWithCredit($query)
    {
        return $query->where('has_credit_account', true);
    }

    /**
     * Scope to search customers.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('first_name', 'like', "%{$search}%")
              ->orWhere('last_name', 'like', "%{$search}%")
              ->orWhere('email', 'like', "%{$search}%")
              ->orWhere('phone', 'like', "%{$search}%")
              ->orWhere('customer_number', 'like', "%{$search}%")
              ->orWhere('company_name', 'like', "%{$search}%");
        });
    }

    /**
     * Scope to get customers assigned to a sales rep.
     */
    public function scopeAssignedTo($query, int $salesRepId)
    {
        return $query->where('assigned_sales_rep', $salesRepId);
    }

    /**
     * Scope to get customers with orders.
     */
    public function scopeHasOrders($query)
    {
        return $query->where('total_orders', '>', 0);
    }

    /**
     * Scope to get customers without orders (new).
     */
    public function scopeWithoutOrders($query)
    {
        return $query->where('total_orders', 0);
    }

    /**
     * Scope to get inactive customers (no orders in X months).
     */
    public function scopeInactive($query, int $months = 6)
    {
        return $query->where('last_order_date', '<', now()->subMonths($months))
            ->orWhereNull('last_order_date');
    }

    /**
     * Scope to get top spenders.
     */
    public function scopeTopSpenders($query, int $limit = 10)
    {
        return $query->orderBy('total_spent', 'desc')->limit($limit);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Check if customer can place orders.
     */
    public function canPlaceOrders(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Check if customer has credit available.
     */
    public function hasCreditAvailable(float $amount = 0): bool
    {
        if (!$this->has_credit_account) {
            return false;
        }

        return $this->available_credit >= $amount;
    }

    /**
     * Check if customer has referral discount (first order).
     */
    public function hasReferralDiscount(): bool
    {
        // No referral code attached — not a referred customer
        if (!$this->referred_by_code_id) {
            return false;
        }

        // Referral already completed on a confirmed order — permanently done
        if ($this->referral_completed_at !== null) {
            return false;
        }

        // Check if any active/pending order already has this referral code applied
        // Prevents placing multiple pending orders all with the discount
        $alreadyApplied = \App\Models\Order::where('customer_id', $this->id)
            ->where('referral_code_id', $this->referred_by_code_id)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->exists();

        return !$alreadyApplied;
    }

    /**
     * Check and trigger VIP upgrade code on tier change.
     * Call this inside checkTierUpgrade() after $this->update(['tier' => $newTier])
     */
    public function triggerVipPromoIfEligible(string $newTier): void
    {
        if (!in_array($newTier, ['gold', 'platinum'])) return;

        try {
            $service = new \App\Services\PromoCodeService();
            $service->generateVipCode($this, $newTier);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning(
                "VIP promo trigger failed for customer {$this->id}: " . $e->getMessage()
            );
        }
    }

    /**
     * Check and trigger loyalty milestone code after order confirmed.
     * Call this inside updateOrderStatistics() after total_orders incremented.
     */
    public function triggerLoyaltyPromoIfEligible(): void
    {
        try {
            $service = new \App\Services\PromoCodeService();
            $service->checkAndGenerateLoyaltyCode($this);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning(
                "Loyalty promo trigger failed for customer {$this->id}: " . $e->getMessage()
            );
        }
    }

    /**
     * Check if customer has a tag.
     */
    public function hasTag(string $tag): bool
    {
        return in_array($tag, $this->tags ?? []);
    }

    /**
     * Add a tag to customer.
     */
    public function addTag(string $tag): void
    {
        $tags = $this->tags ?? [];
        if (!in_array($tag, $tags)) {
            $tags[] = $tag;
            $this->update(['tags' => $tags]);
        }
    }

    /**
     * Remove a tag from customer.
     */
    public function removeTag(string $tag): void
    {
        $tags = $this->tags ?? [];
        $tags = array_filter($tags, fn($t) => $t !== $tag);
        $this->update(['tags' => array_values($tags)]);
    }

    /**
     * Calculate total discount for customer (from DB).
     */
    public function calculateTotalDiscount(): float
    {
        $discounts = [];

        // Personal discount (already in DB per customer)
        $discounts[] = $this->discount_percentage;

        // Tier discount (from customer_tiers table)
        $discounts[] = $this->tier_benefits['discount'];

        // Customer type discount (from customer_type_discounts table)
        $typeRow = CustomerTypeDiscount::where('slug', $this->customer_type)
            ->where('is_active', true)
            ->first();
        $discounts[] = $typeRow ? (float) $typeRow->discount_percentage : 0;

        // Total (max 30%)
        return min(array_sum($discounts), 30);
    }

    /**
     * Use credit for order.
     */
    public function useCredit(float $amount): bool
    {
        if (!$this->hasCreditAvailable($amount)) {
            return false;
        }

        $this->increment('credit_used', $amount);
        return true;
    }

    /**
     * Release credit (when order cancelled).
     */
    public function releaseCredit(float $amount): void
    {
        $this->decrement('credit_used', min($amount, $this->credit_used));
    }

    /**
     * Add store credit.
     */
    public function addStoreCredit(float $amount, string $reason = null): void
    {
        $this->increment('store_credit', $amount);
        
        // Log the transaction
        // StoreCreditTransaction::create([...]);
    }

    /**
     * Use store credit.
     */
    public function useStoreCredit(float $amount): bool
    {
        if ($this->store_credit < $amount) {
            return false;
        }

        $this->decrement('store_credit', $amount);
        return true;
    }

    /**
     * Add loyalty points.
     */
    public function addLoyaltyPoints(int $points): void
    {
        $multiplier = $this->tier_benefits['loyalty_points_multiplier'];
        $actualPoints = (int) ($points * $multiplier);
        $this->increment('loyalty_points', $actualPoints);
    }

    /**
     * Use loyalty points.
     */
    public function useLoyaltyPoints(int $points): bool
    {
        if ($this->loyalty_points < $points) {
            return false;
        }

        $this->decrement('loyalty_points', $points);
        return true;
    }

    /**
     * Update statistics after order.
     */
    public function updateOrderStatistics(Order $order): void
    {
        $this->increment('total_orders');
        $this->increment('total_spent', $order->total_kes ?? $order->total);

        if (!$this->first_order_date) {
            $this->update(['first_order_date' => now()]);
        }

        // Reload from DB so total_orders / total_spent reflect the incremented values
        $this->refresh();

        $this->update([
            'last_order_date'     => now(),
            'average_order_value' => $this->total_orders > 0
                ? round($this->total_spent / $this->total_orders, 2)
                : 0,
        ]);

        $this->checkTierUpgrade();
        $this->triggerLoyaltyPromoIfEligible();

        // ── Loyalty: referral credit to referrer on first completed order ─────────
        try {
            if (
                $this->referred_by_customer_id &&
                !$this->referral_completed_at  &&
                $this->total_orders === 1
            ) {
                $referrer = Customer::find($this->referred_by_customer_id);
                if ($referrer) {
                    app(\App\Services\LoyaltyService::class)->grantReferralCredit($referrer, $order);
                }
                $this->update(['referral_completed_at' => now()]);
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Referral credit failed for customer {$this->id}: " . $e->getMessage());
        }
    }

    // Customer model
    public function recalculateStatistics(): void
    {
        $realTotal = Order::where('customer_id', $this->id)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->sum('total_kes');

        $realCount = Order::where('customer_id', $this->id)
            ->whereNotIn('status', ['cancelled', 'failed'])
            ->count();

        $this->update([
            'total_orders'        => $realCount,
            'total_spent'         => $realTotal,
            'average_order_value' => $realCount > 0 ? round($realTotal / $realCount, 2) : 0,
            'last_order_date'     => now(),
            'first_order_date'    => $this->first_order_date ?? now(),
        ]);

        $this->refresh();
        $this->checkTierUpgrade();
        $this->triggerLoyaltyPromoIfEligible();
    }

    /**
     * Check and upgrade tier if eligible.
     */
    public function checkTierUpgrade(): void
    {
        $tiers = CustomerTier::where('is_active', true)
            ->orderBy('sort_order', 'desc')
            ->get();

        $newTier = 'bronze'; // fallback

        foreach ($tiers as $t) {
            $meetsOrders = $t->min_orders !== null && $this->total_orders >= $t->min_orders;
            $meetsSpent  = $t->min_spent !== null && $this->total_spent >= (float) $t->min_spent;

            if ($meetsOrders || $meetsSpent) {
                $newTier = $t->slug;
                break;
            }
        }

        if ($newTier !== $this->tier) {
            $oldTier = $this->tier;
            $this->update(['tier' => $newTier]);
            $this->triggerVipPromoIfEligible($newTier);

            // Notification::send($this->user, new TierUpgraded($oldTier, $newTier));
        }
    }

    /**
     * Suspend customer account.
     */
    public function suspend(string $reason): void
    {
        $this->update([
            'status' => 'suspended',
            'status_reason' => $reason,
        ]);
    }

    /**
     * Activate customer account.
     */
    public function activate(): void
    {
        $this->update([
            'status' => 'active',
            'status_reason' => null,
        ]);
    }

    /**
     * Blacklist customer.
     */
    public function blacklist(string $reason): void
    {
        $this->update([
            'status' => 'blacklisted',
            'status_reason' => $reason,
        ]);
    }

    /**
     * Generate customer number.
     */
    public static function generateCustomerNumber(): string
    {
        $year = date('Y');

        do {
            $lastCustomer = self::withTrashed()
                ->whereYear('created_at', $year)
                ->orderBy('id', 'desc')
                ->first();

            $sequence = $lastCustomer
                ? (int) substr($lastCustomer->customer_number, -4) + 1
                : 1;

            $number = 'CUST-' . $year . '-' . str_pad($sequence, 4, '0', STR_PAD_LEFT);

            $exists = self::withTrashed()->where('customer_number', $number)->exists();
        } while ($exists);

        return $number;
    }

    /**
     * Boot method to auto-generate customer number.
     */
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($customer) {
            if (!$customer->customer_number) {
                $customer->customer_number = self::generateCustomerNumber();
            }
        });
    }
}