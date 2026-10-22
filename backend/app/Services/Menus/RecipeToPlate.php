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
    public function __construct(private Sides $sides, private DishService $dishes, private DishMakeup $makeup)
    {
    }

    /**
     * @param array{side?: bool, dish?: bool, price?: mixed, station_id?: ?int} $o
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
            if (! $side) {
                $side = $this->sides->save(['name' => $recipe->name, 'recipe_id' => $recipe->id, 'station_id' => $o['station_id'] ?? null]);
                $made[] = "the side {$side->name}";
            }
            $dish = null;
            if ($wantDish) {
                if (! is_numeric($o['price'] ?? null) || (float) $o['price'] < 0) {
                    throw new BooksException('Give the dish a price (0 or more).');
                }
                $dish = $this->dishes->save(['name' => $recipe->name, 'price' => (float) $o['price'], 'station_id' => $o['station_id'] ?? null, 'is_active' => true], null, $userId);
                $this->makeup->save($dish, ['slots' => [['name' => 'Plate', 'kind' => 'fixed', 'choices' => [['side_id' => $side->id]]]]]);
                $made[] = "the dish {$dish->name}";
            }

            return ['side' => $side, 'dish' => $dish, 'made' => $made];
        });
    }
}
