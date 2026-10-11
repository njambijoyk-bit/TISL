<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientFamily;
use App\Models\Recipe;
use Illuminate\Support\Facades\DB;

/**
 * What a recipe costs, from what the ingredients really cost: the item that would be used first for a family, the item's own batches for an exact item
 * (and the last cost paid when none is on the shelf, so a dish that is sold out still has a cost). Waste is paid for: peeling loses 15 % means 15 % more is bought.
 */
class RecipeCosting
{
    public function __construct(private IngredientResolver $resolver, private RecipeLines $lines)
    {
    }

    /**
     * @return array{lines: array<int, array{item_id: int, name: string, quantity: float, unit: ?string, waste_pct: float, used: float, unit_cost: ?float, cost: ?float, estimated: bool}>, total: ?float, per_unit: ?float, complete: bool}
     * total is for the whole yield; per_unit is per one unit made; complete is false when some line has no known cost
     */
    public function for(Recipe $r, int $locationId): array
    {
        $r->loadMissing('items');
        $out = [];
        $total = 0.0;
        $complete = true;
        foreach ($r->items as $line) {
            $used = round((float) $line->quantity * RecipeLines::wasteFactor($line), 4);   // in the line's unit, with the waste added back
            if (RecipeLines::extended() && $line->family_id) {
                $family = IngredientFamily::with('unit')->find($line->family_id);
                $name = $family?->name ?? 'Removed ingredient';
                $unit = $line->unit_id ? DB::table('units_of_measure')->where('id', $line->unit_id)->first() : $family?->unit;
                $unitCost = $family ? $this->resolver->unitCost($family, $locationId) : null;
                $estimated = false;
                if ($unitCost === null && $family) {
                    $unitCost = $this->referenceCost($family);
                    $estimated = $unitCost !== null;
                }
                // the family's unit is what the cost is per; a line in another unit of the same kind is converted
                $inFamilyUnit = $family && $line->unit_id && $unit && $family->unit && $unit->dimension === $family->unit->dimension
                    ? $used * (float) $unit->to_base_factor / (float) $family->unit->to_base_factor : $used;
                $cost = $unitCost === null ? null : round($inFamilyUnit * $unitCost, 4);
            } else {
                $name = $this->itemName((int) $line->variant_id);
                $unit = $line->unit_id ? DB::table('units_of_measure')->where('id', $line->unit_id)->first() : null;
                $stockQty = RecipeLines::extended() && $line->unit_id ? $this->lines->toStockUnits((int) $line->variant_id, $used, (int) $line->unit_id) : $used;
                [$perStock, $estimated] = $this->itemCost((int) $line->variant_id, $locationId);
                $unitCost = $perStock;
                $cost = $perStock === null ? null : round($stockQty * $perStock, 4);
            }
            $complete = $complete && $cost !== null;
            $total += $cost ?? 0.0;
            $out[] = ['item_id' => (int) $line->id, 'name' => $name, 'quantity' => (float) $line->quantity, 'unit' => $unit->code ?? null, 'waste_pct' => (float) ($line->waste_pct ?? 0),
                'used' => $used, 'unit_cost' => $unitCost, 'cost' => $cost, 'estimated' => $estimated];
        }
        $total = round($total, 4);

        return ['lines' => $out, 'total' => $complete ? $total : ($total > 0 ? $total : null), 'per_unit' => $complete && (float) $r->yield_qty > 0 ? round($total / (float) $r->yield_qty, 4) : null, 'complete' => $complete];
    }

    /** What an exact item costs per stock unit at a branch (the average of what is on the shelf), else what it last cost. @return array{0: ?float, 1: bool} cost and whether it is only an estimate */
    private function itemCost(int $variantId, int $locationId): array
    {
        $row = DB::table('stock_batch_balances as b')->join('stock_batches as s', 's.id', '=', 'b.batch_id')->where('s.variant_id', $variantId)->where('b.location_id', $locationId)
            ->where('b.quantity', '>', 0)->where('s.status', 'active')->selectRaw('SUM(b.quantity) as q, SUM(b.quantity * s.unit_cost) as v')->first();
        if ($row && (float) $row->q > 0) {
            return [round((float) $row->v / (float) $row->q, 6), false];
        }
        $last = DB::table('stock_batches')->where('variant_id', $variantId)->orderByDesc('id')->value('unit_cost');

        return [$last === null ? null : round((float) $last, 6), $last !== null];
    }

    /** The last cost paid for the family's preferred item that has ever had stock, per family unit. */
    private function referenceCost(IngredientFamily $family): ?float
    {
        foreach ($family->variants()->where('is_allowed', true)->get() as $v) {
            $last = DB::table('stock_batches')->where('variant_id', $v->variant_id)->orderByDesc('id')->value('unit_cost');
            if ($last !== null) {
                return round((float) $last / (float) $v->units_per_stock, 6);
            }
        }

        return null;
    }

    private function itemName(int $variantId): string
    {
        $v = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->first(['p.name', 'pv.name as variant']);

        return $v ? $v->name.($v->variant && $v->variant !== 'Standard' ? " — {$v->variant}" : '') : "Item {$variantId}";
    }
}
