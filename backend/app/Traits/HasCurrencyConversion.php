<?php

namespace App\Traits;

use App\Models\Currency;
use App\Services\CurrencyConversionService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Adds a currency() relation and a convertAmount() helper to any model with
 * a nullable currency_id column. Deliberately does NOT touch the model's
 * native price field(s) — each model decides what to expose (see
 * Product::getDisplayPriceAttribute() / Service::getDisplayPriceAttribute()),
 * so admin edit forms keep reading/writing the true native price.
 *
 * NULL currency_id means "priced in the base currency".
 */
trait HasCurrencyConversion
{
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    /**
     * Convert a native-currency amount belonging to this record into a
     * target currency (defaults to the request's display currency).
     * Returns null when $amount is null so callers can chain safely.
     */
    public function convertAmount(?float $amount, ?int $targetCurrencyId = null): ?float
    {
        if ($amount === null) {
            return null;
        }

        return app(CurrencyConversionService::class)
            ->convertForDisplay($amount, $this->currency_id, $targetCurrencyId)['amount'];
    }

    /** Code of the currency display_price is expressed in. */
    public function getDisplayCurrencyAttribute(): string
    {
        return app(CurrencyConversionService::class)->getDisplayCurrency()->code;
    }

    // ========================================
    // SCOPES — compare prices across mixed currencies
    // ========================================

    /**
     * SQL for $column expressed in the base currency. conversion_rate is
     * "1 unit of this currency in base", and base itself is 1, so a NULL
     * currency_id (= base) multiplies by 1.
     */
    protected function basePriceSql(string $column): string
    {
        $table = $this->getTable();

        return "({$table}.{$column} * COALESCE((SELECT c.conversion_rate FROM currencies c WHERE c.id = {$table}.currency_id), 1))";
    }

    /**
     * Filter where $column falls between $min and $max, both given in
     * $in (defaults to the display currency). Either bound may be null.
     */
    public function scopePriceBetweenIn(Builder $query, string $column, $min, $max, ?Currency $in = null): Builder
    {
        $in   ??= app(CurrencyConversionService::class)->getDisplayCurrency();
        $rate = (float) $in->conversion_rate;
        $expr = $this->basePriceSql($column);

        if ($min !== null && $min !== '') {
            $query->whereRaw("{$expr} >= ?", [(float) $min * $rate]);
        }

        if ($max !== null && $max !== '') {
            $query->whereRaw("{$expr} <= ?", [(float) $max * $rate]);
        }

        return $query;
    }

    public function scopeOrderByBasePrice(Builder $query, string $column, string $direction = 'asc'): Builder
    {
        $direction = strtolower($direction) === 'desc' ? 'desc' : 'asc';

        return $query->orderByRaw($this->basePriceSql($column) . ' ' . $direction);
    }
}