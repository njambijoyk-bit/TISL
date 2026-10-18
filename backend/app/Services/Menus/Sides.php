<?php

namespace App\Services\Menus;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Serving;
use App\Models\Menus\Side;
use App\Models\Menus\SideAmount;
use App\Models\Menus\Station;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The sides the kitchen serves: ugali, pilau, kale, a soda. A side is made from a recipe of its own, or is a ready-to-serve ingredient bought and sold as it is. It says how much goes in a
 * serving of each size (Jumbo 350 g, Kids 100 g); a size with no amount of its own gets the side's own amount (1 for a soda). The amounts may be written in a unit other than the recipe's
 * (grams for a recipe counted in kilograms) and are turned into the recipe's own unit when stock is worked out.
 */
class Sides
{
    /** Has script 200 been run (with 194, which recipes of their own need)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_sides') && Schema::hasTable('menus_side_amounts') && DishRecipes::has('name');
    }

    /** @return array<int, array<string, mixed>> */
    public function all(): array
    {
        return Side::with(['recipe.yieldUnit', 'ingredient.baseUnit', 'unit', 'station', 'amounts.serving'])->orderBy('sort_order')->orderBy('name')->get()->map(fn (Side $s) => $this->row($s))->values()->all();
    }

    /** @return array<string, mixed> */
    public function row(Side $s): array
    {
        $source = $this->sourceUnit($s);

        return [
            'id' => (int) $s->id, 'name' => $s->name, 'is_active' => (bool) $s->is_active, 'note' => $s->note, 'station_id' => $s->station_id ? (int) $s->station_id : null, 'station' => $s->station?->name,
            'recipe_id' => $s->recipe_id ? (int) $s->recipe_id : null, 'ingredient_id' => $s->ingredient_id ? (int) $s->ingredient_id : null,
            'made_from' => $s->recipe_id ? ($s->recipe?->title() ?? 'a recipe') : ($s->ingredient?->name ?? 'an ingredient'), 'kind' => $s->recipe_id ? 'recipe' : 'ready',
            'unit_id' => $s->unit_id ? (int) $s->unit_id : null, 'unit' => $s->unit?->code ?? $this->sourceLabel($s), 'source_unit' => $this->sourceLabel($s), 'dimension' => $source?->dimension,
            'base_amount' => (float) $s->base_amount,
            'amounts' => $s->amounts->sortBy(fn ($a) => $a->serving?->sort_order ?? 0)->map(fn (SideAmount $a) => ['serving_id' => (int) $a->serving_id, 'serving' => $a->serving?->name, 'amount' => (float) $a->amount])->values()->all(),
        ];
    }

    /** The unit the side's source is counted in: the recipe's, or the ingredient's base unit (null: portions). */
    public function sourceUnit(Side $s): ?UnitOfMeasure
    {
        return $s->recipe_id ? $s->recipe?->yieldUnit : $s->ingredient?->baseUnit;
    }

    private function sourceLabel(Side $s): string
    {
        return $this->sourceUnit($s)?->code ?? ($s->recipe_id ? 'portions' : 'each');
    }

    /**
     * How much of the side goes in a serving of this size, in the unit its source is counted in (the recipe's, or the ingredient's base unit): the size's own amount, else the side's.
     */
    public function amountFor(Side $s, ?int $servingId = null): float
    {
        $amount = (float) $s->base_amount;
        if ($servingId) {
            $own = $s->relationLoaded('amounts') ? $s->amounts->firstWhere('serving_id', $servingId) : $s->amounts()->where('serving_id', $servingId)->first();
            $amount = $own ? (float) $own->amount : $amount;
        }
        $source = $this->sourceUnit($s);
        if ($s->unit_id && $source && (int) $s->unit_id !== (int) $source->id) {
            $amount = ($s->relationLoaded('unit') ? $s->unit : $s->unit()->first())->convertTo($source, $amount);
        }

        return round($amount, 6);
    }

