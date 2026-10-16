<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\DishRecipeStep;
use App\Models\Menus\Ingredient;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Writing a dish's recipe on ingredients (Menus' own stock): the amounts for one batch, the waste in preparing each, and the method. */
class DishRecipes
{
    private static ?bool $installed = null;

    /** Has script 183 been run? Until it has, dishes keep using the older recipes. */
    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_recipes');
        }

        return self::$installed ??= Schema::hasTable('menus_recipes');
    }

    /**
     * @param array{yield_qty?: float, made_to_order?: bool, note?: ?string, visibility?: string, prep_minutes?: ?int, cook_minutes?: ?int, is_active?: bool,
     *              lines: array<int, array{ingredient_id: int, quantity: float, unit?: string, waste_pct?: float}>, steps?: array<int, array{body: string, minutes?: ?int, image?: ?string}>} $d
     */
    public function save(Dish $dish, array $d): DishRecipe
    {
        $yield = round((float) ($d['yield_qty'] ?? 1), 4);
        if ($yield <= 0) {
            throw new BooksException('The recipe must make more than nothing: say how many portions one batch makes.');
        }
        $visibility = $d['visibility'] ?? 'internal';
        if (! array_key_exists($visibility, DishRecipe::VISIBILITY)) {
            throw new BooksException('Choose who may see this recipe: the kitchen only, or the website too.');
        }
        $lines = [];
        $seen = [];
        foreach (array_values($d['lines'] ?? []) as $i => $l) {
            $row = $i + 1;
            $qty = round((float) ($l['quantity'] ?? 0), 4);
            if ($qty <= 0) {
                continue;   // an empty line is just left out
            }
            $ing = Ingredient::with('baseUnit', 'altUnit')->find((int) ($l['ingredient_id'] ?? 0));
            if (! $ing) {
                throw new BooksException("Line {$row}: choose an ingredient.");
            }
            if (! $ing->is_active) {
                throw new BooksException("Line {$row}: {$ing->name} is switched off.");
            }
            if (isset($seen[$ing->id])) {
                throw new BooksException("{$ing->name} is listed twice: add the amounts together.");
            }
            $seen[$ing->id] = true;
            $unit = (string) ($l['unit'] ?? 'base');
            if (! in_array($unit, ['base', 'alt'], true)) {
                throw new BooksException("Line {$row}: use the ingredient's base or alternate unit.");
            }
            if ($unit === 'alt' && ! $ing->altUnit) {
                throw new BooksException("Line {$row}: {$ing->name} has no alternate unit, so write the amount in {$ing->baseUnit->code}.");
            }
            $waste = round((float) ($l['waste_pct'] ?? 0), 2);
            if ($waste < 0 || $waste > 90) {
                throw new BooksException("Line {$row}: waste must be between 0 and 90 percent.");
            }
            $lines[] = ['ingredient_id' => $ing->id, 'quantity' => $qty, 'unit' => $unit, 'waste_pct' => $waste, 'position' => count($lines) + 1];
        }
        if (! $lines) {
            throw new BooksException('Add at least one ingredient.');
        }

        return DB::transaction(function () use ($dish, $d, $yield, $visibility, $lines) {
            $r = DishRecipe::updateOrCreate(['dish_id' => $dish->id], [
                'yield_qty' => $yield, 'made_to_order' => (bool) ($d['made_to_order'] ?? true), 'visibility' => $visibility, 'is_active' => (bool) ($d['is_active'] ?? true),
                'note' => isset($d['note']) && trim((string) $d['note']) !== '' ? mb_substr(trim((string) $d['note']), 0, 255) : null,
                'prep_minutes' => isset($d['prep_minutes']) && $d['prep_minutes'] !== '' ? max(0, (int) $d['prep_minutes']) : null,
                'cook_minutes' => isset($d['cook_minutes']) && $d['cook_minutes'] !== '' ? max(0, (int) $d['cook_minutes']) : null,
            ]);
            $r->lines()->delete();
            foreach ($lines as $l) {
                DishRecipeLine::create(['recipe_id' => $r->id] + $l);
            }
            if (array_key_exists('steps', $d)) {
                $r->steps()->delete();
                $n = 0;
                foreach ((array) $d['steps'] as $step) {
                    if (trim((string) ($step['body'] ?? '')) === '') {
                        continue;
                    }
                    DishRecipeStep::create(['recipe_id' => $r->id, 'position' => ++$n, 'body' => trim((string) $step['body']), 'minutes' => $step['minutes'] ?? null, 'image' => $step['image'] ?? null]);
                }
            }

            return $r->load('lines', 'steps');
        });
    }

    public function delete(Dish $dish): void
    {
        $r = DishRecipe::where('dish_id', $dish->id)->first();
        if (! $r) {
            return;
        }
        DB::transaction(function () use ($r) {
            $r->lines()->delete();
            $r->steps()->delete();
            $r->delete();
        });
    }
}
