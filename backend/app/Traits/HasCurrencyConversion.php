<?php

namespace App\Traits;

use App\Models\Currency;
use App\Services\CurrencyConversionService;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Adds a currency() relation and a convertAmount() helper to any model with
 * a nullable currency_id column. Deliberately does NOT touch the model's
 * native price field(s) or auto-append a converted value — each model
 * decides for itself what to expose (see Product::getDisplayPriceAttribute()
 * / Service::getDisplayPriceAttribute() for the pattern), so admin edit
 * forms keep reading/writing the true native price without a conversion
 * silently sitting in between.
 */
trait HasCurrencyConversion
{
    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    /**
     * Convert a native-currency amount belonging to this record into a
     * target currency (defaults to the current base/display currency).
     * Returns null when $amount is null so callers can chain safely on
     * nullable price fields without a null-check at every call site.
     */
    public function convertAmount(?float $amount, ?int $targetCurrencyId = null): ?float
    {
        if ($amount === null) {
            return null;
        }

        $service = app(CurrencyConversionService::class);

        return $service->convertForDisplay($amount, $this->currency_id, $targetCurrencyId)['amount'];
    }
}
