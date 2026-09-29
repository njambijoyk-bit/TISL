<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\TaxApplicability;
use Illuminate\Database\Eloquent\Model;

/**
 * What the shopper is told about tax on an item's price. Prices are always entered and stored EXCLUSIVE of tax;
 * the tax comes from the sales account the item is sold under. This only describes that treatment — the same
 * rate TaxLineService applies on the voucher — so cards, detail pages and the invoice agree.
 */
class PriceTax
{
    /** @var array<int, ?array> */
    private static array $cache = [];

    public static function flush(): void
    {
        self::$cache = [];
    }

    /** {nature, category, label, rate_percent} for a sales account, or null when the account is missing/untreated. */
    public static function forAccount(?int $ledgerId): ?array
    {
        if (! $ledgerId) {
            return null;
        }

        return self::$cache[$ledgerId] ??= self::describe(Ledger::find($ledgerId));
    }

    /** As forAccount(), but an item that holds a blanket tax exemption is shown as exempt whatever its account says. */
    public static function forItem(Model $item): ?array
    {
        $info = self::forAccount($item->sales_ledger_id ?? null);
        if ($info && $info['nature'] === 'taxable' && $item->exists
            && TaxApplicability::forTaxable($item)->whereNull('tax_rule_id')->get()->contains(fn ($o) => $o->isEffectivelyExempt(null))) {
            return self::exempt();
        }

        return $info;
    }

    /** Net → {net, tax, gross} for a percentage treatment. */
    public static function split(float $net, ?array $info): array
    {
        $tax = $info && $info['rate_percent'] ? round($net * $info['rate_percent'] / 100, 2) : 0.0;

        return ['net' => round($net, 2), 'tax' => $tax, 'gross' => round($net + $tax, 2)];
    }

    private static function describe(?Ledger $account): ?array
    {
        if (! $account || ! $account->tax_nature) {
            return null;
        }
        if ($account->tax_nature === 'exempt') {
            return self::exempt();
        }
        if ($account->tax_nature === 'out_of_scope') {
            return ['nature' => 'out_of_scope', 'category' => 'Out of scope', 'label' => 'Out of scope', 'rate_percent' => null];
        }
        $rate = app(TaxLineService::class)->rateFor($account);
        $name = $rate?->taxType?->code ?? $rate?->taxType?->name ?? 'Tax';
        $value = $rate ? rtrim(rtrim((string) $rate->rate_value, '0'), '.') : '0';
        $pct = $rate && $rate->isPercentage() ? (float) $rate->rate_value : null;
        if ($account->tax_nature === 'zero_rated' || ($pct !== null && $pct == 0.0)) {
            return ['nature' => 'zero_rated', 'category' => 'Zero-rated', 'label' => "{$name} 0%", 'rate_percent' => null];
        }

        return ['nature' => 'taxable', 'category' => "{$name} {$value}" . ($rate?->isPercentage() ? '%' : ''), 'label' => "{$name} {$value}" . ($rate?->isPercentage() ? '%' : ''), 'rate_percent' => $pct];
    }

    private static function exempt(): array
    {
        return ['nature' => 'exempt', 'category' => 'Exempt', 'label' => 'Exempt', 'rate_percent' => null];
    }
}
