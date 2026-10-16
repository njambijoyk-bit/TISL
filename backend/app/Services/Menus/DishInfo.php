<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientFamily;
use App\Models\Menus\IngredientVariant;
use App\Models\Recipe;
use App\Services\Stock\BatchService;
use Illuminate\Support\Facades\DB;

/** What can be said about a dish from its recipe: allergens and diets (inherited from the ingredients), whether it can be made now, and what it costs. */
class DishInfo
{
    public function __construct(private RecipeLines $lines, private RecipeCosting $costing, private BatchService $batches, private IngredientUse $use)
    {
    }

    /**
     * The allergens and tags of the dish. A declared list on the dish itself (allergens_override / tags_override) replaces the inherited one. `complete` is false when some
     * ingredient is an exact stock item that is in no ingredient family and is not itself made from a recipe, so nothing is known about it: nothing is then claimed (no diet badges).
     *
     * @return array{allergens: string[], tags: string[], diets: string[], complete: bool, declared: bool}
     */
    public function profile(Dish $dish): array
    {
        $new = DishRecipes::installed();
        $dish->loadMissing(array_merge(['recipe.items'], $new ? ['menuRecipe.lines.ingredient'] : []));
        $inherited = $new && $dish->menuRecipe ? $this->ingredients($dish->menuRecipe) : ($dish->recipe ? $this->walk($dish->recipe, 0, []) : ['allergens' => [], 'tags' => [], 'unknown' => 1]);
        $declaredAllergens = $dish->allergens_override !== null;
        $declaredTags = $dish->tags_override !== null;
        $allergens = FoodTags::clean($declaredAllergens ? $dish->allergens_override : $inherited['allergens'], FoodTags::ALLERGENS);
        $tags = FoodTags::clean($declaredTags ? $dish->tags_override : $inherited['tags'], FoodTags::TAGS);
        $complete = ($declaredAllergens && $declaredTags) || $inherited['unknown'] === 0;

        return ['allergens' => $allergens, 'tags' => $tags, 'diets' => $complete ? DietBadges::for($allergens, $tags) : [], 'complete' => $complete, 'declared' => $declaredAllergens || $declaredTags];
    }

    /** What a recipe written on ingredients inherits: every ingredient says what it contains and what it is, so nothing is unknown. @return array{allergens: string[], tags: string[], unknown: int} */
    private function ingredients(\App\Models\Menus\DishRecipe $r): array
    {
        $out = ['allergens' => [], 'tags' => [], 'unknown' => 0];
        foreach ($r->lines as $l) {
            $out['allergens'] = array_merge($out['allergens'], $l->ingredient?->allergens ?? []);
            $out['tags'] = array_merge($out['tags'], $l->ingredient?->tags ?? []);
        }

        return $out;
    }

    /** @param int[] $seen recipes already on the way down (a recipe that uses itself is not followed again) @return array{allergens: string[], tags: string[], unknown: int} */
    private function walk(Recipe $r, int $depth, array $seen): array
    {
        $out = ['allergens' => [], 'tags' => [], 'unknown' => 0];
        if ($depth > 5 || in_array($r->id, $seen, true)) {
            return $out;
        }
        $seen[] = $r->id;
        $r->loadMissing('items');
        foreach ($r->items as $line) {
            $family = null;
            if (RecipeLines::extended() && $line->family_id) {
                $family = IngredientFamily::find($line->family_id);
            } elseif ($line->variant_id && ($iv = IngredientVariant::where('variant_id', $line->variant_id)->first())) {
                $family = IngredientFamily::find($iv->family_id);
            }
            if ($family) {
                $out['allergens'] = array_merge($out['allergens'], $family->allergens ?? []);
                $out['tags'] = array_merge($out['tags'], $family->tags ?? []);

                continue;
            }
            $sub = $line->variant_id ? Recipe::with('items')->where('variant_id', $line->variant_id)->where('is_active', true)->first() : null;   // a sauce made ahead
            if ($sub) {
                $inner = $this->walk($sub, $depth + 1, $seen);
                $out['allergens'] = array_merge($out['allergens'], $inner['allergens']);
                $out['tags'] = array_merge($out['tags'], $inner['tags']);
                $out['unknown'] += $inner['unknown'];

                continue;
            }
            $out['unknown']++;
        }

        return $out;
    }

    /**
     * How many of the dish could be sold at a branch now. Switched off, or marked sold out for today: none. Made to order: what the ingredients on the shelf allow.
     * Made ahead (or no recipe): what is on the shelf of the dish itself.
     */
    public function portions(Dish $dish, int $locationId): float
    {
        if (! $dish->is_active || ($dish->sold_out_on && $dish->sold_out_on->isToday())) {
            return 0.0;
        }
        $new = DishRecipes::installed();
        $dish->loadMissing(array_merge(['recipe.items'], $new ? ['menuRecipe'] : []));
        if ($new && $dish->menuRecipe && $dish->menuRecipe->is_active && $dish->menuRecipe->made_to_order) {
            return $this->use->capacity($dish->menuRecipe, $locationId);   // what the ingredients on the shelf allow
        }
        $r = $dish->recipe;
        if ($r && $r->is_active && $r->deduct_on_sale) {
            try {
                return $this->lines->capacity($r, $locationId, $this->batches);
            } catch (\App\Services\Books\BooksException) {
                return 0.0;   // an ingredient was removed or switched off: it can not be made until the recipe is fixed
            }
        }

        return round($this->batches->sellable((int) $dish->variant_id, $locationId), 4);
    }

    /** The price (before tax) and what the dish costs to make, and the margin. @return array{price: ?float, cost: ?float, margin: ?float, food_cost_pct: ?float, complete: bool} */
    public function money(Dish $dish, int $locationId): array
    {
        $price = DB::table('product_variant_units')->where('variant_id', $dish->variant_id)->where('role', 'base')->value('price');
        $price = $price === null ? null : (float) $price;
        $new = DishRecipes::installed();
        $dish->loadMissing(array_merge(['recipe.items'], $new ? ['menuRecipe.lines.ingredient'] : []));
        if ($new && $dish->menuRecipe) {
            $u = $this->use->cost($dish->menuRecipe, $locationId);
            $c = ['per_unit' => $u['per_portion'], 'complete' => $u['complete']];
        } else {
            $c = $dish->recipe ? $this->costing->for($dish->recipe, $locationId) : ['per_unit' => null, 'complete' => false];
        }
        $cost = $c['per_unit'];

        return ['price' => $price, 'cost' => $cost, 'margin' => $price !== null && $cost !== null ? round($price - $cost, 4) : null,
            'food_cost_pct' => $price && $cost !== null ? round($cost / $price * 100, 1) : null, 'complete' => (bool) $c['complete']];
    }
}
