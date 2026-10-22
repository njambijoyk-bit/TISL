<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * The shortcut for a simple item: from a recipe of its own, make the side of the same name and, if wanted, the dish of the same name with one slot holding that side. A recipe that already has a
 * side gets no second one (the side is used as it is). Nothing is made when any part is refused, so there are no half-built items to clean up.
 */
class RecipeToPlate
{
    public function __construct(private Sides $sides, private DishService $dishes, private DishMakeup $makeup, private PackagingRules $rules)
    {
    }

    /**
     * `side_details` and `dish_details` fill in what the side and the dish forms have (sizes, plating time, who it is for, packaging...). They are used for what is made now; a side that was there already is left as it is,
     * unless `update_side` is set: then the details are written to it (its amounts and packaging are replaced by what is sent).
     *
     * @param array{side?: bool, dish?: bool, price?: mixed, station_id?: ?int, update_side?: bool, side_details?: array<string, mixed>, dish_details?: array<string, mixed>} $o
     * @return array{side: ?Side, dish: ?Dish, made: string[]} what is there now and what was made
     */
    public function make(DishRecipe $recipe, array $o, ?int $userId = null): array
    {
        $wantDish = (bool) ($o['dish'] ?? false);
        $wantSide = (bool) ($o['side'] ?? false) || $wantDish;
        if (! $wantSide) {
            return ['side' => null, 'dish' => null, 'made' => []];
        }
        if (! Sides::installed() || ($wantDish && ! DishMakeup::installed())) {
            throw new BooksException('Run database scripts 200 and 202 first: until then a recipe can not be made into a side or a dish.');
        }
        if ($recipe->dish_id) {
            throw new BooksException('Only a recipe of its own can be made into a side or a dish.');
        }

        return DB::transaction(function () use ($recipe, $o, $wantDish, $userId) {
            $made = [];
            $side = Side::where('recipe_id', $recipe->id)->first();
            if (! $side && Side::whereRaw('LOWER(name) = ?', [mb_strtolower($recipe->name)])->exists()) {
                throw new BooksException("There is already a side called {$recipe->name}, so nothing was saved. Tick \"Not a simple meal\" to save only the recipe, or give the recipe another name.");
            }
            if (! $side) {
                $sd = (array) ($o['side_details'] ?? []);
                $side = $this->sides->save(['name' => $recipe->name, 'recipe_id' => $recipe->id, 'station_id' => $o['station_id'] ?? null] + array_intersect_key($sd, array_flip(['base_amount', 'amounts', 'task_minutes', 'note', 'unit_id'])));
                $this->packaging('side', $side->id, $sd['packaging'] ?? []);
                $made[] = "the side {$side->name}";
            } elseif (! empty($o['update_side']) && ! empty($o['side_details'])) {
                $sd = (array) $o['side_details'];
                $side = $this->sides->save(['name' => $side->name, 'recipe_id' => $recipe->id, 'unit_id' => $side->unit_id, 'is_active' => (bool) $side->is_active, 'station_id' => $o['station_id'] ?? null]
                    + array_intersect_key($sd, array_flip(['base_amount', 'amounts', 'task_minutes', 'note'])), (int) $side->id);
                if (array_key_exists('packaging', $sd)) {
                    $this->rules->save('side', (int) $side->id, array_values((array) $sd['packaging']));
                }
                $made[] = "the side {$side->name} updated";
            }
            $dish = null;
            if ($wantDish) {
                if (! is_numeric($o['price'] ?? null) || (float) $o['price'] < 0) {
                    throw new BooksException('Give the dish a price (0 or more).');
                }
                $dd = (array) ($o['dish_details'] ?? []);
                $dish = $this->dishes->save(['name' => $recipe->name, 'price' => (float) $o['price'], 'station_id' => $o['station_id'] ?? null, 'is_active' => true] + array_intersect_key($dd, array_flip(['description', 'prep_minutes'])), null, $userId);
                $this->makeup->save($dish, ['slots' => [['name' => 'Plate', 'kind' => 'fixed', 'choices' => [['side_id' => $side->id]]]]] + array_intersect_key($dd, array_flip(['servings', 'audience_ids'])));
                $this->packaging('dish', $dish->id, $dd['packaging'] ?? []);
                $made[] = "the dish {$dish->name}";
            }

            return ['side' => $side, 'dish' => $dish, 'made' => $made];
        });
    }

    /** The packaging that goes with the new side or dish, when any is asked for. @param array<int, array<string, mixed>> $rules */
    private function packaging(string $owner, int $id, array $rules): void
    {
        if ($rules) {
            $this->rules->save($owner, $id, array_values($rules));   // refused in words when script 207 and 208 are missing or an item is not packaging
        }
    }
}
