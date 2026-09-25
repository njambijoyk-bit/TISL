<?php

namespace App\Services;

use App\Models\Currency;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

/**
 * Central place every model/controller goes through to resolve "what
 * currency is this priced in" and "what does that amount look like in
 * another currency" — wraps Currency::convertTo() rather than
 * reimplementing the conversion math.
 *
 * Registered as a scoped binding (AppServiceProvider), so one instance
 * lives per request: currencies are loaded once and the display currency
 * chosen by SetDisplayCurrency middleware is visible to every model.
 */
class CurrencyConversionService
{
    private const BASE_CURRENCY_CACHE_KEY = 'currency:base';
    private const BASE_CURRENCY_CACHE_TTL = 3600; // seconds

    /** @var Collection<int, Currency>|null keyed by id */
    private ?Collection $currencies = null;

    private ?Currency $displayCurrency = null;

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
        $this->currencies = null;
    }

    /** All currencies, loaded once per request. */
    public function all(): Collection
    {
        return $this->currencies ??= Currency::all()->keyBy('id');
    }

    public function findByCode(?string $code): ?Currency
    {
        if ($code === null || $code === '') {
            return null;
        }

        $code = strtoupper($code);

        return $this->all()->first(fn (Currency $c) => $c->code === $code && $c->is_active);
    }

    /** Set by SetDisplayCurrency middleware from ?currency= / X-Currency. */
    public function setDisplayCurrency(?Currency $currency): void
    {
        $this->displayCurrency = $currency;
    }

    /** What the client asked to see prices in, falling back to base. */
    public function getDisplayCurrency(): Currency
    {
        return $this->displayCurrency ?? $this->getBaseCurrency();
    }

    /** A listing's own currency, or the base currency when it has none set. */
    public function resolveCurrency(?int $currencyId): Currency
    {
        if ($currencyId === null) {
            return $this->getBaseCurrency();
        }

        return $this->all()->get($currencyId) ?? $this->getBaseCurrency();
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
     * the target to the request's display currency (itself defaulting to base).
     */
    public function convertForDisplay(float $amount, ?int $nativeCurrencyId, ?int $targetCurrencyId = null): array
    {
        $native = $this->resolveCurrency($nativeCurrencyId);
        $target = $targetCurrencyId !== null
            ? $this->resolveCurrency($targetCurrencyId)
            : $this->getDisplayCurrency();

        $converted = $this->convert($amount, $native, $target);

        return [
            'amount'    => $converted,
            'currency'  => $target->code,
            'formatted' => $target->formatAmount($converted),
        ];
    }
}