<?php

namespace App\Services\Menus;

use App\Models\Currency;
use App\Models\Menus\IngredientItem;
use App\Services\CurrencyConversionService;

/**
 * What takeaway packaging an order needs. Each dish line follows the rules of the sides it was ordered with and of the dish (PackagingRules::effective). A per-dish rule counts once for each
 * dish sold, added up over the whole order; a per-order rule counts once for the order and the largest count asked for wins (they are not added). The same item asked for both ways adds the two.
 * A charged item is priced from the packaging price list (converted to the currency of the order); a free one costs nothing to the customer. Nothing is worked out for a meal eaten in.
 */
class PackagingCalc
{
    public function __construct(private PackagingRules $rules, private PackagingPrices $prices, private CurrencyConversionService $money)
    {
    }

    /**
     * @param array<int, array{dish: \App\Models\Menus\Dish, quantity: float|int, uses?: mixed}> $lines the dishes of an order: priced lines, or a tab's lines
     * @param bool $takeaway false for a meal eaten in: nothing is needed
     * @return array<int, array{item_id: int, name: string, quantity: int, compulsory: bool, charged: bool, needs_waive: bool, unit_price: float, amount: float, currency_id: ?int, ledger_id: ?int, receipt: string, shown: bool, from: string[]}>
     */
    public function forLines(array $lines, bool $takeaway): array
    {
        if (! $takeaway || ! PackagingRules::installed()) {
            return [];
        }
        $perDish = [];
        $perOrder = [];
        $info = [];
        foreach ($lines as $l) {
            $dish = $l['dish'];
            $count = (float) $l['quantity'];
            foreach ($this->rules->effective($dish, $this->sidesOf($dish, $l['uses'] ?? [])) as $r) {
                $id = $r['item_id'];
                if ($r['scope'] === 'per_order') {
                    $perOrder[$id] = max($perOrder[$id] ?? 0, $r['quantity']);
                } else {
                    $perDish[$id] = ($perDish[$id] ?? 0) + $r['quantity'] * $count;
                }
                $info[$id] ??= ['compulsory' => false, 'charged' => false, 'receipts' => [], 'from' => []];
                $info[$id]['compulsory'] = $info[$id]['compulsory'] || $r['compulsory'];
                $info[$id]['charged'] = $info[$id]['charged'] || $r['charged'];
                $info[$id]['receipts'][$r['receipt']] = true;
                foreach (explode(', ', $r['from']) as $f) {
                    $info[$id]['from'][$f] = true;
                }
            }
        }
        $out = [];
        foreach ($info as $id => $i) {
            $qty = (int) ceil(($perDish[$id] ?? 0) + ($perOrder[$id] ?? 0));
            if ($qty < 1) {
                continue;
            }
            $out[] = $this->line((int) $id, $qty, $i['compulsory'], $i['charged'], $i['receipts'], array_keys($i['from']));
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $out;
    }

    /**
     * One packaging line for a count of an item: priced from the list when it is to be charged and has a price there (converted to the order's currency), else free.
     *
     * @param array<string, bool> $receipts the receipt switches of the rules that asked for it ('auto', 'always', 'never')
     * @param string[] $from
     * @return array{item_id: int, name: string, quantity: int, compulsory: bool, charged: bool, needs_waive: bool, unit_price: float, amount: float, currency_id: ?int, ledger_id: ?int, receipt: string, shown: bool, from: string[]}
     */
    public function line(int $id, int $qty, bool $compulsory, bool $wantsCharge, array $receipts, array $from = []): array
    {
        $to = Currency::getBaseCurrency();   // the order's voucher is written in the base currency
        $price = $wantsCharge ? $this->prices->priceOf($id) : null;
        $unit = 0.0;
        if ($price) {   // a price in another currency than the order's is converted; one in the order's currency (or the base, with no currency named) is used as it is
            $unit = $price['price'];
            if ($to && $price['currency_id'] && (int) $price['currency_id'] !== (int) $to->id) {
                $unit = $this->money->convert($price['price'], $this->money->resolveCurrency($price['currency_id']), $to);
            }
        }
        $charged = $price !== null;   // a rule that wants it charged but whose price has since left the list is free
        $receipt = isset($receipts['always']) ? 'always' : (isset($receipts['auto']) ? 'auto' : 'never');
        $item = IngredientItem::with('ingredient')->find($id);

        return ['item_id' => $id, 'name' => $item ? $item->ingredient->name.($item->name !== $item->ingredient->name ? ' - '.$item->name : '') : 'Packaging', 'quantity' => $qty, 'compulsory' => $compulsory, 'charged' => $charged,
            'needs_waive' => $compulsory && $charged, 'unit_price' => $unit, 'amount' => round($unit * $qty, 2), 'currency_id' => $to?->id, 'ledger_id' => $price['ledger_id'] ?? null, 'receipt' => $receipt,
            'shown' => $receipt === 'always' || ($receipt === 'auto' && $charged), 'from' => $from];
    }

    /** The sides a dish line was ordered with, or the dish's own side when sales go through sides. @return int[] */
    private function sidesOf(\App\Models\Menus\Dish $dish, mixed $uses): array
    {
        $ids = array_values(array_unique(array_column(DishSelection::sidesIn($uses), 'side_id')));
        if (! $ids && ($side = app(SideSales::class)->sideFor($dish))) {
            $ids = [(int) $side->id];
        }

        return $ids;
    }
}