    /**
     * @param array{name?: string, recipe_id?: ?int, ingredient_id?: ?int, unit_id?: ?int, base_amount?: mixed, station_id?: ?int, note?: ?string, is_active?: bool, amounts?: array<int, array{serving_id: int, amount: mixed}>} $d
     */
    public function save(array $d, ?int $id = null): Side
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 200_menus_sides.sql first (and 194 before it).');
        }
        $name = mb_substr(trim((string) ($d['name'] ?? '')), 0, 80);
        if ($name === '') {
            throw new BooksException('Give the side a name.');
        }
        if (Side::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new BooksException("There is already a side called {$name}.");
        }
        $side = $id ? Side::findOrFail($id) : new Side(['sort_order' => (int) Side::max('sort_order') + 1, 'is_active' => true]);
        $recipeId = ! empty($d['recipe_id']) ? (int) $d['recipe_id'] : null;
        $ingredientId = ! empty($d['ingredient_id']) ? (int) $d['ingredient_id'] : null;
        if (($recipeId === null) === ($ingredientId === null)) {
            throw new BooksException('A side is made from one recipe, or is one ready-to-serve ingredient: choose one of the two.');
        }
        $recipe = null;
        $ingredient = null;
        if ($recipeId) {
            $recipe = DishRecipe::with('yieldUnit')->find($recipeId) ?? throw new BooksException('Choose the recipe the side is made from.');
            if ($recipe->dish_id) {
                throw new BooksException("{$recipe->title()} is a dish's recipe. A side is made from a recipe of its own.");
            }
            if (! $recipe->is_active && (int) $side->recipe_id !== $recipeId) {
                throw new BooksException("The recipe {$recipe->title()} is switched off.");
            }
        } else {
            $ingredient = Ingredient::with('baseUnit', 'kind')->find($ingredientId) ?? throw new BooksException('Choose the ingredient the side is.');
            if (! $ingredient->is_active && (int) $side->ingredient_id !== $ingredientId) {
                throw new BooksException("{$ingredient->name} is switched off.");
            }
            if (IngredientKinds::installed() && $ingredient->kind_id && ! $ingredient->kind?->sold_as_is) {
                throw new BooksException("{$ingredient->name} is of the kind {$ingredient->kind?->name}, which is not sold as it is. Use a ready-to-serve ingredient, or make the side from a recipe.");
            }
        }
        $source = $recipe ? $recipe->yieldUnit : $ingredient->baseUnit;
        $unit = null;
        if (! empty($d['unit_id'])) {
            $unit = UnitOfMeasure::find((int) $d['unit_id']);
            if (! $unit || ! $unit->is_active) {
                throw new BooksException('That unit is not available.');
            }
            if (! $source) {
                throw new BooksException('This side is counted in portions: leave the unit as it is.');
            }
            if ($unit->dimension !== $source->dimension) {
                throw new BooksException("Write the amounts in {$source->name} or a unit that measures the same ({$source->dimension}), not {$unit->name}.");
            }
        }
        $base = round((float) ($d['base_amount'] ?? 1), 4);
        if ($base <= 0) {
            throw new BooksException('Say how much of it goes in a serving (more than nothing).');
        }
        if (! empty($d['station_id']) && ! Station::whereKey((int) $d['station_id'])->where('is_active', true)->exists()) {
            throw new BooksException('Choose a station that is switched on, or leave it empty.');
        }
        $amounts = $this->cleanAmounts((array) ($d['amounts'] ?? []));
        $note = isset($d['note']) && trim((string) $d['note']) !== '' ? mb_substr(trim((string) $d['note']), 0, 255) : null;

        return DB::transaction(function () use ($side, $name, $recipeId, $ingredientId, $unit, $base, $d, $amounts, $note) {
            $side->fill(['name' => $name, 'recipe_id' => $recipeId, 'ingredient_id' => $ingredientId, 'unit_id' => $unit?->id, 'base_amount' => $base, 'station_id' => ! empty($d['station_id']) ? (int) $d['station_id'] : null, 'note' => $note]);
            if (array_key_exists('is_active', $d)) {
                $side->is_active = (bool) $d['is_active'];
            }
            $side->save();
            if (array_key_exists('amounts', $d)) {
                $side->amounts()->delete();
                foreach ($amounts as $serving => $amount) {
                    SideAmount::create(['side_id' => $side->id, 'serving_id' => $serving, 'amount' => $amount]);
                }
            }

            return $side->fresh(['recipe.yieldUnit', 'ingredient.baseUnit', 'unit', 'station', 'amounts.serving']);
        });
    }

    /** @param array<int, array{serving_id: mixed, amount: mixed}> $rows @return array<int, float> serving id => amount */
    private function cleanAmounts(array $rows): array
    {
        $out = [];
        foreach (array_values($rows) as $i => $r) {
            if (($r['amount'] ?? '') === '' || ($r['amount'] ?? null) === null) {
                continue;   // no amount of its own: the side's amount is used
            }
            $serving = Serving::find((int) ($r['serving_id'] ?? 0));
            if (! $serving) {
                throw new BooksException('Amounts row '.($i + 1).': choose one of the servings on your list.');
            }
            $amount = round((float) $r['amount'], 4);
            if ($amount <= 0) {
                throw new BooksException("{$serving->name}: the amount must be more than nothing (leave it empty to use the side's own amount).");
            }
            if (isset($out[$serving->id])) {
                throw new BooksException("{$serving->name} is listed twice.");
            }
            $out[(int) $serving->id] = $amount;
        }

        return $out;
    }

    public function delete(int $id): void
    {
        $side = Side::findOrFail($id);
        DB::transaction(function () use ($side) {
            $side->amounts()->delete();
            $side->delete();
        });
    }

    /** The sides a recipe is the source of: id => name. @return array<int, string> */
    public static function usingRecipe(int $recipeId): array
    {
        return self::installed() ? Side::where('recipe_id', $recipeId)->pluck('name', 'id')->all() : [];
    }

    /** The sides an ingredient is: id => name. @return array<int, string> */
    public static function usingIngredient(int $ingredientId): array
    {
        return self::installed() ? Side::where('ingredient_id', $ingredientId)->pluck('name', 'id')->all() : [];
    }
}
