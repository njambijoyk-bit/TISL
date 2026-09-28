<?php

namespace App\Services\Location;

use App\Models\Location;
use App\Models\LocationPrice;
use App\Services\CurrencyConversionService;

/**
 * Resolves the price of any sellable at a branch (the §3.3 chain):
 *
 *   1. per-branch override (LocationPrice, stored net) — used as-is;
 *   2. else the sellable's own price if it's already in the branch currency;
 *   3. else the sellable's price auto-converted into the branch currency.
 *
 * All amounts here are NET (tax-exclusive). Tax is applied later, per branch,
 * from the location's tax district × the sellable's tax class. This class does
 * not touch tax so it stays reusable by every module.
 */
class PriceResolver
{
    public function __construct(private CurrencyConversionService $currencies) {}

    /**
     * @return array{amount: float, currency_id: int|null, source: string, is_override: bool}
     */
    public function resolve(
        string $sellableType,
        int $sellableId,
        float $nativeNetAmount,
        ?int $nativeCurrencyId,
        Location $location
    ): array {
        $branchCurrency = $this->currencies->resolveCurrency($location->currency_id);
        $branchCurrencyId = $branchCurrency->id;

        $override = LocationPrice::query()
            ->where('sellable_type', $sellableType)
            ->where('sellable_id', $sellableId)
            ->where('location_id', $location->id)
            ->first();

        if ($override) {
            $amount = (float) $override->amount; // stored net
            if ($override->currency_id && $override->currency_id !== $branchCurrencyId) {
                $from = $this->currencies->resolveCurrency($override->currency_id);
                $amount = $this->currencies->convert($amount, $from, $branchCurrency);
            }
            return [
                'amount'      => round($amount, 4),
                'currency_id' => $branchCurrencyId,
                'source'      => 'override',
                'is_override' => true,
            ];
        }

        // No override — use the sellable's own price, converting if needed.
        if ($nativeCurrencyId === null || $nativeCurrencyId === $branchCurrencyId) {
            return [
                'amount'      => round($nativeNetAmount, 4),
                'currency_id' => $branchCurrencyId,
                'source'      => 'base',
                'is_override' => false,
            ];
        }

        $from = $this->currencies->resolveCurrency($nativeCurrencyId);
        $converted = $this->currencies->convert($nativeNetAmount, $from, $branchCurrency);

        return [
            'amount'      => round($converted, 4),
            'currency_id' => $branchCurrencyId,
            'source'      => 'converted',
            'is_override' => false,
        ];
    }
}
