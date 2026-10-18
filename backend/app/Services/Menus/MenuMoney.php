<?php

namespace App\Services\Menus;

use App\Models\Currency;
use App\Services\CurrencyConversionService;
use Carbon\Carbon;

/**
 * The currency the kitchen's own vouchers are written in (Menus, Configuration): the one chosen there, else the system's base currency. What the kitchen holds is costed in the base
 * currency (a lot's cost is what the books made of the purchase), so a kitchen journal is written in the Menus currency by converting that cost at the rate of its date; the books convert
 * it back at the same rate. With no Menus currency, or the base currency chosen, nothing is converted.
 */
class MenuMoney
{
    public function __construct(private CurrencyConversionService $money)
    {
    }

    /** The Menus currency: the chosen one while it is active, else the base currency. */
    public function currency(): Currency
    {
        $id = (int) (MenusSettings::all()['currency_id'] ?? 0);
        $chosen = $id ? Currency::find($id) : null;

        return $chosen && $chosen->is_active ? $chosen : $this->money->getBaseCurrency();
    }

    /** 1 unit of the Menus currency in the base currency on a date. */
    public function rate($date = null): float
    {
        return $this->money->rateOn($this->currency(), $date ?? today());
    }

    /** A base-currency amount as the Menus currency's, at the rate of the date. */
    public function fromBase(float $amount, $date = null): float
    {
        $rate = $this->rate($date);

        return round($rate > 0 ? $amount / $rate : $amount, 2);
    }

    /** What a kitchen voucher carries for its currency: the currency and, when it is not the base, the rate it is converted at (so the books use exactly that one). */
    public function voucher($date = null): array
    {
        $currency = $this->currency();
        $on = $date instanceof Carbon ? $date : Carbon::parse($date ?? today());

        return ['currency_id' => $currency->id] + ($currency->is_base ? [] : ['exchange_rate' => $this->rate($on)]);
    }

    /** A function turning base amounts into the Menus currency for a date, or null when the Menus currency is the base. */
    public function converter($date = null): ?callable
    {
        return $this->currency()->is_base ? null : fn (float $amount) => $this->fromBase($amount, $date);
    }
}
