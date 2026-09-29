<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\LoyaltySetting;
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


    // =========================================================================
    // GIFT VOUCHERS (formerly store credit)
    // =========================================================================

    /**
     * Admin issues a gift voucher to a customer (this replaces "store credit").
     * $amount is in the base currency.
     */
    public function grantCredit(
        Customer $customer,
        float    $amount,
        string   $note,
        User     $admin,
        ?string  $expiresAt = null
    ) {
        $gv = app(\App\Services\Books\GiftVoucherService::class)->issue([
            'amount' => abs($amount), 'customer_id' => $customer->id, 'source' => 'manual', 'note' => $note ?: 'Admin grant', 'expires_at' => $expiresAt,
        ], $admin);
        $tx = $gv->transactions()->first();
        $tx->balance_after = app(\App\Services\Books\GiftVoucherService::class)->customerBalanceBase($customer->id);

        return $tx;
    }

    /** Admin takes value back off a customer's gift vouchers (base currency). */
    public function deductCredit(
        Customer $customer,
        float    $amount,
        string   $note,
        User     $admin
    ) {
        $svc = app(\App\Services\Books\GiftVoucherService::class);
        try {
            $svc->deductFromCustomer($customer->id, abs($amount), $note ?: 'Admin deduct', $admin);
        } catch (\App\Services\Books\BooksException $e) {
            throw new \InvalidArgumentException($e->getMessage());
        }
        $tx = \App\Models\Books\GiftVoucherTransaction::whereHas('giftVoucher', fn ($q) => $q->where('customer_id', $customer->id))->latest('id')->first();
        $tx->balance_after = $svc->customerBalanceBase($customer->id);

        return $tx;
    }





    // =========================================================================
    // REDEMPTION  (Points → value)
    // =========================================================================

    /**
     * Redeem points against an active rule.
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

        $valueKes = (float) ($rule['value'] ?? $rule['value_kes'] ?? 0);   // the rule's value, in the rule's own currency
        $ruleName = $rule['name'] ?? 'Redemption';
        $ruleType = $rule['type'] ?? 'cashback';

        if (in_array($ruleType, ['cashback', 'voucher'], true) && $valueKes > 0) {
            // points become a gift voucher (points are not money; the voucher is)
            $gv = app(\App\Services\Books\RewardService::class)->redeemForGiftVoucher($customer, $rule, $initiatedBy);
            $cur = $gv->currency?->code ?? '';

            return [
                'rule' => $ruleName, 'rule_type' => $ruleType, 'points_used' => $required, 'credit_granted' => $valueKes,
                'gift_voucher_code' => $gv->code,
                'message' => "Your gift voucher {$gv->code} for {$cur} " . number_format($valueKes, 2) . ' is ready to use at checkout.',
            ];
        }

        DB::transaction(function () use ($customer, $required, $ruleId, $ruleName, $ruleType, $initiatedBy) {
            $this->writePointTransaction(
                customer:  $customer,
                points:    -$required,
                type:      'redemption',
                pointType: 'permanent',
                note:      "Redeemed for: {$ruleName}",
                createdBy: $initiatedBy?->id,
                metadata:  ['rule_id' => $ruleId, 'rule_name' => $ruleName, 'rule_type' => $ruleType],
            );
        });

        return [
            'rule' => $ruleName, 'rule_type' => $ruleType, 'points_used' => $required, 'credit_granted' => 0,
            'message' => 'Your gift redemption request has been placed.',
        ];
    }

    // =========================================================================
    // EXPIRY  (run via artisan command)
    // =========================================================================

    /**
     * Expire due loyalty points and write negative transactions.
     */
    public function expirePoints(): int
    {
        $due = LoyaltyPointTransaction::due()->with('customer')->get();

        $expired = 0;
        foreach ($due as $tx) {
            $customer = $tx->customer;
            if (!$customer) continue;

            try {
            DB::transaction(function () use ($tx, $customer, &$expired) {
                // Mark original transaction as expired
                $tx->update(['expired_at' => now()]);

                // the lot lapses: what is left of it (not what it started with) goes, at the value it carries
                app(\App\Services\Books\PointLotService::class)->ensureLots($customer);
                $tx->refresh();
                $toRemove = min((int) ($tx->remaining ?? $tx->points), $customer->fresh()->loyalty_points);
                if ($toRemove <= 0) { $tx->update(['remaining' => 0]); return; }

                $this->writePointTransaction(
                    customer:      $customer,
                    points:        -$toRemove,
                    type:          'expiry',
                    pointType:     'permanent',
                    note:          "Points expired (original earn: {$tx->created_at->toDateString()})",
                    referenceType: LoyaltyPointTransaction::class,
                    referenceId:   $tx->id,
                    consumeLotId:  $tx->id,
                );
                $expired++;
            });
            } catch (\Throwable $e) {
                report($e);   // one lot that cannot be booked must not stop the rest
            }
        }

        return $expired;
    }

    // =========================================================================
    // PRIVATE WRITERS
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
        ?int      $consumeLotId  = null,
    ): LoyaltyPointTransaction {
        return DB::transaction(function () use (
            $customer, $points, $type, $pointType, $expiresAt,
            $note, $referenceType, $referenceId, $createdBy, $metadata, $consumeLotId
        ) {
            $customer = Customer::lockForUpdate()->find($customer->id);
            $lots = app(\App\Services\Books\PointLotService::class);
            $lots->ensureLots($customer);

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
            $lots->apply($customer, $tx, $consumeLotId);   // earns become lots; spends release exactly what their lots carry
            $this->bookPoints($tx->fresh(), $customer);

            return $tx->fresh();
        });
    }

    /**
     * Every points movement made here is booked, so the liability always follows the points:
     * grants and earnings accrue it, deductions and goods rewards release it, expiry turns it into breakage income.
     */
    private function bookPoints(LoyaltyPointTransaction $tx, Customer $customer): void
    {
        $mode = match (true) {
            $tx->type === 'expiry'     => 'expire',
            $tx->type === 'redemption' => 'release',   // a goods reward: the value leaves the liability
            $tx->points > 0            => 'accrue',
            default                    => 'release',
        };
        $label = ['admin_grant' => 'Points granted', 'admin_deduct' => 'Points deducted', 'expiry' => 'Points expired', 'redemption' => 'Points redeemed for a reward',
            'referral_bonus' => 'Referral bonus points', 'order_earn' => 'Points earned'][$tx->type] ?? 'Loyalty points';
        try {
            $voucher = app(\App\Services\Books\RewardService::class)->postPoints(abs($tx->points), $mode, "{$label} — {$this->customerLabel($customer)}", [
                'customer_id' => $customer->id, 'point_transaction_id' => $tx->id, 'points_type' => $tx->type,
            ], null, isset($tx->metadata['value']) ? (float) $tx->metadata['value'] : null);
        } catch (\App\Services\Books\BooksException $e) {
            throw \Illuminate\Validation\ValidationException::withMessages(['points' => $e->getMessage()]);
        }
        if ($voucher) {
            $tx->update(['metadata' => array_merge($tx->metadata ?? [], ['journal_voucher_id' => $voucher->id, 'journal_number' => $voucher->voucher_number])]);
        }
    }

    private function customerLabel(Customer $c): string
    {
        return trim((string) ($c->company_name ?: trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? '')))) ?: "customer #{$c->id}";
    }

    // LoyaltyService.php — new public method

}
