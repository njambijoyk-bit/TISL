<?php

namespace App\Services\Books;

use App\Models\Currency;
use App\Models\Customer;
use App\Models\CustomerTypeDiscount;
use App\Services\PromoCodeService;

/**
 * The discounts a customer can get on a sale, worked out in one place for the admin sales voucher and for checkout.
 *
 * The rows, in the order they are worked out:
 *   personal / tier / customer_type — a % of the goods, added together and capped at 30% in all;
 *   referral                        — the referral programme's discount on a referred customer's first order;
 *   promo:CODE                      — a promo code the customer holds, or a public one (one per sale), on what is left after the above.
 * Each chosen row is taken off BEFORE tax: the caller spreads the total over the lines (see spread()), so every
 * line's taxable amount is reduced and the VAT follows.
 */
class DiscountService
{
    public const CAP_PERCENT = 30;

    public function __construct(private PromoCodeService $promos) {}

    /**
     * Every discount that could apply, each with the amount it would give, and which ones are chosen.
     *
     * @param  float  $goods   what the discounts are taken from (the eligible lines, before these discounts)
     * @param  ?array $chosen  keys chosen (personal, tier, customer_type, referral, promo:CODE); null = every automatic one
     * @param  ?string $promoCode  a promo code typed in (checkout): offered even if the customer does not "hold" it
     * @return array<int, array{key:string, kind:string, label:string, percent:?float, amount:float, chosen:bool, auto:bool, ref:?string, promo_id:?int, referral_id:?int, error:?string}>
     */
    public function evaluate(?Customer $customer, float $goods, Currency $currency, ?array $chosen = null, ?string $promoCode = null): array
    {
        if (! $customer || $goods <= 0) {
            return [];
        }
        $rows = [];
        $pick = fn (string $key, bool $auto) => $chosen === null ? $auto : in_array($key, $chosen, true);

        // ── % discounts: personal, tier, customer type — additive, capped
        $type = CustomerTypeDiscount::where('slug', $customer->customer_type)->where('is_active', true)->first();
        $percents = [
            ['personal', 'Personal discount', (float) $customer->discount_percentage, null],
            ['tier', 'Tier' . ($customer->tier ? ' ' . ucfirst((string) $customer->tier) : ''), (float) ($customer->tier_benefits['discount'] ?? 0), $customer->tier],
            ['customer_type', 'Customer type' . ($customer->customer_type ? ' ' . ucfirst(str_replace('_', ' ', (string) $customer->customer_type)) : ''), $type ? (float) $type->discount_percentage : 0.0, $customer->customer_type],
        ];
        $used = 0.0;
        foreach ($percents as [$key, $label, $pct, $ref]) {
            if ($pct <= 0) {
                continue;
            }
            $chosenNow = $pick($key, true);
            $room = max(0.0, self::CAP_PERCENT - $used);
            $eff = min($pct, $room);
            $rows[] = $this->row($key, $key, $label . " {$this->pct($pct)}" . ($eff < $pct ? ' (capped at ' . self::CAP_PERCENT . '% together)' : ''), $pct, round($goods * $eff / 100, 2), $chosenNow, true, $ref);
            if ($chosenNow) {
                $used += $eff;
            }
        }
        $net = round($goods - array_sum(array_map(fn ($r) => $r['chosen'] ? $r['amount'] : 0, $rows)), 2);

        // ── referral
        $referralTaken = 0.0;
        $rc = $customer->hasReferralDiscount() ? $customer->referralCode : null;
        if ($rc && $rc->is_valid) {
            $amount = $rc->type === 'customer_referral'
                ? $this->promos->referralDiscount($net, $currency)
                : min($net, $this->promos->discountFor($rc, $net, $currency));
            $on = $pick('referral', true);
            $row = $this->row('referral', 'referral', 'Referral discount (' . $rc->code . ')', null, round($amount, 2), $on, true, $rc->code);
            $row['referral_id'] = $rc->id;
            $row['detail'] = $this->promos->describe($rc);
            $rows[] = $row;
            if ($on) {
                $referralTaken = round($amount, 2);
                $net = round($net - $referralTaken, 2);
            }
        }

        // ── promo codes: the ones the customer holds (plus one typed in); only one can be used on a sale
        $codes = [];
        foreach ($this->promos->getCustomerPromoCodes($customer)['active_codes'] as $c) {
            $codes[strtoupper($c->code)] = true;
        }
        foreach ($this->promos->getPublicPromoCodes() as $c) {   // public codes are open to every customer
            $codes[strtoupper($c->code)] = true;
        }
        foreach (array_filter([$promoCode]) as $typed) {
            $codes[strtoupper(trim($typed))] = true;
        }
        foreach ($chosen ?? [] as $k) {
            if (str_starts_with($k, 'promo:')) {
                $codes[strtoupper(substr($k, 6))] = true;
            }
        }
        $promoOn = false;
        foreach (array_keys($codes) as $code) {
            $key = 'promo:' . $code;
            $on = $chosen === null ? (bool) ($promoCode && strcasecmp($promoCode, $code) === 0) : in_array($key, $chosen, true);
            $res = $this->promos->validateForCheckout($code, $customer, $net, $currency, $referralTaken);
            if (! ($res['valid'] ?? false)) {
                if ($on) {   // asked for, but it cannot be used: say so
                    $bad = $this->row($key, 'promo', 'Promo ' . $code, null, 0.0, false, false, $code);
                    $bad['error'] = $res['message'] ?? 'This code cannot be used.';
                    $rows[] = $bad;
                }
                continue;
            }
            $amount = round(min($net, (float) $res['discount']), 2);
            if ($amount <= 0) {
                continue;
            }
            $take = $on && ! $promoOn;
            $row = $this->row($key, 'promo', 'Promo ' . $res['code']->code, null, $amount, $take, false, $res['code']->code);
            $row['promo_id'] = $res['code']->id;
            $row['detail'] = $this->promos->describe($res['code']);
            if ($on && $promoOn) {
                $row['error'] = 'Only one promo code can be used on a sale.';
            }
            $rows[] = $row;
            $promoOn = $promoOn || $take;
        }

        return $rows;
    }

