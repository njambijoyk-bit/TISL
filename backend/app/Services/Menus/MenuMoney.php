<?php

namespace App\Services\Menus;

use App\Models\Currency;
use App\Services\CurrencyConversionService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

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

        return ['currency_id' => $currency->id] + ((int) $currency->id === (int) $this->money->getBaseCurrency()->id ? [] : ['exchange_rate' => $this->rate($on)]);
    }

    /** A function turning base amounts into the Menus currency for a date, or null when the Menus currency is the base. */
    public function converter($date = null): ?callable
    {
        return $this->currency()->is_base ? null : fn (float $amount) => $this->fromBase($amount, $date);
    }

    // ── orders and dishes in their own currencies (script 213) ───────────

    /** Has script 213 been run? Until it has, orders are written in the base currency and a dish has no currency of its own. */
    public static function dishCurrencies(): bool
    {
        return Schema::hasColumn('menus_dishes', 'currency_id') && Schema::hasColumn('menus_order_lines', 'native_price');
    }

    /** The currency an order is written in: the Menus currency (else the base) once script 213 has been run, else the base currency. */
    public function orderCurrency(): Currency
    {
        return self::dishCurrencies() ? $this->currency() : $this->money->getBaseCurrency();
    }

    /** What an order's voucher carries for its currency: the currency and, when it is not the base, the rate it is converted at, so the books use exactly that one. */
    public function orderVoucher($date = null): array
    {
        $currency = $this->orderCurrency();

        $base = (int) $currency->id === (int) $this->money->getBaseCurrency()->id;

        return ['currency_id' => $currency->id] + ($base ? [] : ['exchange_rate' => $this->money->rateOn($currency, $date ?? today())]);
    }

    /** The currency a dish is priced in, when it is not the order's: null for a dish in the order's currency. */
    public function dishCurrencyId(\App\Models\Menus\Dish $dish): ?int
    {
        if (! self::dishCurrencies() || ! $dish->currency_id) {
            return null;
        }

        return (int) $dish->currency_id === (int) $this->orderCurrency()->id ? null : (int) $dish->currency_id;
    }

    /** What one unit of a currency is worth in the order's currency on a date (1 for the order's own currency or none). */
    public function rateToOrder(?int $fromId, $date = null): float
    {
        $to = $this->orderCurrency();
        if (! $fromId || $fromId === (int) $to->id) {
            return 1.0;
        }
        $toRate = $this->money->rateOn($to, $date ?? today());

        return $toRate > 0 ? $this->money->rateOn($fromId, $date ?? today()) / $toRate : 1.0;
    }

    /** An amount in another currency as the order's, rounded to two decimals as it is converted (never rounded again, so the total is the sum of the lines). */
    public function toOrder(float $amount, ?int $fromId, $date = null): float
    {
        return round($amount * $this->rateToOrder($fromId, $date), 2);
    }

    /** A dish's price in the base currency, for its margin: what it costs to make is held in the base currency. */
    public function priceInBase(float $price, ?\App\Models\Menus\Dish $dish): float
    {
        if (! $dish || ! self::dishCurrencies()) {
            return $price;
        }
        $from = $dish->currency_id ? (int) $dish->currency_id : (int) $this->currency()->id;

        return round($price * $this->money->rateOn($from, today()), 4);
    }

    /** The currencies a priced order was converted from, with the rate of the day, for the customer to see. @param array<int, array<string, mixed>> $lines @return array<int, array{code: string, symbol: ?string, rate: float, to: string}> */
    public function notes(array $lines): array
    {
        $to = $this->orderCurrency();
        $out = [];
        foreach ($lines as $l) {
            $id = (int) ($l['native']['currency_id'] ?? 0);
            if ($id && ! isset($out[$id]) && ($c = Currency::find($id))) {
                $out[$id] = ['code' => $c->code, 'symbol' => $c->symbol, 'rate' => round((float) $l['native']['rate'], 6), 'to' => $to->code];
            }
        }

        return array_values($out);
    }
}
