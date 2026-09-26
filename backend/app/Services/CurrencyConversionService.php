<?php

namespace App\Services;

use App\Models\Currency;
use App\Models\Logs\CurrencyActivityLog;
use App\Support\Money\ConversionSnapshot;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Throwable;
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

    // ========================================
    // SNAPSHOT CONVERSIONS (anything that gets saved)
    // ========================================

    /** A Currency, an id, or null (= base). Inactive currencies still resolve: old records must convert. */
    public function currencyFrom(Currency|int|null $currency): Currency
    {
        if ($currency instanceof Currency) {
            return $currency;
        }
        if ($currency === null) {
            return $this->getBaseCurrency();
        }

        return $this->all()->get($currency)
            ?? Currency::find($currency)
            ?? throw new RuntimeException("Currency #{$currency} not found.");
    }

    /**
     * Convert an amount and freeze the rates used, for anything that will be
     * stored: order totals, wallet movements, loyalty earnings, promo
     * discounts. Keep the snapshot with the record so it can be reversed at
     * the same rate later (ConversionSnapshot::reverse()).
     *
     * Display-only conversions (price labels) should keep using
     * convertForDisplay() — no snapshot needed there.
     */
    public function snapshot(float $amount, Currency|int|null $from, Currency|int|null $to): ConversionSnapshot
    {
        $from = $this->currencyFrom($from);
        $to   = $this->currencyFrom($to);
        $base = $this->getBaseCurrency();

        $fromRate = (float) $from->conversion_rate; // 1 unit of $from in base
        $toRate   = (float) $to->conversion_rate;

        if ($fromRate <= 0 || $toRate <= 0) {
            throw new RuntimeException("Missing exchange rate for {$from->code} or {$to->code}.");
        }

        $rate = $from->id === $to->id ? 1.0 : $fromRate / $toRate;

        return new ConversionSnapshot(
            amountFrom:         round($amount, 2),
            fromCurrencyId:     $from->id,
            fromCurrencyCode:   $from->code,
            amountTo:           $from->id === $to->id ? round($amount, 2) : round($amount * $rate, 2),
            toCurrencyId:       $to->id,
            toCurrencyCode:     $to->code,
            rate:               round($rate, 10),
            exchangeRateToBase: round($from->id === $base->id ? 1.0 : $fromRate, 10),
            baseCurrencyId:     $base->id,
            baseCurrencyCode:   $base->code,
            convertedAt:        CarbonImmutable::now(),
        );
    }

    /** Convert straight into the base currency (loyalty earning, reporting). */
    public function snapshotToBase(float $amount, Currency|int|null $from): ConversionSnapshot
    {
        return $this->snapshot($amount, $from, null);
    }

    /**
     * Record a saved conversion in the currency activity log against the
     * record it belongs to (an order, a wallet transaction…). Never throws.
     */
    public function logConversion(Model $subject, ConversionSnapshot $snapshot, string $event = 'converted', array $context = []): void
    {
        $this->logEvent($subject, $event, null, null, ['conversion' => $snapshot->toArray()] + $context);
    }

    /**
     * Write any currency event (e.g. a customer's currency assigned or
     * changed) to currency_activity_logs against $subject. Never throws —
     * a logging failure must not break the real operation.
     */
    public function logEvent(Model $subject, string $event, ?array $old = null, ?array $new = null, array $context = []): void
    {
        try {
            $request = app()->runningInConsole() ? null : request();

            CurrencyActivityLog::create([
                'loggable_type' => $subject->getMorphClass(),
                'loggable_id'   => $subject->getKey(),
                'event'         => $event,
                'user_id'       => auth()->id(),
                'old_values'    => $old ?: null,
                'new_values'    => $new ?: null,
                'context'       => $context ?: null,
                'ip_address'    => $request?->ip(),
                'user_agent'    => $request ? mb_substr((string) $request->userAgent(), 0, 255) : null,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
