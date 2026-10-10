<?php

namespace App\Services\Payments;

use App\Services\Payments\Gateways\Dpo;
use App\Services\Payments\Gateways\Flutterwave;
use App\Services\Payments\Gateways\Gateway;
use App\Services\Payments\Gateways\Paystack;
use App\Services\Payments\Gateways\Pesapal;
use App\Services\Payments\Gateways\Stripe;

/** The card providers the shop can take payments through, and the fields every one of them shares on the settings screen. */
class Gateways
{
    public const ALL = [Stripe::class, Paystack::class, Flutterwave::class, Pesapal::class, Dpo::class];

    /** @var array<string, Gateway>|null */
    private static ?array $made = null;

    /** @return array<string, Gateway> keyed by provider key */
    public static function all(): array
    {
        if (self::$made === null) {
            self::$made = [];
            foreach (self::ALL as $class) {
                $g = app($class);
                self::$made[$g->key()] = $g;
            }
        }

        return self::$made;
    }

    public static function keys(): array
    {
        return array_keys(self::all());
    }

    public static function has(string $key): bool
    {
        return isset(self::all()[$key]);
    }

    public static function get(string $key): Gateway
    {
        return self::all()[$key] ?? throw new PaymentException("There is no \"{$key}\" payment provider.");
    }

    /** Swap in a stand-in (tests). */
    public static function fake(array $gateways): void
    {
        self::$made = $gateways;
    }

    public static function forget(): void
    {
        self::$made = null;
    }

    /** What every provider has beyond its own keys: switched on, what the customer reads, where the money is booked, and the currency charged. @return array<int, array<string, mixed>> */
    public static function commonFields(Gateway $g): array
    {
        return [
            ['key' => 'enabled', 'label' => 'Offer this at checkout', 'type' => 'toggle', 'hint' => 'When on (and the keys are saved), customers can choose it to pay.'],
            ['key' => 'label', 'label' => 'Name customers see', 'type' => 'text', 'hint' => 'For example "Card" or "Card (Stripe)".', 'default' => 'Card'],
            ['key' => 'ledger_id', 'label' => 'Money is booked into', 'type' => 'ledger', 'hint' => 'The bank or clearing account the provider pays you into. Every payment taken here is booked to it.'],
            ['key' => 'charge_currency', 'label' => 'Charge in (optional)', 'type' => 'text', 'hint' => 'A 3-letter currency such as USD or KES. Empty = the currency of the order. Orders in another currency are converted at today\'s rate.'],
        ];
    }

    /** @return array<string, mixed> */
    public static function commonRules(): array
    {
        return ['enabled' => 'sometimes|boolean', 'label' => 'sometimes|nullable|string|max:60', 'ledger_id' => 'sometimes|nullable|integer|min:1', 'charge_currency' => ['sometimes', 'nullable', 'regex:/^[A-Za-z]{3}$/']];
    }

    /** The defaults of a provider part: its fields blank (or their default), and the common ones. @return array<string, mixed> */
    public static function defaults(Gateway $g): array
    {
        $d = ['enabled' => false, 'label' => 'Card (' . $g->label() . ')', 'ledger_id' => '', 'charge_currency' => ''];
        foreach ($g->fields() as $f) {
            $d[$f['key']] = $f['type'] === 'toggle' ? false : ($f['default'] ?? '');
        }

        return $d;
    }
}
