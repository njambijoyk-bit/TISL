<?php

namespace App\Services\Menus;

use App\Models\Menus\StockBatch;
use App\Services\Stock\Items\StockItemSource;
use Illuminate\Support\Facades\DB;

/**
 * Menus' ingredient variants as stocked items, so the core stock reports, the stock journal and the stock query card describe them like any other item. Quantities are
 * in the ingredient's base unit; the movements arrive through StockMoveObserver.
 */
class IngredientItemSource implements StockItemSource
{
    public const TYPE = 'menus_ingredient_item';

    public function type(): string
    {
        return self::TYPE;
    }

    public function label(): string
    {
        return 'Ingredients';
    }

    public function describe(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $out = [];
        foreach (array_chunk(array_values(array_unique($ids)), 500) as $chunk) {
            $rows = DB::table('menus_ingredient_items as it')->join('menus_ingredients as i', 'i.id', '=', 'it.ingredient_id')->leftJoin('units_of_measure as u', 'u.id', '=', 'i.base_unit_id')
                ->whereIn('it.id', $chunk)->get(['it.id', 'it.name as variant', 'it.code', 'i.name as ingredient', 'u.code as unit']);
            foreach ($rows as $r) {
                $out[(int) $r->id] = ['name' => "{$r->ingredient} — {$r->variant}", 'sku' => $r->code, 'group' => 'Ingredients: '.$r->ingredient, 'unit' => $r->unit, 'sale_price' => null, 'currency' => null, 'url' => '/admin/menus/ingredients'];
            }
        }

        return $out;
    }

    public function search(string $q, int $limit = 500): array
    {
        return DB::table('menus_ingredient_items as it')->join('menus_ingredients as i', 'i.id', '=', 'it.ingredient_id')
            ->where(fn ($w) => $w->where('i.name', 'like', "%{$q}%")->orWhere('it.name', 'like', "%{$q}%")->orWhere('it.code', 'like', "%{$q}%"))
            ->limit($limit)->pluck('it.id')->map(fn ($i) => (int) $i)->all();
    }

    /** Where it is on the shelf now, one row for each branch, batch number, expiry date and status (lots with the same of those are added together), for the stock query card. @return array<int, array{location: string, batch_no: ?string, expiry_date: ?string, status: string, quantity: float}> */
    public function places(int $id, ?int $location = null): array
    {
        $out = [];
        foreach (StockBatch::where('item_id', $id)->where('qty_left', '>', 0)->when($location, fn ($q) => $q->where('location_id', $location))->orderBy('expiry_date')->orderBy('id')->get() as $b) {
            $place = (string) DB::table('locations')->where('id', $b->location_id)->value('name');
            $status = $b->status === 'ok' ? 'active' : $b->status;
            $key = implode('|', [$b->location_id, $b->batch_no, $b->expiry_date?->toDateString(), $status]);
            $out[$key] ??= ['location' => $place, 'batch_no' => $b->batch_no, 'expiry_date' => $b->expiry_date?->toDateString(), 'status' => $status, 'quantity' => 0.0];
            $out[$key]['quantity'] = round($out[$key]['quantity'] + (float) $b->qty_left, 4);
        }

        return array_values($out);
    }

    /** What one base unit last cost. */
    public function lastCost(int $id): ?float
    {
        $c = StockBatch::where('item_id', $id)->where('source', '!=', 'count')->orderByDesc('id')->value('unit_cost');

        return $c === null ? null : (float) $c;
    }
}
