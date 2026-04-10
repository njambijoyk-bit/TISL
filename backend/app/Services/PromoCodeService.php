<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\ReferralCode;
use App\Models\Notification;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class PromoCodeService
{
    // ═══════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════

    const BIRTHDAY_DISCOUNT_PCT     = 10;   // 10% birthday discount
    const BIRTHDAY_DAYS_BEFORE      = 7;    // Generate 7 days before birthday
    const BIRTHDAY_VALID_DAYS       = 14;   // Valid from generation to 7 days after birthday

    const FIRST_TIME_DISCOUNT_PCT   = 10;   // 10% first order discount
    const FIRST_TIME_VALID_DAYS     = 30;   // Valid for 30 days after registration

    const VIP_GOLD_DISCOUNT_PCT     = 10;   // 10% on gold upgrade
    const VIP_PLATINUM_DISCOUNT_PCT = 15;   // 15% on platinum upgrade
    const VIP_VALID_DAYS            = 60;   // Valid for 60 days

    const WIN_BACK_DISCOUNT_PCT     = 15;   // 15% win-back discount
    const WIN_BACK_INACTIVE_DAYS    = 180;  // 6 months inactive
    const WIN_BACK_VALID_DAYS       = 30;   // Valid for 30 days

    // Loyalty milestone → discount percentage
    const LOYALTY_MILESTONES = [
        5  => 5,   // 5th order  → 5% off
        10 => 10,  // 10th order → 10% off
        25 => 12,  // 25th order → 12% off
        50 => 15,  // 50th order → 15% off
    ];

    // ═══════════════════════════════════════════════════
    // BIRTHDAY CODES
    // ═══════════════════════════════════════════════════

    /**
     * Generate birthday promo codes for customers
     * whose birthday is exactly BIRTHDAY_DAYS_BEFORE days away.
     * Called daily by GenerateBirthdayCodes command.
     *
     * @return array{ generated: int, skipped: int, errors: int }
     */
    public function generateBirthdayCodes(int $daysAhead = null): array
        {
            $stats    = ['generated' => 0, 'skipped' => 0, 'errors' => 0];
            $batch    = 'birthday_' . now()->format('Y_m_d');

            // When called from scheduler: exactly 7 days ahead
            // When triggered manually (daysAhead = 0): catch today + next 7 days
            $daysAhead = $daysAhead ?? self::BIRTHDAY_DAYS_BEFORE;

            if ($daysAhead === 0) {
                // Manual trigger — check anyone with birthday in next 0–7 days
                $customers = Customer::whereNotNull('birthday')
                    ->where('status', 'active')
                    ->get()
                    ->filter(function ($customer) {
                        $birthday = \Carbon\Carbon::parse($customer->birthday);
                        $birthdayThisYear = $birthday->copy()->year(now()->year);
                        $daysUntil = now()->startOfDay()->diffInDays($birthdayThisYear, false);
                        return $daysUntil >= 0 && $daysUntil <= 7;
                    });
            } else {
                $targetDate = now()->addDays($daysAhead);
                $customers = Customer::whereNotNull('birthday')
                    ->whereMonth('birthday', $targetDate->month)
                    ->whereDay('birthday', $targetDate->day)
                    ->where('status', 'active')
                    ->get();
            }

            foreach ($customers as $customer) {
            
            try {
                // Skip if already generated this year
                $alreadyExists = ReferralCode::where('target_customer_id', $customer->id)
                    ->where('event_type', 'birthday')
                    ->whereYear('created_at', now()->year)
                    ->exists();

                if ($alreadyExists) {
                    $stats['skipped']++;
                    continue;
                }

                $validFrom  = now();
                $validUntil = now()->addDays(self::BIRTHDAY_VALID_DAYS);

                $this->createPromoCode([
                    'name'               => "{$customer->full_name}'s Birthday Discount",
                    'description'        => "Happy Birthday {$customer->first_name}! Enjoy " . self::BIRTHDAY_DISCOUNT_PCT . "% off your next order.",
                    'type'               => 'birthday',
                    'event_type'         => 'birthday',
                    'target_customer_id' => $customer->id,
                    'reward_type'        => 'percentage',
                    'reward_value'       => self::BIRTHDAY_DISCOUNT_PCT,
                    'max_uses'           => 1,
                    'max_uses_per_customer' => 1,
                    'valid_from'         => $validFrom,
                    'valid_until'        => $validUntil,
                    'auto_generated'     => true,
                    'generation_batch'   => $batch,
                    'is_public'          => false,
                    'applicable_customer_types' => null,
                ]);

                // Notify customer
                $this->notifyCustomer(
                    $customer,
                    'birthday_promo',
                    '🎂 Happy Birthday! Your gift is here',
                    "You have a " . self::BIRTHDAY_DISCOUNT_PCT . "% birthday discount waiting for you. Valid until " . $validUntil->format('M d, Y') . '.',
                );

                $stats['generated']++;

            } catch (\Exception $e) {
                Log::error("Birthday code generation failed for customer {$customer->id}: " . $e->getMessage());
                $stats['errors']++;
            }
        }

        Log::info('Birthday codes generated', $stats);
        return $stats;
    }

    // ═══════════════════════════════════════════════════
    // FIRST TIME CODES
    // ═══════════════════════════════════════════════════

    /**
     * Generate a first-time promo code for a newly registered customer.
     * Called from AuthController::register() and OAuthController.
     * Only generates if admin has enabled first_time promos
     * (checks if any active first_time template exists in referral_codes).
     */
    public function generateFirstTimeCode(Customer $customer): ?ReferralCode
    {
        try {
            // Check if already has one
            $exists = ReferralCode::where('target_customer_id', $customer->id)
                ->where('event_type', 'first_time')
                ->exists();

            if ($exists) return null;

            // Check if there's an active admin-configured first_time template
            $template = ReferralCode::where('type', 'first_time')
                ->where('event_type', 'first_time')
                ->whereNull('target_customer_id') // template has no target
                ->where('status', 'active')
                ->first();

            // If no template configured by admin, skip
            if (!$template) return null;

            $validUntil = now()->addDays(self::FIRST_TIME_VALID_DAYS);

            $code = $this->createPromoCode([
                'name'               => "Welcome Discount — {$customer->full_name}",
                'description'        => "Welcome to TISL! Enjoy {$template->reward_value}% off your first order.",
                'type'               => 'first_time',
                'event_type'         => 'first_time',
                'target_customer_id' => $customer->id,
                'reward_type'        => $template->reward_type,
                'reward_value'       => $template->reward_value,
                'max_uses'           => 1,
                'max_uses_per_customer' => 1,
                'valid_from'         => now(),
                'valid_until'        => $validUntil,
                'auto_generated'     => true,
                'generation_batch'   => 'first_time_' . $customer->id,
                'is_public'          => false,
            ]);

            $this->notifyCustomer(
                $customer,
                'first_time_promo',
                '🎉 Welcome! Here is your first order discount',
                "Use code {$code->code} for {$rewardLabel} your first order. Valid until " . $validUntil->format('M d, Y') . '.',
            );

            return $code;

        } catch (\Exception $e) {
            Log::error("First time code generation failed for customer {$customer->id}: " . $e->getMessage());
            return null;
        }
    }

    // ═══════════════════════════════════════════════════
    // VIP UPGRADE CODES
    // ═══════════════════════════════════════════════════

    /**
     * Generate a VIP upgrade promo code when customer reaches gold/platinum.
     * Called from Customer::checkTierUpgrade() when tier changes.
     */
    public function generateVipCode(Customer $customer, string $newTier): ?ReferralCode
    {
        if (!in_array($newTier, ['gold', 'platinum'])) return null;

        try {
            // Only one VIP code per tier level
            $exists = ReferralCode::where('target_customer_id', $customer->id)
                ->where('event_type', 'vip_upgrade')
                ->where('name', 'like', "%{$newTier}%")
                ->exists();

            if ($exists) return null;

            $discountPct = $newTier === 'platinum'
                ? self::VIP_PLATINUM_DISCOUNT_PCT
                : self::VIP_GOLD_DISCOUNT_PCT;

            $tierLabel   = ucfirst($newTier);
            $validUntil  = now()->addDays(self::VIP_VALID_DAYS);

            $code = $this->createPromoCode([
                'name'               => "{$tierLabel} Member Welcome — {$customer->full_name}",
                'description'        => "Congratulations on reaching {$tierLabel} tier! Enjoy {$discountPct}% off your next order.",
                'type'               => 'vip',
                'event_type'         => 'vip_upgrade',
                'target_customer_id' => $customer->id,
                'reward_type'        => 'percentage',
                'reward_value'       => $discountPct,
                'max_uses'           => 1,
                'max_uses_per_customer' => 1,
                'valid_from'         => now(),
                'valid_until'        => $validUntil,
                'auto_generated'     => true,
                'generation_batch'   => "vip_{$newTier}_{$customer->id}",
                'is_public'          => false,
            ]);

            $this->notifyCustomer(
                $customer,
                'vip_upgrade_promo',
                "🏆 Welcome to {$tierLabel}! Your reward is here",
                "You've been upgraded to {$tierLabel} tier! Use code {$code->code} for {$discountPct}% off. Valid until " . $validUntil->format('M d, Y') . '.',
            );

            return $code;

        } catch (\Exception $e) {
            Log::error("VIP code generation failed for customer {$customer->id}: " . $e->getMessage());
            return null;
        }
    }

    // ═══════════════════════════════════════════════════
    // LOYALTY MILESTONE CODES
    // ═══════════════════════════════════════════════════

    /**
     * Check and generate loyalty milestone code after an order is confirmed.
     * Called from OrderController::confirm() after order confirmed.
     * Checks if customer's total_orders matches any milestone.
     */
    public function checkAndGenerateLoyaltyCode(Customer $customer): ?ReferralCode
    {
        $totalOrders = $customer->total_orders;

        if (!array_key_exists($totalOrders, self::LOYALTY_MILESTONES)) {
            return null;
        }

        $discountPct = self::LOYALTY_MILESTONES[$totalOrders];

        try {
            // Check not already generated for this milestone
            $exists = ReferralCode::where('target_customer_id', $customer->id)
                ->where('event_type', 'loyalty_milestone')
                ->where('milestone_trigger', $totalOrders)
                ->exists();

            if ($exists) return null;

            $validUntil = now()->addDays(30);

            $code = $this->createPromoCode([
                'name'               => "Loyalty Reward — Order #{$totalOrders} — {$customer->full_name}",
                'description'        => "Thank you for your {$totalOrders} orders! Here is {$discountPct}% off your next one.",
                'type'               => 'general',
                'event_type'         => 'loyalty_milestone',
                'target_customer_id' => $customer->id,
                'milestone_trigger'  => $totalOrders,
                'reward_type'        => 'percentage',
                'reward_value'       => $discountPct,
                'max_uses'           => 1,
                'max_uses_per_customer' => 1,
                'valid_from'         => now(),
                'valid_until'        => $validUntil,
                'auto_generated'     => true,
                'generation_batch'   => "loyalty_{$totalOrders}_{$customer->id}",
                'is_public'          => false,
            ]);

            $this->notifyCustomer(
                $customer,
                'loyalty_milestone_promo',
                "🎯 {$totalOrders} Orders! Here is your loyalty reward",
                "You have placed {$totalOrders} orders with us! Use code {$code->code} for {$discountPct}% off. Valid until " . $validUntil->format('M d, Y') . '.',
            );

            return $code;

        } catch (\Exception $e) {
            Log::error("Loyalty code generation failed for customer {$customer->id}: " . $e->getMessage());
            return null;
        }
    }

    // ═══════════════════════════════════════════════════
    // WIN-BACK CODES
    // ═══════════════════════════════════════════════════

    /**
     * Generate win-back promo codes for inactive customers.
     * Called daily by GenerateWinBackCodes command.
     *
     * @return array{ generated: int, skipped: int, errors: int }
     */
    public function generateWinBackCodes(): array
    {
        $stats      = ['generated' => 0, 'skipped' => 0, 'errors' => 0];
        $batch      = 'win_back_' . now()->format('Y_m_d');
        $cutoffDate = now()->subDays(self::WIN_BACK_INACTIVE_DAYS);

        // Customers who haven't ordered in 6 months and have at least 1 order
        $customers = Customer::where('status', 'active')
            ->where('total_orders', '>', 0)
            ->where('last_order_date', '<', $cutoffDate)  // strictly: last ordered more than N days ago
            ->get();

        foreach ($customers as $customer) {
            try {
                // Skip if already has an active win-back code
                $alreadyHasActive = ReferralCode::where('target_customer_id', $customer->id)
                    ->where('event_type', 'win_back')
                    ->where('status', 'active')
                    ->where('valid_until', '>', now())
                    ->exists();

                if ($alreadyHasActive) {
                    $stats['skipped']++;
                    continue;
                }

                $validUntil = now()->addDays(self::WIN_BACK_VALID_DAYS);

                $code = $this->createPromoCode([
                    'name'               => "We Miss You — {$customer->full_name}",
                    'description'        => "It has been a while! Come back and enjoy " . self::WIN_BACK_DISCOUNT_PCT . "% off your next order.",
                    'type'               => 'general',
                    'event_type'         => 'win_back',
                    'target_customer_id' => $customer->id,
                    'inactive_days'      => self::WIN_BACK_INACTIVE_DAYS,
                    'reward_type'        => 'percentage',
                    'reward_value'       => self::WIN_BACK_DISCOUNT_PCT,
                    'max_uses'           => 1,
                    'max_uses_per_customer' => 1,
                    'valid_from'         => now(),
                    'valid_until'        => $validUntil,
                    'auto_generated'     => true,
                    'generation_batch'   => $batch,
                    'is_public'          => false,
                ]);

                $this->notifyCustomer(
                    $customer,
                    'win_back_promo',
                    '👋 We miss you! Here is a special offer',
                    "Use code {$code->code} for " . self::WIN_BACK_DISCOUNT_PCT . "% off. Valid until " . $validUntil->format('M d, Y') . '.',
                );

                $stats['generated']++;

            } catch (\Exception $e) {
                Log::error("Win-back code generation failed for customer {$customer->id}: " . $e->getMessage());
                $stats['errors']++;
            }
        }

        Log::info('Win-back codes generated', $stats);
        return $stats;
    }

    // ═══════════════════════════════════════════════════
    // EXPIRE CODES
    // ═══════════════════════════════════════════════════

    /**
     * Mark expired promo codes as expired status.
     * Called daily by ExpirePromoCodes command.
     *
     * @return int Number of codes expired
     */
    public function expireOutdatedCodes(): int
    {
        $count = ReferralCode::where('status', 'active')
            ->whereNotNull('valid_until')
            ->where('valid_until', '<', now())
            ->update(['status' => 'expired']);

        Log::info("Expired {$count} promo codes");
        return $count;
    }

    // ═══════════════════════════════════════════════════
    // VALIDATE PROMO CODE (used by checkout + admin)
    // ═══════════════════════════════════════════════════

    /**
     * Validate a promo code for a customer and order value.
     * Returns validation result with discount amount.
     *
     * @return array{ valid: bool, message: string, code?: ReferralCode, discount?: float }
     */
    public function validatePromoCode(
        string $code,
        Customer $customer,
        float $orderValue,
        ?float $referralDiscount = 0
    ): array {
        $promoCode = ReferralCode::where('code', strtoupper(trim($code)))
            ->whereNotIn('type', ['customer_referral']) // referral codes handled separately
            ->first();

        if (!$promoCode) {
            return ['valid' => false, 'message' => 'Invalid promo code.'];
        }

        if (!$promoCode->is_valid) {
            $reason = $promoCode->is_expired
                ? 'This code has expired.'
                : ($promoCode->is_depleted ? 'This code has been fully redeemed.' : 'This code is not active.');
            return ['valid' => false, 'message' => $reason];
        }

        // Per-customer codes — check it belongs to this customer
        if ($promoCode->target_customer_id && $promoCode->target_customer_id !== $customer->id) {
            return ['valid' => false, 'message' => 'This code is not valid for your account.'];
        }

        // Check stackable — if referral discount already applied and code is not stackable
        if (!$promoCode->stackable && $referralDiscount > 0) {
            return [
                'valid'   => false,
                'message' => 'This code cannot be combined with your referral discount.',
            ];
        }

        // Check canBeUsedBy (min order value, customer type, tier, per-customer usage limit)
        if (!$promoCode->canBeUsedBy($customer, $orderValue)) {
            $minOrder = $promoCode->min_order_value;
            $message  = $minOrder
                ? "Minimum order of KES " . number_format($minOrder, 0) . " required for this code."
                : 'You are not eligible for this code.';
            return ['valid' => false, 'message' => $message];
        }

        $discount = $promoCode->calculateDiscount($orderValue);

        return [
            'valid'    => true,
            'message'  => "Code applied! You save " . ($promoCode->reward_type === 'percentage'
                ? "{$promoCode->reward_value}%"
                : "KES " . number_format($discount, 2)),
            'code'     => $promoCode,
            'discount' => $discount,
        ];
    }

    // ═══════════════════════════════════════════════════
    // APPLY PROMO CODE TO ORDER (called after order created)
    // ═══════════════════════════════════════════════════

    /**
     * Record promo code usage after order is successfully created.
     * Increments attempts and records the attempt on the code.
     */
    public function recordPromoUsage(ReferralCode $promoCode, float $orderValue): void
    {
        $promoCode->recordAttempt();
        $promoCode->recordSuccess(
            $promoCode->calculateDiscount($orderValue),
            $orderValue
        );
    }

    // ═══════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════

    /**
     * Create a promo code with generated unique code string.
     */
    private function createPromoCode(array $data): ReferralCode
    {
        return ReferralCode::create([
            'code'                  => ReferralCode::generateUniqueCode(10),
            'status'                => 'active',
            'stackable'             => false,
            'referrer_reward_type'  => 'none',
            'referrer_reward_value' => 0,
            ...$data,
        ]);
    }

    /**
     * Send an in-app notification to the customer.
     */
    private function notifyCustomer(
        Customer $customer,
        string $type,
        string $title,
        string $message
    ): void {
        try {
            Notification::createFor(
                notifiable: $customer->user ?? $customer,
                type:       $type,
                title:      $title,
                message:    $message,
                channels:   ['database'],
                priority:   'normal',
            );
        } catch (\Exception $e) {
            // Notification failure should never block code generation
            Log::warning("Promo notification failed for customer {$customer->id}: " . $e->getMessage());
        }
    }

    // ═══════════════════════════════════════════════════
    // GET CUSTOMER'S PROMO CODES
    // ═══════════════════════════════════════════════════

    /**
     * Get all promo codes for a customer grouped by status.
     */
    public function getCustomerPromoCodes(Customer $customer): array
    {
        $codes = ReferralCode::where('target_customer_id', $customer->id)
            ->whereNotIn('type', ['customer_referral'])
            ->orderBy('created_at', 'desc')
            ->get();

        return [
            'active_codes'  => $codes->filter(fn($c) => $c->status === 'active' && !$c->is_expired)->values(),
            'used_codes'    => $codes->filter(fn($c) => $c->times_used > 0)->values(),
            'expired_codes' => $codes->filter(fn($c) => $c->is_expired || $c->status === 'expired')->values(),
        ];
    }
}