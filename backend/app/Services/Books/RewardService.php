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
    /**
     * Money arrived from a customer: a Cash Sale (when it is made) or a Receipt (when it is posted). Points are earned on
     * what was actually paid — tax included — times the tier's multiplier. Paying with a gift voucher is not new money, and
     * neither is buying one, so those parts earn nothing. A Cash Sale also counts as an order; a Receipt only adds spend.
     */
    public function onMoneyReceived(Voucher $v): void
    {
        $v->loadMissing('type', 'customer');
        $base = $v->type->base_type;
        if (! $v->customer || ! in_array($base, [VoucherType::CASH_SALE, VoucherType::RECEIPT], true) || $v->status !== Voucher::POSTED) {
            return;
        }
        if (! empty($v->meta['rewarded_at'])) {
            return;
        }
        DB::transaction(function () use ($v, $base) {
            $v = Voucher::whereKey($v->id)->lockForUpdate()->first();
            if (! empty($v->meta['rewarded_at'])) {
                return;
            }
            $customer = Customer::lockForUpdate()->find($v->customer_id);
            $rate = (float) ($v->exchange_rate ?: 1);
            // not new money: gift vouchers sold on this sale, and the part paid with a gift voucher
            $giftSold = round((float) $v->items()->whereNotNull('gift_meta')->sum('amount') * $rate, 2);
            $giftPaid = round((float) DB::table('voucher_tenders')->where('voucher_id', $v->id)->whereNotNull('gift_voucher_id')->sum('amount') * $rate, 2);
            $paid = max(0.0, (float) $v->base_total - $giftSold - $giftPaid);
            $countOrder = $base === VoucherType::CASH_SALE;

            // a hamper can be set not to earn points: what was paid towards it earns none
            $hampers = app(HamperEditionService::class);
            $noPoints = $base === VoucherType::CASH_SALE
                ? $hampers->restrictedOn($v, 'earn_loyalty_points') * $rate
                : $this->receiptOnNoPointHampers($v, $hampers) * $rate;
            $points = $this->earnPoints($v, $customer, max(0.0, $paid - $noPoints));
            $this->recordStats($customer, $paid, $countOrder);
            $this->completeReferral($v, $customer);

            $v->update(['meta' => array_merge($v->meta ?? [], ['rewarded_at' => now()->toIso8601String(), 'points_earned' => $points, 'spend_counted' => $paid, 'order_counted' => $countOrder])]);
        });
    }

    /** The part of a receipt that settled invoices, spread by how much of each invoice is hampers that earn no points (voucher currency). */
    private function receiptOnNoPointHampers(Voucher $receipt, HamperEditionService $hampers): float
    {
        $sum = 0.0;
        foreach (DB::table('voucher_bill_refs')->where('voucher_id', $receipt->id)->where('ref_type', 'against')->get(['against_voucher_id', 'amount']) as $r) {
            $inv = Voucher::find($r->against_voucher_id);
            if ($inv && (float) $inv->total_amount > 0) {
                $sum += (float) $r->amount * min(1.0, $hampers->restrictedOn($inv, 'earn_loyalty_points') / (float) $inv->total_amount);
            }
        }

        return $sum;
    }

    /** An Invoice counts as an order when it is posted (it earns nothing itself: its receipts do). */
    public function onInvoiced(Voucher $v): void
    {
        $v->loadMissing('type');
        if ($v->type->base_type !== VoucherType::SALES || ! $v->customer_id || $v->status !== Voucher::POSTED || ! empty($v->meta['order_counted'])) {
            return;
        }
        $customer = Customer::find($v->customer_id);
        if (! $customer) {
            return;
        }
        $customer->increment('total_orders');
        $customer->refresh();
        $customer->update(['last_order_date' => now(), 'first_order_date' => $customer->first_order_date ?: now(),
            'average_order_value' => $customer->total_orders > 0 ? round($customer->total_spent / $customer->total_orders, 2) : 0]);
        $v->update(['meta' => array_merge($v->meta ?? [], ['order_counted' => true])]);
    }

    /** The voucher was cancelled (or is being edited): take back the points, the spend and the order it counted. */
    public function onCancel(Voucher $v): void
    {
        $v->loadMissing('type');
        if (! $v->customer_id || (empty($v->meta['rewarded_at']) && empty($v->meta['order_counted']))) {
            return;
        }
        DB::transaction(function () use ($v) {
            $customer = Customer::lockForUpdate()->find($v->customer_id);
            if (! $customer) {
                return;
            }
            $points = (int) ($v->meta['points_earned'] ?? 0);
            if ($points > 0) {
                $take = min($points, (int) $customer->loyalty_points);
                if ($take > 0) {
                    $value = $this->writePoints($customer, -$take, 'order_cancel', "Points reversed — {$v->voucher_number} cancelled", $v);
                    $this->accrue($v, -$take, $value);
                }
            }
            $customer->update([
                'total_orders' => max(0, (int) $customer->total_orders - (! empty($v->meta['order_counted']) ? 1 : 0)),
                'total_spent' => max(0, (float) $customer->total_spent - (float) ($v->meta['spend_counted'] ?? 0)),
            ]);
            $v->update(['meta' => array_merge($v->meta ?? [], ['rewarded_at' => null, 'points_earned' => 0, 'spend_counted' => 0, 'order_counted' => false])]);
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
        $value = $this->writePoints($customer, $points, 'order_earn', "Earned on {$sale->voucher_number}", $sale, $months ? 'expiring' : 'permanent', $months ? now()->addMonths((int) $months) : null);
        $this->accrue($sale, $points, $value);

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
    private function accrue(Voucher $sale, int $points, ?float $value = null): void
    {
        $this->postPoints(abs($points), $points >= 0 ? 'accrue' : 'release',
            ($points >= 0 ? 'Loyalty points earned on ' : 'Loyalty points reversed on ') . $sale->voucher_number, ['sale_voucher_id' => $sale->id], null, $value);
    }

    /**
     * Books the value of a number of points as a Journal. Points are not money; their value is a liability.
     *   accrue  → Dr Rewards & Referral Expense,  Cr Loyalty Points Liability   (points given)
     *   release → Dr Loyalty Points Liability,    Cr Rewards & Referral Expense (points taken back / a goods reward handed over)
     *   expire  → Dr Loyalty Points Liability,    Cr Loyalty Points Breakage Income (points that lapsed unused)
     * $value is what the lots carry (see PointLotService); without it the points are valued at today's point value.
     * Returns null when there is nothing to book (no value, or the books are not set up).
     */
    public function postPoints(int $points, string $mode, string $narration, array $meta = [], ?\App\Models\User $by = null, ?float $value = null): ?Voucher
    {
        $value = round($value ?? abs($points) * $this->pointValue(), 2);
        if ($value <= 0) {
            return null;
        }
        $s = AccountingSetting::current();
        $expense = $s->rewards_expense_ledger_id ?: Ledger::where('name', 'Rewards & Referral Expense')->value('id');
        $liability = $s->loyalty_liability_ledger_id ?: Ledger::where('name', 'Loyalty Points Liability')->value('id');
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $expense || ! $liability || ! $journal) {
            return null;   // books not fully set up — points still work, they just aren't booked
        }
        $other = $mode === 'expire' ? $this->breakageLedger() : (int) $expense;
        [$dr, $cr] = $mode === 'accrue' ? [(int) $expense, (int) $liability] : [(int) $liability, $other];

        return $this->vouchers->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id,
            'narration' => $narration, 'meta' => $meta + ['points' => $points, 'points_mode' => $mode],
            'entries' => [['ledger_id' => $dr, 'side' => 'D', 'amount' => $value], ['ledger_id' => $cr, 'side' => 'C', 'amount' => $value]],
        ], $by);
    }

    /**
     * One-off correction for points moved before every movement was booked: a single Journal that brings the
     * Loyalty Points Liability to points held × value per point, the other side being Rewards & Referral Expense.
     * Returns the Journal, or null when the books already agree.
     */
    public function trueUpLiability(?\App\Models\User $by = null): ?Voucher
    {
        $s = AccountingSetting::current();
        $expense = $s->rewards_expense_ledger_id ?: Ledger::where('name', 'Rewards & Referral Expense')->value('id');
        $liability = $s->loyalty_liability_ledger_id ?: Ledger::where('name', 'Loyalty Points Liability')->value('id');
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $expense || ! $liability || ! $journal) {
            throw new BooksException('The Loyalty Points Liability or Rewards & Referral Expense ledger is not set up (Books settings).');
        }
        $liab = app(PointLotService::class)->liability();
        $points = $liab['points'];
        $target = $liab['value'];
        $diff = round($target - (-app(LedgerService::class)->balance((int) $liability)), 2);   // + = liability must grow
        if (abs($diff) < 0.01) {
            return null;
        }
        $amt = abs($diff);
        $grow = $diff > 0;

        return $this->vouchers->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id,
            'narration' => "Loyalty points liability corrected to {$points} points", 'meta' => ['points_mode' => 'true_up', 'points' => $points],
            'entries' => [
                ['ledger_id' => $grow ? (int) $expense : (int) $liability, 'side' => 'D', 'amount' => $amt],
                ['ledger_id' => $grow ? (int) $liability : (int) $expense, 'side' => 'C', 'amount' => $amt],
            ],
        ], $by);
    }

    /** Income from points that lapse unused — created on first use. */
    private function breakageLedger(): int
    {
        $group = \App\Models\Books\LedgerGroup::where('name', 'Indirect Incomes')->first()
            ?? throw new BooksException('The Indirect Incomes group is missing, so expired points cannot be booked.');

        return (int) app(LedgerService::class)->ensure('Loyalty Points Breakage Income', $group->id, ['is_system' => true])->id;
    }

    /** Writes a points movement and applies it to the lots; returns its value in base currency (what the liability moves by). */
    public function writePoints(Customer $customer, int $points, string $type, string $note, ?Voucher $ref = null, string $pointType = 'permanent', $expiresAt = null): float
    {
        $customer = Customer::lockForUpdate()->find($customer->id);
        $lots = app(PointLotService::class);
        $lots->ensureLots($customer);
        $balance = max(0, (int) $customer->loyalty_points + $points);
        $tx = LoyaltyPointTransaction::create([
            'customer_id' => $customer->id, 'points' => $points, 'balance_after' => $balance, 'type' => $type, 'point_type' => $pointType,
            'expires_at' => $expiresAt, 'reference_type' => $ref ? Voucher::class : null, 'reference_id' => $ref?->id, 'note' => $note,
        ]);
        $customer->update(['loyalty_points' => $balance]);

        return $lots->apply($customer, $tx, null, $points < 0 ? $ref?->id : null);
    }

    // ── statistics, tier ─────────────────────────────────────────────────

    private function recordStats(Customer $customer, float $baseTotal, bool $countOrder = true): void
    {
        if ($countOrder) {
            $customer->increment('total_orders');
        }
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
            $bonus = (int) \App\Services\ReferralSettings::get()['referral_referrer_points'];
            if ($bonus > 0) {
                $value = $this->writePoints($referrer, $bonus, 'referral_bonus', "Referral bonus — {$sale->voucher_number}", $sale);
                $this->accrue($sale, $bonus, $value);
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
        // personal referral codes follow the programme settings; other codes may carry their own reward
        if (! $code || $code->type === 'customer_referral') {
            $s = \App\Services\ReferralSettings::get();

            return $s['referral_referrer_gift_amount'] > 0
                ? ['amount' => (float) $s['referral_referrer_gift_amount'], 'currency_id' => $s['referral_referrer_gift_currency_id'] ?: $this->money->getBaseCurrency()->id]
                : null;
        }
        if (in_array($code->referrer_reward_type, ['store_credit', 'gift_voucher', 'fixed_amount'], true) && (float) $code->referrer_reward_value > 0) {
            return ['amount' => (float) $code->referrer_reward_value, 'currency_id' => $code->currency_id ?: $this->money->getBaseCurrency()->id];
        }
        if ($code->referrer_reward_type === 'percentage' && (float) $code->referrer_reward_value > 0) {
            return ['amount' => round((float) $sale->total_amount * (float) $code->referrer_reward_value / 100, 2), 'currency_id' => $sale->currency_id];
        }

        return null;
    }

    private function expiry(): ?string
    {
        $months = LoyaltySetting::get('gift_voucher_expiry_months', null);

        return $months ? now()->addMonths((int) $months)->toDateString() : null;
    }

    // ── redemption: points → gift voucher ────────────────────────────────

    /** Trade points for a gift voucher. Returns the new gift voucher. */
    public function redeemForGiftVoucher(Customer $customer, array $rule, ?\App\Models\User $by = null): GiftVoucher
    {
        $required = (int) ($rule['points_required'] ?? 0);
        $value = (float) ($rule['value'] ?? $rule['value_kes'] ?? 0);
        $currencyId = $rule['currency_id'] ?? $this->money->getBaseCurrency()->id;

        return DB::transaction(function () use ($customer, $required, $value, $currencyId, $rule, $by) {
            $released = $this->writePoints($customer, -$required, 'redemption', 'Redeemed for: ' . ($rule['name'] ?? 'gift voucher'));
            // the points were already accrued as a liability — release it into the gift voucher liability
            $gv = $this->gifts->issue([
                'amount' => $value, 'currency_id' => $currencyId, 'customer_id' => $customer->id, 'source' => 'loyalty',
                'note' => 'Points redemption: ' . ($rule['name'] ?? ''), 'expires_at' => $this->expiry(),
            ], $by);
            // the voucher took its full value from the liability, but only what those points were accrued at should leave it
            $voucherBase = round($this->money->convert($value, $this->money->currencyFrom($currencyId), $this->money->getBaseCurrency()), 2);
            $diff = round($voucherBase - $released, 2);
            if (abs($diff) >= 0.01) {
                $this->postPoints(0, $diff > 0 ? 'accrue' : 'release', "Points redemption difference — {$gv->code}", ['gift_voucher_id' => $gv->id], $by, abs($diff));
            }

            return $gv;
        });
    }
}
