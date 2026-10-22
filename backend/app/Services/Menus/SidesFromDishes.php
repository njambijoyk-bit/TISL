<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\DishRecipeStep;
use App\Models\Menus\DishRecipeTime;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Giving today's dishes sides. Each dish that has a recipe gets a recipe of its own copied from it (the lines, the method and the times, counted in portions as before) and a side of the same
 * name made from the copy, with one portion in a serving. The dish keeps its own recipe, so selling works as before until selling through sides is switched on; the side remembers its dish so step 3
 * can build a one-side dish from it. Doing it again copies only what has not been copied.
 */
class SidesFromDishes
{
    /** Has script 201 been run (with 200)? */
    public static function installed(): bool
    {
        return Sides::installed() && Schema::hasColumn('menus_recipes', 'copied_from_recipe_id') && Schema::hasColumn('menus_sides', 'from_dish_id');
    }

    /**
     * What it would do now.
     *
     * @return array{ready: bool, dish_recipes: int, copied: int, pending: array<int, array{dish_id: int, dish: string, lines: int, name: string, made_to_order: bool}>}
     */
    public function preview(): array
    {
        if (! self::installed()) {
            return ['ready' => false, 'dish_recipes' => 0, 'copied' => 0, 'pending' => []];
        }
        $all = DishRecipe::with('dish')->whereNotNull('dish_id')->orderBy('id')->get();
        $done = DishRecipe::whereNotNull('copied_from_recipe_id')->pluck('copied_from_recipe_id')->map(fn ($i) => (int) $i)->all();
        $withSide = Side::whereNotNull('from_dish_id')->pluck('from_dish_id')->map(fn ($i) => (int) $i)->all();
        $taken = $this->takenNames();
        $pending = [];
        foreach ($all as $r) {
            if (in_array((int) $r->id, $done, true) && in_array((int) $r->dish_id, $withSide, true)) {
                continue;
            }
            $pending[] = ['dish_id' => (int) $r->dish_id, 'dish' => $r->dish?->name ?? 'A dish', 'lines' => $r->lines()->count(), 'name' => $this->freeName($r->dish?->name ?? 'Dish', (int) $r->dish_id, $taken), 'made_to_order' => (bool) $r->made_to_order];
        }

        return ['ready' => true, 'dish_recipes' => $all->count(), 'copied' => count($done), 'pending' => $pending];
    }

    /**
     * Copy what has not been copied.
     *
     * @return array{recipes: int, sides: int, already: int, before: array<string, int>, after: array<string, int>}
     */
    public function run(): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 201_menus_sides_from_dishes.sql first (with 194, 197 and 200 before it).');
        }
        $before = $this->counts();
        $recipes = 0;
        $sides = 0;
        $already = 0;
        $taken = $this->takenNames();
        foreach (DishRecipe::with('dish', 'lines', 'steps')->whereNotNull('dish_id')->orderBy('id')->get() as $orig) {
            DB::transaction(function () use ($orig, &$recipes, &$sides, &$already, &$taken) {
                $copy = DishRecipe::where('copied_from_recipe_id', $orig->id)->first();
                $hasSide = Side::where('from_dish_id', $orig->dish_id)->exists();
                if ($copy && $hasSide) {
                    $already++;

                    return;
                }
                $name = $copy?->name ?? $this->freeName($orig->dish?->name ?? 'Dish', (int) $orig->dish_id, $taken);
                $taken[mb_strtolower($name)] = true;
                if (! $copy) {
                    $copy = $this->copy($orig, $name);
                    $recipes++;
                }
                if (! $hasSide) {
                    $sideName = Side::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists() ? mb_substr($name, 0, 50).' (from dish '.$orig->dish_id.')' : $name;
                    Side::create(['name' => $sideName, 'recipe_id' => $copy->id, 'from_dish_id' => $orig->dish_id, 'base_amount' => 1, 'is_active' => (bool) $orig->is_active, 'sort_order' => (int) Side::max('sort_order') + 1]);
                    $sides++;
                }
            });
        }

        return ['recipes' => $recipes, 'sides' => $sides, 'already' => $already, 'before' => $before, 'after' => $this->counts()];
    }

    /** @return array<string, int> */
    private function counts(): array
    {
        return ['dish_recipes' => DishRecipe::whereNotNull('dish_id')->count(), 'copies' => DishRecipe::whereNotNull('copied_from_recipe_id')->count(), 'sides_from_dishes' => Side::whereNotNull('from_dish_id')->count(), 'sides' => Side::count()];
    }

    /** A recipe of its own copied from a dish's recipe: the same amounts, method and times, counted in portions, switched on as the original is. */
    private function copy(DishRecipe $orig, string $name): DishRecipe
    {
        $note = $orig->note ?: 'Copied from the recipe of the dish '.($orig->dish?->name ?? '').'.';
        $copy = DishRecipe::create(['dish_id' => null, 'copied_from_recipe_id' => $orig->id, 'name' => $name, 'yield_qty' => $orig->yield_qty, 'made_to_order' => $orig->made_to_order, 'note' => mb_substr($note, 0, 255),
            'visibility' => $orig->visibility, 'prep_minutes' => $orig->prep_minutes, 'cook_minutes' => $orig->cook_minutes, 'is_active' => $orig->is_active]);
        foreach ($orig->lines as $l) {
            DishRecipeLine::create(['recipe_id' => $copy->id, 'ingredient_id' => $l->ingredient_id, 'quantity' => $l->quantity, 'unit' => $l->unit, 'waste_pct' => $l->waste_pct, 'position' => $l->position]
                + (DishRecipes::hasSubLines() ? ['sub_recipe_id' => $l->sub_recipe_id] : []) + (DishRecipes::hasFlags() ? ['removable' => (bool) $l->removable, 'extra_allowed' => (bool) $l->extra_allowed] : []) + (DishRecipes::hasPins() ? ['item_id' => $l->item_id] : []));
        }
        foreach ($orig->steps as $st) {
            DishRecipeStep::create(['recipe_id' => $copy->id, 'position' => $st->position, 'body' => $st->body, 'minutes' => $st->minutes, 'image' => $st->image]);
        }
        if (RecipeTimes::installed()) {
            foreach ($orig->times as $t) {
                DishRecipeTime::create(['recipe_id' => $copy->id, 'up_to_qty' => $t->up_to_qty, 'minutes' => $t->minutes]);
            }
        }

        return $copy;
    }

    /** Every name a recipe of its own or a side already has, lower-cased. @return array<string, bool> */
    private function takenNames(): array
    {
        $names = DishRecipe::whereNotNull('name')->pluck('name')->merge(Side::pluck('name'));

        return $names->mapWithKeys(fn ($n) => [mb_strtolower((string) $n) => true])->all();
    }

    /** The dish's name when nothing has it, else the name with where it came from, so no two collide. @param array<string, bool> $taken */
    private function freeName(string $dish, int $dishId, array &$taken): string
    {
        $name = mb_substr(trim($dish), 0, 80) ?: 'Dish';
        foreach ([$name, mb_substr($name, 0, 60).' (from the dish)', mb_substr($name, 0, 50).' (from dish '.$dishId.')'] as $try) {
            if (! isset($taken[mb_strtolower($try)])) {
                $taken[mb_strtolower($try)] = true;

                return $try;
            }
        }

        return $name.' '.uniqid();
    }
}
