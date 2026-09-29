<?php

namespace App\Services;

use App\Models\LoyaltySetting;

/**
 * The referral programme, as set by an admin: what the referred customer gets off their
 * first order and what the referrer earns. Nothing here is hard-coded in the checkout.
 */
class ReferralSettings
{
    public const KEYS = [
        'referral_discount_type', 'referral_discount_value', 'referral_discount_currency_id', 'referral_discount_max', 'referral_min_order',
        'referral_referrer_points', 'referral_referrer_gift_amount', 'referral_referrer_gift_currency_id',
    ];

    public static function get(): array
    {
        $g = fn (string $k, $d = null) => LoyaltySetting::get($k, $d);

        return [
            'referral_discount_type' => $g('referral_discount_type', 'percentage'),               // percentage | fixed_amount
            'referral_discount_value' => (float) $g('referral_discount_value', 5),
            'referral_discount_currency_id' => $g('referral_discount_currency_id'),               // for a fixed amount; null = base
            'referral_discount_max' => $g('referral_discount_max'),                               // cap on the discount, same currency; null = none
            'referral_min_order' => $g('referral_min_order'),                                     // minimum first order, same currency
            'referral_referrer_points' => (int) $g('referral_referrer_points', (int) $g('referral_bonus_points', 0)),
            'referral_referrer_gift_amount' => (float) $g('referral_referrer_gift_amount', 0),    // optional gift voucher on top of the points
            'referral_referrer_gift_currency_id' => $g('referral_referrer_gift_currency_id'),
        ];
    }

    public static function save(array $data, ?int $userId = null): array
    {
        foreach (self::KEYS as $k) {
            if (array_key_exists($k, $data)) {
                LoyaltySetting::set($k, $data[$k] === '' ? null : $data[$k], $userId);
            }
        }

        return self::get();
    }
}
