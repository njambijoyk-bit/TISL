<?php

namespace App\Support\Money;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * An amount converted from one currency to another, frozen with the rates
 * used at that moment. Store toArray() (or its columns) on whatever record
 * the money lands on; reverse() later undoes it with the SAME rates,
 * whatever the rates or base currency are by then.
 *
 *   rate                  1 unit of `from` = rate units of `to`
 *   exchange_rate_to_base 1 unit of `from` = this many units of the base
 *   base_currency_id      which currency was the base at the time
 */
final class ConversionSnapshot
{
    public function __construct(
        public readonly float $amountFrom,
        public readonly int $fromCurrencyId,
        public readonly string $fromCurrencyCode,
        public readonly float $amountTo,
        public readonly int $toCurrencyId,
        public readonly string $toCurrencyCode,
        public readonly float $rate,
        public readonly float $exchangeRateToBase,
        public readonly int $baseCurrencyId,
        public readonly string $baseCurrencyCode,
        public readonly CarbonImmutable $convertedAt,
    ) {}

    public function isSameCurrency(): bool
    {
        return $this->fromCurrencyId === $this->toCurrencyId;
    }

    /** The original amount expressed in the base currency at the time. */
    public function amountInBase(): float
    {
        return round($this->amountFrom * $this->exchangeRateToBase, 2);
    }

    /**
     * Undo (part of) the conversion at the stored rate: an amount in `to`
     * back into `from`. Used for cancellations and refunds.
     */
    public function reverse(?float $amountTo = null): float
    {
        $amountTo ??= $this->amountTo;

        if ($this->isSameCurrency()) {
            return round($amountTo, 2);
        }
        if ($this->rate <= 0) {
            throw new InvalidArgumentException('Cannot reverse a conversion with a zero rate.');
        }

        return round($amountTo / $this->rate, 2);
    }

    public function toArray(): array
    {
        return [
            'amount_from'           => $this->amountFrom,
            'from_currency_id'      => $this->fromCurrencyId,
            'from_currency'         => $this->fromCurrencyCode,
            'amount_to'             => $this->amountTo,
            'to_currency_id'        => $this->toCurrencyId,
            'to_currency'           => $this->toCurrencyCode,
            'rate'                  => $this->rate,
            'exchange_rate_to_base' => $this->exchangeRateToBase,
            'base_currency_id'      => $this->baseCurrencyId,
            'base_currency'         => $this->baseCurrencyCode,
            'converted_at'          => $this->convertedAt->toIso8601String(),
        ];
    }

    /** Rebuild from toArray() output (e.g. a JSON column or a log context). */
    public static function fromArray(array $a): self
    {
        return new self(
            (float) $a['amount_from'], (int) $a['from_currency_id'], (string) $a['from_currency'],
            (float) $a['amount_to'], (int) $a['to_currency_id'], (string) $a['to_currency'],
            (float) $a['rate'], (float) $a['exchange_rate_to_base'],
            (int) $a['base_currency_id'], (string) $a['base_currency'],
            CarbonImmutable::parse($a['converted_at']),
        );
    }
}
