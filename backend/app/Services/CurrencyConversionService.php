<?php

namespace App\Services;

use App\Models\Currency;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

/**
 * Central place every model/controller goes through to resolve "what
 * currency is this priced in" and "what does that amount look like in
 * another currency" — wraps Currency::convertTo() rather than
 * reimplementing the conversion math.
 */
class CurrencyConversionService
{
    private const BASE_CURRENCY_CACHE_KEY = 'currency:base';
    private const BASE_CURRENCY_CACHE_TTL = 3600; // seconds

    /**
     * The admin-set display/base currency. Cached since this gets hit on
     * nearly every listing read — call forgetBaseCurrencyCache() anywhere
     * is_base changes (Currency::setBaseCurrency / recalcRatesForBase).
     */
    public function getBaseCurrency(): Currency
    {
        return Cache::remember(self::BASE_CURRENCY_CACHE_KEY, self::BASE_CURRENCY_CACHE_TTL, function () {
            $base = Currency::getBaseCurrency();

            if ($base === null) {
                throw new RuntimeException('No base currency is configured.');
            }

            return $base;
        });
    }

    public function forgetBaseCurrencyCache(): void
    {
        Cache::forget(self::BASE_CURRENCY_CACHE_KEY);
    }

    /** A listing's own currency, or the base currency when it has none set. */
    public function resolveCurrency(?int $currencyId): Currency
    {
        if ($currencyId === null) {
            return $this->getBaseCurrency();
        }

        return Currency::find($currencyId) ?? $this->getBaseCurrency();
    }

    public function convert(float $amount, Currency $from, Currency $to): float
    {
        if ($from->id === $to->id) {
            return round($amount, 2);
        }

        return round($from->convertTo($to, $amount), 2);
    }

    /**
     * Convert a native amount into a target currency for display — defaults
     * the target to the current base currency when none is given (the
     * "no toggle selected yet" case).
     */
    public function convertForDisplay(float $amount, ?int $nativeCurrencyId, ?int $targetCurrencyId = null): array
    {
        $native = $this->resolveCurrency($nativeCurrencyId);
        $target = $targetCurrencyId !== null
            ? $this->resolveCurrency($targetCurrencyId)
            : $this->getBaseCurrency();

        $converted = $this->convert($amount, $native, $target);

        return [
            'amount'    => $converted,
            'currency'  => $target->code,
            'formatted' => $target->formatAmount($converted),
        ];
    }
}
