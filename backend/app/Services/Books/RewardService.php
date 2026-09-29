<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\GiftVoucher;
use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\LoyaltySetting;
use App\Models\ReferralCode;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;

/**
 * What a real sale earns: customer statistics and tier, loyalty points (accrued in the books
 * as a liability), the referrer's reward (as a gift voucher or points), promo-code counters.
 * Runs once per sale (idempotent) and is undone when the sale is cancelled.
 */
class RewardService
{
    public function __construct(private CurrencyConversionService $money, private GiftVoucherService $gifts, private VoucherService $vouchers, private LedgerService $ledgers) {}

    /** A sale becomes "real" when cash is taken (cash sale) or the invoice is fully paid. */
    public function onSale(Voucher $sale): void
    {
        $sale->loadMissing('type', 'customer');
        $base = $sale->type->base_type;
        if (! $sale->customer || ! in_array($base, [VoucherType::CASH_SALE, VoucherType::SALES], true) || $sale->status !== Voucher::POSTED) {
            return;
        }
        if ($base === VoucherType::SALES && $this->vouchers->outstanding($sale) > 0.005) {
            return;   // rewarded when the last receipt lands
        }
        if (! empty($sale->meta['rewarded_at'])) {
            return;
        }
        DB::transaction(function () use ($sale) {
            $sale = Voucher::whereKey($sale->id)->lockForUpdate()->first();
            if (! empty($sale->meta['rewarded_at'])) {
                return;
            }
            $customer = Customer::lockForUpdate()->find($sale->customer_id);
            $baseTotal = (float) $sale->base_total;

            $points = $this->earnPoints($sale, $customer, $baseTotal);
            $this->recordStats($customer, $baseTotal);
            $this->completeReferral($sale, $customer);
            $this->recordPromo($sale);

            $sale->update(['meta' => array_merge($sale->meta ?? [], ['rewarded_at' => now()->toIso8601String(), 'points_earned' => $points])]);
        });
    }

    /** The sale was cancelled: take back what it earned. */
    public function onCancel(Voucher $sale): void
    {
        $sale->loadMissing('type');
        if (empty($sale->meta['rewarded_at']) || ! $sale->customer_id) {
            return;
        }
        DB::transaction(function () use ($sale) {
            $customer = Customer::lockForUpdate()->find($sale->customer_id);
            if (! $customer) {
                return;
            }
            $points = (int) ($sale->meta['points_earned'] ?? 0);
            if ($points > 0) {
                $take = min($points, (int) $customer->loyalty_points);
                if ($take > 0) {
                    $this->writePoints($customer, -$take, 'order_cancel', "Points reversed — {$sale->voucher_number} cancelled", $sale);
                    $this->accrue($sale, -$take);
                }
            }
            $customer->update([
                'total_orders' => max(0, (int) $customer->total_orders - 1),
                'total_spent' => max(0, (float) $customer->total_spent - (float) $sale->base_total),
            ]);
            $sale->update(['meta' => array_merge($sale->meta ?? [], ['rewarded_at' => null, 'points_earned' => 0])]);
        });
    }

    // ── points ───────────────────────────────────────────────────────────

    private function earnPoints(Voucher $sale, Customer $customer, float $baseTotal): int
    {
        if ($baseTotal <= 0) {
            return 0;
        }
        $rate = (int) LoyaltySetting::get('points_per_100_kes', 1);   // points per 100 units of the base currency
        $raw = (int) floor($baseTotal / 100) * $rate;
        if ($raw <= 0) {
            return 0;
        }
        $multiplier = (float) ($customer->tier_benefits['loyalty_points_multiplier'] ?? 1.0);
        $points = (int) round($raw * $multiplier);
        $months = LoyaltySetting::get('points_expiry_months', null);
        $this->writePoints($customer, $points, 'order_earn', "Earned on {$sale->voucher_number}", $sale, $months ? 'expiring' : 'permanent', $months ? now()->addMonths((int) $months) : null);
        $this->accrue($sale, $points);

        return $points;
    }

