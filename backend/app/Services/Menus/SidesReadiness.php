<?php

namespace App\Services\Menus;

use App\Models\Menus\DishBatch;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Side;
use Illuminate\Support\Facades\Schema;

/**
 * Is it safe to switch on selling through sides? Compares each dish's own recipe with the copy its side is made from, lists the dishes that have a recipe but no side, and the portions of
 * dishes made ahead that are still on the old dish shelf (they are not sold once the switch is on; the prepared food shelf is). It only reads; it changes nothing.
 */
class SidesReadiness
{
    /**
     * @return array{ready: bool, on: bool, dish_recipes: int, with_side: int, without_side: string[], differs: array<int, array{dish: string, what: string[]}>, old_shelf: array<int, array{dish: string, portions: float}>}
     */
    public function report(): array
    {
        $on = (bool) (MenusSettings::all()['sell_through_sides'] ?? false);
        if (! SidesFromDishes::installed()) {
            return ['ready' => false, 'on' => $on, 'dish_recipes' => 0, 'with_side' => 0, 'without_side' => [], 'differs' => [], 'old_shelf' => []];
        }
        $originals = DishRecipe::with(['dish', 'lines'])->whereNotNull('dish_id')->orderBy('id')->get();
        $sides = Side::with('recipe.lines')->whereNotNull('from_dish_id')->get()->keyBy('from_dish_id');
        $without = [];
        $differs = [];
        $oldShelf = [];
        $stock = Schema::hasTable('menus_dish_batches') ? DishBatch::where('qty_left', '>', 0)->selectRaw('dish_id, SUM(qty_left) as q')->groupBy('dish_id')->pluck('q', 'dish_id') : collect();
        foreach ($originals as $o) {
            $name = $o->dish?->name ?? 'A dish';
            $side = $sides->get($o->dish_id);
            if (! $side || ! $side->recipe) {
                $without[] = $name;
            } else {
                $what = $this->compare($o, $side->recipe);
                if ($what) {
                    $differs[] = ['dish' => $name, 'what' => $what];
                }
            }
            if (! $o->made_to_order && (float) ($stock[$o->dish_id] ?? 0) > 0.00005) {
                $oldShelf[] = ['dish' => $name, 'portions' => round((float) $stock[$o->dish_id], 4)];
            }
        }

        return ['ready' => true, 'on' => $on, 'dish_recipes' => $originals->count(), 'with_side' => $originals->count() - count($without), 'without_side' => $without, 'differs' => $differs, 'old_shelf' => $oldShelf];
    }

    /** What is different between a dish's recipe and its copy. @return string[] */
    private function compare(DishRecipe $o, DishRecipe $c): array
    {
        $what = [];
        if (abs((float) $o->yield_qty - (float) $c->yield_qty) > 0.00005) {
            $what[] = 'a batch makes a different amount';
        }
        if ((bool) $o->made_to_order !== (bool) $c->made_to_order) {
            $what[] = 'made to order or ahead differs';
        }
        if ((bool) $o->is_active !== (bool) $c->is_active) {
            $what[] = 'switched on or off differs';
        }
        $key = fn ($rows) => $rows->map(fn ($l) => [(int) $l->ingredient_id, (int) ($l->sub_recipe_id ?? 0), round((float) $l->quantity, 4), (string) $l->unit, round((float) $l->waste_pct, 2)])->sortBy(fn ($r) => json_encode($r))->values()->all();
        if ($key($o->lines) !== $key($c->lines)) {
            $what[] = 'the ingredients or amounts differ';
        }

        return $what;
    }
}
