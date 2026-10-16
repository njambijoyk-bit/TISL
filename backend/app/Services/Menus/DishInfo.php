<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;

/** What can be said about a dish from its recipe: allergens and diets (inherited from the ingredients), whether it can be made now, and what it costs. */
class DishInfo
{
    public function __construct(private IngredientUse $use, private DishStock $stock)
    {
    }

    /**
     * The allergens and tags of the dish. A declared list on the dish itself (allergens_override / tags_override) replaces the inherited one. `complete` is false when the dish has no
     * recipe yet, so nothing is known about what is in it: nothing is then claimed (no diet badges).
     *
     * @return array{allergens: string[], tags: string[], diets: string[], complete: bool, declared: bool}
     */
    public function profile(Dish $dish): array
    {
        $dish->loadMissing('menuRecipe.lines.ingredient');
        $inherited = $dish->menuRecipe ? $this->ingredients($dish->menuRecipe) : ['allergens' => [], 'tags' => [], 'unknown' => 1];
        $declaredAllergens = $dish->allergens_override !== null;
        $declaredTags = $dish->tags_override !== null;
        $allergens = FoodTags::clean($declaredAllergens ? $dish->allergens_override : $inherited['allergens'], FoodTags::ALLERGENS);
        $tags = FoodTags::clean($declaredTags ? $dish->tags_override : $inherited['tags'], FoodTags::TAGS);
        $complete = ($declaredAllergens && $declaredTags) || $inherited['unknown'] === 0;

        return ['allergens' => $allergens, 'tags' => $tags, 'diets' => $complete ? DietBadges::for($allergens, $tags) : [], 'complete' => $complete, 'declared' => $declaredAllergens || $declaredTags];
    }

    /** What a recipe written on ingredients inherits: every ingredient says what it contains and what it is, so nothing is unknown. @return array{allergens: string[], tags: string[], unknown: int} */
    private function ingredients(DishRecipe $r): array
    {
        $out = ['allergens' => [], 'tags' => [], 'unknown' => 0];
        foreach ($r->lines as $l) {
            $out['allergens'] = array_merge($out['allergens'], $l->ingredient?->allergens ?? []);
            $out['tags'] = array_merge($out['tags'], $l->ingredient?->tags ?? []);
        }

        return $out;
    }

    /**
     * How many of the dish could be sold at a branch now. Switched off, or marked sold out for today: none. Made to order: what the ingredients on the shelf allow.
     * Made ahead: the portions made and still in date. No recipe: none (nothing says what it is made of).
     */
    public function portions(Dish $dish, int $locationId): float
    {
        if (! $dish->is_active || ($dish->sold_out_on && $dish->sold_out_on->isToday())) {
            return 0.0;
        }
        $dish->loadMissing('menuRecipe');
        $r = $dish->menuRecipe;
        if (! $r || ! $r->is_active) {
            return 0.0;
        }
        if ($r->made_to_order) {
            try {
                return $this->use->capacity($r, $locationId);
            } catch (\App\Services\Books\BooksException) {
                return 0.0;   // an ingredient was removed or switched off: it can not be made until the recipe is fixed
            }
        }

        return $this->stock->portionsAhead($dish, $locationId);
    }

    /** The price (before tax) and what the dish costs to make, and the margin. @return array{price: ?float, cost: ?float, margin: ?float, food_cost_pct: ?float, complete: bool} */
    public function money(Dish $dish, int $locationId): array
    {
        $price = $dish->price === null ? null : (float) $dish->price;
        $dish->loadMissing('menuRecipe.lines.ingredient');
        $c = $dish->menuRecipe ? $this->use->cost($dish->menuRecipe, $locationId) : ['per_portion' => null, 'complete' => false];
        $cost = $c['per_portion'];

        return ['price' => $price, 'cost' => $cost, 'margin' => $price !== null && $cost !== null ? round($price - $cost, 4) : null,
            'food_cost_pct' => $price && $cost !== null ? round($cost / $price * 100, 1) : null, 'complete' => (bool) $c['complete']];
    }
}