    /** Value of one point in base currency: the setting, else the best redemption rule. */
    public function pointValue(): float
    {
        $explicit = (float) LoyaltySetting::get('point_value', 0);
        if ($explicit > 0) {
            return $explicit;
        }
        $best = 0.0;
        foreach ((array) LoyaltySetting::get('redemption_rules', []) as $r) {
            if (empty($r['active']) || ($r['type'] ?? 'cashback') === 'gift' || (int) ($r['points_required'] ?? 0) <= 0) {
                continue;
            }
            $value = (float) ($r['value'] ?? $r['value_kes'] ?? 0);
            $inBase = $this->money->convert($value, $this->money->currencyFrom($r['currency_id'] ?? null), $this->money->getBaseCurrency());
            $perPoint = $inBase / (int) $r['points_required'];
            $best = $best > 0 ? min($best, $perPoint) : $perPoint;
        }

        return $best;
    }

    /** Points are a liability at their value: Dr Rewards expense, Cr Loyalty Points Liability (reversed when negative). */
    private function accrue(Voucher $sale, int $points): void
    {
        $value = round(abs($points) * $this->pointValue(), 2);
        if ($value <= 0) {
            return;
        }
        $s = AccountingSetting::current();
        $expense = $s->rewards_expense_ledger_id ?: Ledger::where('name', 'Rewards & Referral Expense')->value('id');
        $liability = $s->loyalty_liability_ledger_id ?: Ledger::where('name', 'Loyalty Points Liability')->value('id');
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $expense || ! $liability || ! $journal) {
            return;   // books not fully set up — points still work, they just aren't accrued
        }
        $this->vouchers->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id,
            'narration' => ($points >= 0 ? 'Loyalty points earned on ' : 'Loyalty points reversed on ') . $sale->voucher_number, 'meta' => ['sale_voucher_id' => $sale->id],
            'entries' => [
                ['ledger_id' => $points >= 0 ? $expense : $liability, 'side' => 'D', 'amount' => $value],
                ['ledger_id' => $points >= 0 ? $liability : $expense, 'side' => 'C', 'amount' => $value],
            ],
        ], null);
    }

    public function writePoints(Customer $customer, int $points, string $type, string $note, ?Voucher $ref = null, string $pointType = 'permanent', $expiresAt = null): void
    {
        $customer = Customer::lockForUpdate()->find($customer->id);
        $balance = max(0, (int) $customer->loyalty_points + $points);
        LoyaltyPointTransaction::create([
            'customer_id' => $customer->id, 'points' => $points, 'balance_after' => $balance, 'type' => $type, 'point_type' => $pointType,
            'expires_at' => $expiresAt, 'reference_type' => $ref ? Voucher::class : null, 'reference_id' => $ref?->id, 'note' => $note,
        ]);
        $customer->update(['loyalty_points' => $balance]);
    }

    // ── statistics, tier ─────────────────────────────────────────────────

    private function recordStats(Customer $customer, float $baseTotal): void
    {
        $customer->increment('total_orders');
        $customer->increment('total_spent', $baseTotal);
        $customer->refresh();
        if (! $customer->first_order_date) {
            $customer->update(['first_order_date' => now()]);
        }
        $customer->update([
            'last_order_date' => now(),
            'average_order_value' => $customer->total_orders > 0 ? round($customer->total_spent / $customer->total_orders, 2) : 0,
        ]);
        try {
            $customer->checkTierUpgrade();
            $customer->triggerLoyaltyPromoIfEligible();
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ── referral and promo ───────────────────────────────────────────────

    private function completeReferral(Voucher $sale, Customer $customer): void
    {
        if (! $customer->referred_by_customer_id || $customer->referral_completed_at) {
            return;
        }
        $referrer = Customer::find($customer->referred_by_customer_id);
        if ($referrer) {
            $code = $customer->referred_by_code_id ? ReferralCode::find($customer->referred_by_code_id) : null;
            $reward = $this->referrerReward($code, $sale);
            if ($reward) {
                $this->gifts->issue([
                    'amount' => $reward['amount'], 'currency_id' => $reward['currency_id'], 'customer_id' => $referrer->id, 'source' => 'referral',
                    'note' => "Referral reward — {$sale->voucher_number}", 'expires_at' => $this->expiry(),
                ], null);
            }
            $bonus = (int) LoyaltySetting::get('referral_bonus_points', 0);
            if ($bonus > 0) {
                $this->writePoints($referrer, $bonus, 'referral_bonus', "Referral bonus — {$sale->voucher_number}", $sale);
                $this->accrue($sale, $bonus);
            }
        }
        $customer->update(['referral_completed_at' => now()]);
        try {
            DB::table('referral_code_usage')->where('customer_id', $customer->id)->where('status', 'pending')
                ->update(['status' => 'completed', 'completed_at' => now(), 'updated_at' => now()]);
        } catch (\Throwable) {
            // usage table shape differs — the reward is already given
        }
    }

    /** @return array{amount: float, currency_id: ?int}|null */
    private function referrerReward(?ReferralCode $code, Voucher $sale): ?array
    {
        if ($code && in_array($code->referrer_reward_type, ['store_credit', 'gift_voucher', 'fixed_amount'], true) && (float) $code->referrer_reward_value > 0) {
            return ['amount' => (float) $code->referrer_reward_value, 'currency_id' => $code->currency_id ?: $this->money->getBaseCurrency()->id];
        }
        if ($code && $code->referrer_reward_type === 'percentage' && (float) $code->referrer_reward_value > 0) {
            return ['amount' => round((float) $sale->total_amount * (float) $code->referrer_reward_value / 100, 2), 'currency_id' => $sale->currency_id];
        }
        if (! $code) {
            $amount = (float) LoyaltySetting::get('referral_credit_amount', 0);

            return $amount > 0 ? ['amount' => $amount, 'currency_id' => $this->money->getBaseCurrency()->id] : null;
        }

        return null;
    }

    private function expiry(): ?string
    {
        $months = LoyaltySetting::get('gift_voucher_expiry_months', null);

        return $months ? now()->addMonths((int) $months)->toDateString() : null;
    }

    private function recordPromo(Voucher $sale): void
    {
        $id = $sale->meta['promo_code_id'] ?? null;
        if ($id && ($code = ReferralCode::find($id))) {
            $discount = collect($sale->meta['discounts'] ?? [])->where('source', 'promo')->sum('amount');
            $code->recordSuccess((float) $discount, (float) $sale->subtotal, (float) $sale->exchange_rate);
        }
    }

    // ── redemption: points → gift voucher ────────────────────────────────

    /** Trade points for a gift voucher. Returns the new gift voucher. */
    public function redeemForGiftVoucher(Customer $customer, array $rule, ?\App\Models\User $by = null): GiftVoucher
    {
        $required = (int) ($rule['points_required'] ?? 0);
        $value = (float) ($rule['value'] ?? $rule['value_kes'] ?? 0);
        $currencyId = $rule['currency_id'] ?? $this->money->getBaseCurrency()->id;

        return DB::transaction(function () use ($customer, $required, $value, $currencyId, $rule, $by) {
            $this->writePoints($customer, -$required, 'redemption', 'Redeemed for: ' . ($rule['name'] ?? 'gift voucher'));
            // the points were already accrued as a liability — release it into the gift voucher liability
            return $this->gifts->issue([
                'amount' => $value, 'currency_id' => $currencyId, 'customer_id' => $customer->id, 'source' => 'loyalty',
                'note' => 'Points redemption: ' . ($rule['name'] ?? ''), 'expires_at' => $this->expiry(),
            ], $by);
        });
    }
}