    /**
     * Spread the chosen discounts over the lines in proportion to each line's amount, so every line's taxable base
     * falls before tax is worked out. Returns, per line index, the parts that make up its discount.
     *
     * @param  array<int, float>  $lineAmounts  eligible line index => its amount before these discounts (0 = not eligible)
     * @param  array  $rows  from evaluate()
     * @return array{perLine: array<int, array<int, array{amount: float, source: string, ref: ?string}>>, discounts: array<int, array{source: string, ref: ?string, amount: float}>}
     */
    public function spread(array $lineAmounts, array $rows): array
    {
        $perLine = [];
        $discounts = [];
        $keys = array_keys(array_filter($lineAmounts, fn ($g) => $g > 0));
        $sum = array_sum(array_intersect_key($lineAmounts, array_flip($keys))) ?: 1.0;
        foreach ($rows as $r) {
            if (! $r['chosen'] || $r['amount'] <= 0 || ! $keys) {
                continue;
            }
            $given = 0.0;
            foreach ($keys as $n => $k) {
                $part = $n === count($keys) - 1 ? round($r['amount'] - $given, 2) : round($r['amount'] * $lineAmounts[$k] / $sum, 2);
                $given += $part;
                $perLine[$k][] = ['amount' => $part, 'source' => $r['kind'] === 'personal' ? 'customer_type' : $r['kind'], 'ref' => $r['ref']];
            }
            $discounts[] = ['source' => $r['kind'] === 'personal' ? 'customer_type' : $r['kind'], 'ref' => $r['ref'], 'amount' => $r['amount']];
        }

        return compact('perLine', 'discounts');
    }

    private function row(string $key, string $kind, string $label, ?float $percent, float $amount, bool $chosen, bool $auto, ?string $ref): array
    {
        return ['key' => $key, 'kind' => $kind, 'label' => $label, 'percent' => $percent, 'amount' => $amount, 'chosen' => $chosen, 'auto' => $auto, 'ref' => $ref, 'promo_id' => null, 'referral_id' => null, 'error' => null, 'detail' => null];
    }

    private function pct(float $p): string
    {
        return rtrim(rtrim(number_format($p, 2), '0'), '.') . '%';
    }
}
