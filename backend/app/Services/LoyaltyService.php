<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\LoyaltySetting;
use App\Models\Order;
use App\Models\StoreCreditTransaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LoyaltyService
{
    // =========================================================================
    // SETTINGS
    // =========================================================================

    public function getSetting(string $key, mixed $default = null): mixed
    {
        return LoyaltySetting::get($key, $default);
    }

    public function getAllSettings(): array
    {
        return LoyaltySetting::getAll();
    }

    public function updateSetting(string $key, mixed $value, User $admin): void
    {
        LoyaltySetting::set($key, $value, $admin->id);
    }

    // ── Redemption rules ──────────────────────────────────────────────────────

    public function getRedemptionRules(bool $activeOnly = false): array
    {
        $rules = LoyaltySetting::get('redemption_rules', []);

        if ($activeOnly) {
            $now = now();
            $rules = array_filter($rules, function ($rule) use ($now) {
                if (!($rule['active'] ?? false)) return false;
                if (!empty($rule['valid_from'])  && $now->lt($rule['valid_from']))  return false;
                if (!empty($rule['valid_until']) && $now->gt($rule['valid_until'])) return false;
                return true;
            });
        }

        return array_values($rules);
    }

    public function upsertRedemptionRule(array $data, User $admin): array
    {
        $rules = LoyaltySetting::get('redemption_rules', []);

        $isNew = empty($data['id']);
        if ($isNew) $data['id'] = (string) Str::uuid();

        $idx = collect($rules)->search(fn($r) => $r['id'] === $data['id']);

        if ($idx !== false) {
            $rules[$idx] = array_merge($rules[$idx], $data);
        } else {
            $rules[] = $data;
        }

        LoyaltySetting::set('redemption_rules', $rules, $admin->id);
        return $data;
    }

    public function deleteRedemptionRule(string $ruleId, User $admin): void
    {
        $rules = LoyaltySetting::get('redemption_rules', []);
        $rules = array_values(array_filter($rules, fn($r) => $r['id'] !== $ruleId));
        LoyaltySetting::set('redemption_rules', $rules, $admin->id);
    }

    // =========================================================================
    // LOYALTY POINTS
    // =========================================================================

    /**
     * Auto-earn points when an order is paid.
     * Trigger: Order::markAsPaid()
     */
    public function earnPointsForOrder(Order $order): void
    {
        $customer = $order->customer;
        if (!$customer) return;

        $totalKes   = (float) ($order->total_kes ?? 0);
        if ($totalKes <= 0) return;

        $rate       = (int) LoyaltySetting::get('points_per_100_kes', 1);
        $rawPoints  = (int) floor($totalKes / 100) * $rate;
        if ($rawPoints <= 0) return;

        // Apply tier multiplier (already defined on Customer model)
        $multiplier = $customer->tier_benefits['loyalty_points_multiplier'] ?? 1;
        $points     = (int) round($rawPoints * $multiplier);

        // Expiry
        $expiryMonths = LoyaltySetting::get('points_expiry_months', null);
        $pointType    = $expiryMonths ? 'expiring' : 'permanent';
        $expiresAt    = $expiryMonths ? now()->addMonths((int) $expiryMonths) : null;

        $this->writePointTransaction(
            customer:      $customer,
            points:        $points,
            type:          'order_earn',
            pointType:     $pointType,
            expiresAt:     $expiresAt,
            note:          "Earned on order {$order->order_number}",
            referenceType: Order::class,
            referenceId:   $order->id,
            createdBy:     null,
        );
    }

     /**  
     * Reverse earned points when a paid order is cancelled.  
     * Idempotent: checks if already reversed for this order.  
     */  
    public function reversePointsForCancelledOrder(Order $order): void  
    {  
        $customer = $order->customer;  
        if (!$customer) return;  
    
        // Idempotency: skip if already reversed  
        $alreadyReversed = LoyaltyPointTransaction::where('reference_type', Order::class)  
            ->where('reference_id', $order->id)  
            ->where('type', 'order_cancel')  
            ->exists();  
        if ($alreadyReversed) return;  
    
        // Find the original earn for this order  
        $earnTx = LoyaltyPointTransaction::where('reference_type', Order::class)  
            ->where('reference_id', $order->id)  
            ->where('type', 'order_earn')  
            ->first();  
        if (!$earnTx || $earnTx->points <= 0) return;  
    
        // Cap to customer's current balance (they may have spent some)  
        $toDeduct = min($earnTx->points, $customer->loyalty_points);  
        if ($toDeduct <= 0) return;  
    
        $this->writePointTransaction(  
            customer:      $customer,  
            points:        -$toDeduct,  
            type:          'order_cancel',  
            pointType:     'permanent',  
            note:          "Points reversed — order {$order->order_number} cancelled",  
            referenceType: Order::class,  
            referenceId:   $order->id,  
        );  
    }  
    
    /**  
     * Re-award points when a cancelled order is restored.  
     * Idempotent: checks if already re-awarded for this order.  
     */  
    public function restorePointsForRestoredOrder(Order $order): void  
    {  
        $customer = $order->customer;  
        if (!$customer) return;  
    
        // Idempotency: skip if already restored  
        $alreadyRestored = LoyaltyPointTransaction::where('reference_type', Order::class)  
            ->where('reference_id', $order->id)  
            ->where('type', 'order_restore')  
            ->exists();  
        if ($alreadyRestored) return;  
    
        // Find the cancel deduction for this order  
        $cancelTx = LoyaltyPointTransaction::where('reference_type', Order::class)  
            ->where('reference_id', $order->id)  
            ->where('type', 'order_cancel')  
            ->first();  
        if (!$cancelTx) return;  
    
        // Re-award the absolute value of what was deducted  
        $toRestore = abs($cancelTx->points);  
        if ($toRestore <= 0) return;  
    
        $this->writePointTransaction(  
            customer:      $customer,  
            points:        $toRestore,  
            type:          'order_restore',  
            pointType:     'permanent',  
            note:          "Points re-awarded — order {$order->order_number} restored",  
            referenceType: Order::class,  
            referenceId:   $order->id,  
        );  
    }

    /**
     * Admin manually grants points to a customer.
     */
    public function grantPoints(
        Customer $customer,
        int      $points,
        string   $note,
        User     $admin,
        string   $pointType = 'permanent',
        ?string  $expiresAt = null
    ): LoyaltyPointTransaction {
        return $this->writePointTransaction(
            customer:  $customer,
            points:    abs($points),
            type:      'admin_grant',
            pointType: $pointType,
            expiresAt: $expiresAt ? now()->parse($expiresAt) : null,
            note:      $note ?: 'Admin grant',
            createdBy: $admin->id,
        );
    }

    /**
     * Admin manually deducts points from a customer.
     */
    public function deductPoints(
        Customer $customer,
        int      $points,
        string   $note,
        User     $admin
    ): LoyaltyPointTransaction {
        $points = abs($points);

        if ($customer->loyalty_points < $points) {
            throw new \InvalidArgumentException("Customer only has {$customer->loyalty_points} points.");
        }

        return $this->writePointTransaction(
            customer:  $customer,
            points:    -$points,
            type:      'admin_deduct',
            pointType: 'permanent',
            note:      $note ?: 'Admin deduct',
            createdBy: $admin->id,
        );
    }

    /**
     * Grant referral bonus points.
     * Called when a referred customer completes their first order.
     */
    public function grantReferralPointBonus(Customer $referrer, Order $triggerOrder): void
    {
        $points = (int) LoyaltySetting::get('referral_bonus_points', 0);
        if ($points <= 0) return;

        $this->writePointTransaction(
            customer:      $referrer,
            points:        $points,
            type:          'referral_bonus',
            pointType:     'permanent',
            note:          "Referral bonus — referred customer placed order {$triggerOrder->order_number}",
            referenceType: Order::class,
            referenceId:   $triggerOrder->id,
        );
    }

    // =========================================================================
    // STORE CREDIT
    // =========================================================================

    /**
     * Admin manually grants store credit.
     */
    public function grantCredit(
        Customer $customer,
        float    $amount,
        string   $note,
        User     $admin,
        ?string  $expiresAt = null
    ): StoreCreditTransaction {
        return $this->writeCreditTransaction(
            customer:  $customer,
            amount:    abs($amount),
            type:      'admin_grant',
            note:      $note ?: 'Admin grant',
            createdBy: $admin->id,
            expiresAt: $expiresAt ? now()->parse($expiresAt) : null,
        );
    }

    /**
     * Admin manually deducts store credit.
     */
    public function deductCredit(
        Customer $customer,
        float    $amount,
        string   $note,
        User     $admin
    ): StoreCreditTransaction {
        $amount = abs($amount);

        if ((float) $customer->store_credit < $amount) {
            throw new \InvalidArgumentException("Customer only has KES {$customer->store_credit} store credit.");
        }

        return $this->writeCreditTransaction(
            customer:  $customer,
            amount:    -$amount,
            type:      'admin_deduct',
            note:      $note ?: 'Admin deduct',
            createdBy: $admin->id,
        );
    }

    /**
     * Grant referral reward credit to referrer when referred customer pays first order.
     * Trigger: Customer::updateOrderStatistics() when referral_completed_at is being set.
     */
    public function grantReferralCredit(Customer $referrer, Order $triggerOrder): void
    {
        $amount = (float) LoyaltySetting::get('referral_credit_amount', 500);
        if ($amount <= 0) return;

        $this->writeCreditTransaction(
            customer:      $referrer,
            amount:        $amount,
            type:          'referral_reward',
            note:          "Referral reward — referred customer placed order {$triggerOrder->order_number}",
            referenceType: Order::class,
            referenceId:   $triggerOrder->id,
        );
    }

    /**
     * Grant store credit as part of a refund.
     */
    public function grantRefundCredit(Customer $customer, float $amount, Order $order, ?User $admin = null): void
    {
        $this->writeCreditTransaction(
            customer:      $customer,
            amount:        $amount,
            type:          'order_refund',
            note:          "Refund credit for order {$order->order_number}",
            referenceType: Order::class,
            referenceId:   $order->id,
            createdBy:     $admin?->id,
        );
    }

    /**
     * Spend store credit at checkout.
     * Returns false if insufficient balance.
     */
    public function spendCredit(Customer $customer, float $amount, Order $order): bool
    {
        if ((float) $customer->store_credit < $amount) return false;

        $this->writeCreditTransaction(
            customer:      $customer,
            amount:        -$amount,
            type:          'order_spend',
            note:          "Used at checkout — order {$order->order_number}",
            referenceType: Order::class,
            referenceId:   $order->id,
        );

        return true;
    }

    /**
     * Apply store credit to an order at checkout.
     * Handles multicurrency — credit is always KES, converts to order currency.
     * Call this inside OrderController::store() BEFORE saving the order total.
     *
     * Returns array with deduction amounts to apply to the order.
     */
    public function applyStoreCreditToOrder(
        Customer $customer,
        float    $requestedKes,   // how much KES credit customer wants to use
        float    $totalKes,       // order total in KES (cap)
        float    $exchangeRate,   // order exchange_rate_to_kes (1.0 if KES)
    ): array {
        $available = (float) $customer->store_credit;
        if ($available <= 0) {
            return ['deduction_kes' => 0, 'deduction_order_currency' => 0];
        }

        // Cap: can't use more than available or more than the order total
        $deductionKes = min($requestedKes, $available, $totalKes);
        $deductionKes = round($deductionKes, 2);

        if ($deductionKes <= 0) {
            return ['deduction_kes' => 0, 'deduction_order_currency' => 0];
        }

        // Convert to order currency
        $rate = $exchangeRate > 0 ? $exchangeRate : 1;
        $deductionOrderCurrency = round($deductionKes / $rate, 2);

        return [
            'deduction_kes'            => $deductionKes,
            'deduction_order_currency' => $deductionOrderCurrency,
        ];
    }

    // =========================================================================
    // REDEMPTION  (Points → value)
    // =========================================================================

    /**
     * Redeem points against an active rule.
     * Works for both admin-initiated and customer self-serve.
     */
    public function redeem(Customer $customer, string $ruleId, ?User $initiatedBy = null): array
    {
        $rules      = $this->getRedemptionRules(activeOnly: true);
        $rule       = collect($rules)->firstWhere('id', $ruleId);

        if (!$rule) {
            throw new \InvalidArgumentException('Redemption rule not found or not active.');
        }

        $required = (int) ($rule['points_required'] ?? 0);
        $minThreshold = (int) LoyaltySetting::get('min_redemption_points', 500);

        if ($required < $minThreshold) {
            throw new \InvalidArgumentException("Redemption requires at least {$minThreshold} points.");
        }

        if ($customer->loyalty_points < $required) {
            throw new \InvalidArgumentException(
                "Insufficient points. Required: {$required}, available: {$customer->loyalty_points}."
            );
        }

        $valueKes = (float) ($rule['value_kes'] ?? 0);
        $ruleName = $rule['name'] ?? 'Redemption';
        $ruleType = $rule['type'] ?? 'cashback';

        DB::transaction(function () use ($customer, $required, $valueKes, $ruleId, $ruleName, $ruleType, $initiatedBy) {
            // Deduct points
            $this->writePointTransaction(
                customer:  $customer,
                points:    -$required,
                type:      'redemption',
                pointType: 'permanent',
                note:      "Redeemed for: {$ruleName}",
                createdBy: $initiatedBy?->id,
                metadata:  ['rule_id' => $ruleId, 'rule_name' => $ruleName, 'rule_type' => $ruleType],
            );

            // Grant store credit (for cashback / voucher types with a KES value)
            if ($valueKes > 0 && in_array($ruleType, ['cashback', 'voucher'])) {
                $this->writeCreditTransaction(
                    customer:  $customer,
                    amount:    $valueKes,
                    type:      'points_redemption',
                    note:      "Redemption: {$ruleName}",
                    createdBy: $initiatedBy?->id,
                    metadata:  ['rule_id' => $ruleId, 'rule_name' => $ruleName],
                );
            }
            // Gift type: no credit issued — handled outside (e.g. physical gift dispatch)
        });

        return [
            'rule'       => $ruleName,
            'rule_type'  => $ruleType,
            'points_used' => $required,
            'credit_granted' => ($ruleType !== 'gift') ? $valueKes : 0,
            'message'    => $ruleType === 'gift'
                ? "Your gift redemption request has been placed."
                : "KES {$valueKes} store credit has been added to your account.",
        ];
    }

    // =========================================================================
    // EXPIRY  (run via artisan command)
    // =========================================================================

    /**
     * Expire due loyalty points and write negative transactions.
     * Called by: php artisan loyalty:expire-points
     */
    public function expirePoints(): int
    {
        $due = LoyaltyPointTransaction::due()->with('customer')->get();

        $expired = 0;
        foreach ($due as $tx) {
            $customer = $tx->customer;
            if (!$customer) continue;

            DB::transaction(function () use ($tx, $customer, &$expired) {
                // Mark original transaction as expired
                $tx->update(['expired_at' => now()]);

                // Write a negative offset only if the customer still has the points
                $toRemove = min($tx->points, $customer->loyalty_points);
                if ($toRemove <= 0) return;

                $this->writePointTransaction(
                    customer:      $customer,
                    points:        -$toRemove,
                    type:          'expiry',
                    pointType:     'permanent',
                    note:          "Points expired (original earn: {$tx->created_at->toDateString()})",
                    referenceType: LoyaltyPointTransaction::class,
                    referenceId:   $tx->id,
                );
                $expired++;
            });
        }

        return $expired;
    }

    // =========================================================================
    // PRIVATE WRITERS  (single point of write for both tables)
    // =========================================================================

    private function writePointTransaction(
        Customer  $customer,
        int       $points,
        string    $type,
        string    $pointType   = 'permanent',
        mixed     $expiresAt   = null,
        ?string   $note        = null,
        ?string   $referenceType = null,
        ?int      $referenceId   = null,
        ?int      $createdBy     = null,
        array     $metadata      = [],
    ): LoyaltyPointTransaction {
        return DB::transaction(function () use (
            $customer, $points, $type, $pointType, $expiresAt,
            $note, $referenceType, $referenceId, $createdBy, $metadata
        ) {
            // Lock the customer row to prevent race conditions
            $customer = Customer::lockForUpdate()->find($customer->id);

            $newBalance = max(0, $customer->loyalty_points + $points);

            $tx = LoyaltyPointTransaction::create([
                'customer_id'    => $customer->id,
                'points'         => $points,
                'balance_after'  => $newBalance,
                'type'           => $type,
                'point_type'     => $pointType,
                'expires_at'     => $expiresAt,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'note'           => $note,
                'created_by'     => $createdBy,
                'metadata'       => $metadata ?: null,
            ]);

            $customer->update(['loyalty_points' => $newBalance]);

            return $tx;
        });
    }

    private function writeCreditTransaction(
        Customer $customer,
        float    $amount,
        string   $type,
        ?string  $note          = null,
        ?string  $referenceType = null,
        ?int     $referenceId   = null,
        ?int     $createdBy     = null,
        mixed    $expiresAt     = null,
        array    $metadata      = [],
    ): StoreCreditTransaction {
        return DB::transaction(function () use (
            $customer, $amount, $type, $note,
            $referenceType, $referenceId, $createdBy, $expiresAt, $metadata
        ) {
            $customer = Customer::lockForUpdate()->find($customer->id);

            $newBalance = max(0, (float) $customer->store_credit + $amount);

            $tx = StoreCreditTransaction::create([
                'customer_id'    => $customer->id,
                'amount'         => $amount,
                'balance_after'  => $newBalance,
                'type'           => $type,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'note'           => $note,
                'created_by'     => $createdBy,
                'expires_at'     => $expiresAt,
                'metadata'       => $metadata ?: null,
            ]);

            $customer->update(['store_credit' => $newBalance]);

            return $tx;
        });
    }
}