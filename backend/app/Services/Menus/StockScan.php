<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientItem;
use App\Services\Codes\CodeException;
use App\Services\Codes\Items\CodeCatalogue;
use App\Services\Codes\Items\MenusCodeItems;

/**
 * Scanning in the kitchen's stock screens (receive, count, what to buy): what a scanned code is, in terms of the one thing those screens work with, a kitchen stock item. A crate's or a bottle's
 * own code finds its item; the label of an ingredient lot finds the item the lot is of; a code an item used to have still finds it, marked old. Anything else (a dish, a product) is reported,
 * not used. The code can also be learnt: the first time a supplier's barcode is seen it is given to the item it turns out to be.
 */
class StockScan
{
    public function __construct(private CodeCatalogue $codes)
    {
    }

    /** @return array{found: bool, matches: array<int, array<string, mixed>>, other: array<int, string>} */
    public function scan(string $code): array
    {
        $found = $this->codes->lookup($code);
        $matches = [];
        $other = [];
        foreach ($found as $m) {
            if (! in_array($m['type'], ['kitchen_item', 'stock_lot'], true) || empty($m['item_id'])) {
                $other[] = ($m['label'] ?? '').' ('.(MenusCodeItems::TYPES[$m['type']] ?? $m['type']).')';

                continue;
            }
            $item = IngredientItem::with('ingredient')->find($m['item_id']);
            if (! $item) {
                continue;
            }
            $matches[] = ['type' => $m['type'], 'id' => (int) $m['id'], 'item_id' => (int) $item->id, 'ingredient' => $item->ingredient?->name, 'name' => $item->name, 'label' => trim(($item->ingredient?->name ?? '').' '.$item->name),
                'code' => $m['code'], 'retired' => (bool) ($m['retired'] ?? false), 'lot' => $m['type'] === 'stock_lot' ? $m['label'] : null,
                'unit_kind' => $item->pack_size ? 'pack' : ($item->ingredient?->alt_unit_id ? 'alt' : 'base')];
        }

        return ['found' => $matches !== [], 'matches' => $matches, 'other' => $other];
    }

    /** Give a code (a supplier's barcode) to a kitchen stock item: the old one, if any, stays findable. @throws CodeException */
    public function learn(int $itemId, string $code, ?int $by): void
    {
        $this->codes->setCode('kitchen_item', $itemId, $code, $by, 'Supplier barcode');
    }
}
