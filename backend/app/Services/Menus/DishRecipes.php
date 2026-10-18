<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\DishRecipeStep;
use App\Models\Menus\DishRecipeTime;
use App\Models\Menus\Ingredient;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Writing a dish's recipe on ingredients (Menus' own stock): the amounts for one batch, the waste in preparing each, and the method. */
class DishRecipes
{
    /** What a batch may be counted in (the units table's dimensions). */
    public const YIELD_DIMENSIONS = ['mass', 'volume', 'count'];

    private static ?bool $installed = null;

    /** @var array<string, bool> */
    private static array $columns = [];

    /** Is a column the later scripts add there yet? (`name` is script 194's, `yield_unit_id` is 195's.) */
    public static function has(string $column): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('menus_recipes', $column);
        }

        return self::$columns[$column] ??= Schema::hasColumn('menus_recipes', $column);
    }

    /** Has script 183 been run? Until it has, dishes keep using the older recipes. */
    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_recipes');
        }

        return self::$installed ??= Schema::hasTable('menus_recipes');
    }

    /**
     * @param array{yield_qty?: float, yield_unit_id?: ?int, times?: array<int, array{up_to: mixed, minutes: mixed}>, made_to_order?: bool, note?: ?string, visibility?: string, prep_minutes?: ?int, cook_minutes?: ?int, is_active?: bool,
     *              lines: array<int, array{ingredient_id: int, quantity: float, unit?: string, waste_pct?: float}>, steps?: array<int, array{body: string, minutes?: ?int, image?: ?string}>} $d
     */
    public function save(Dish $dish, array $d): DishRecipe
    {
        if (! empty($d['yield_unit_id'])) {
            throw new BooksException("{$dish->name}'s recipe counts portions. A unit (kilograms, litres, pieces) is for a recipe of its own.");
        }
        $c = $this->clean($d);

        return DB::transaction(fn () => $this->store(DishRecipe::firstOrNew(['dish_id' => $dish->id]), $d, $c));
    }

    /**
     * A recipe of its own, not tied to a dish. `$d` is the same as for a dish's recipe plus `name`.
     *
     * @param array<string, mixed> $d
     */
    public function saveStandalone(array $d, ?int $id = null): DishRecipe
    {
        if (! self::has('name')) {
            throw new BooksException('Run database script 194_menus_recipes_stand_alone.sql first: until then a recipe can only belong to a dish.');
        }
        $name = mb_substr(trim((string) ($d['name'] ?? '')), 0, 120);
        if ($name === '') {
            throw new BooksException('Give the recipe a name.');
        }
        $row = $id ? DishRecipe::findOrFail($id) : new DishRecipe();
        if ($row->dish_id) {
            throw new BooksException("That is the recipe of {$row->title()}: change it from the dish's row.");
        }
        if (DishRecipe::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new BooksException("There is already a recipe called {$name}.");
        }
        $c = $this->clean($d);

        return DB::transaction(fn () => $this->store($row, $d, $c, $name));
    }

    /** Remove a recipe of its own. A dish's recipe goes with delete(). */
    public function deleteStandalone(int $id): void
    {
        $r = DishRecipe::findOrFail($id);
        if ($r->dish_id) {
            throw new BooksException("That is the recipe of {$r->title()}: remove it from the dish's row.");
        }
        if (Schema::hasTable('menus_productions') && DB::table('menus_productions')->where('recipe_id', $r->id)->exists()) {
            throw new BooksException("{$r->title()} has been made in a batch, so it can not be removed. Switch it off instead.");
        }
        DB::transaction(function () use ($r) {
            $r->lines()->delete();
            $r->steps()->delete();
            if (RecipeTimes::installed()) {
                $r->times()->delete();
            }
            $r->delete();
        });
    }

    /** The yield, who may see it and the lines, checked and tidied. @return array{yield: float, unit: ?int, times: ?array, visibility: string, lines: array<int, array<string, mixed>>} */
    private function clean(array $d): array
    {
        $yield = round((float) ($d['yield_qty'] ?? 1), 4);
        if ($yield <= 0) {
            throw new BooksException('The recipe must make more than nothing: say how many portions one batch makes.');
        }
        $yieldUnit = null;
        if (! empty($d['yield_unit_id'])) {
            if (! self::has('yield_unit_id')) {
                throw new BooksException('Run database script 195_menus_recipe_yield_unit.sql first: until then a batch is counted in portions only.');
            }
            $yieldUnit = UnitOfMeasure::find((int) $d['yield_unit_id']);
            if (! $yieldUnit || ! $yieldUnit->is_active || ! in_array($yieldUnit->dimension, self::YIELD_DIMENSIONS, true)) {
                throw new BooksException('Count a batch in a weight, a volume or a number of pieces: choose one of the units offered, or leave it as portions.');
            }
        }
        $times = null;
        if (array_key_exists('times', $d)) {
            $times = RecipeTimes::clean((array) $d['times']);
            if ($times && ! RecipeTimes::installed()) {
                throw new BooksException('Run database script 196_menus_recipe_times.sql first: until then the time by batch size can not be saved.');
            }
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
            if (! IngredientKinds::allowedInRecipe($ing)) {
                throw new BooksException("Line {$row}: {$ing->name} is of the kind ".$ing->kind?->name.', which is not used in recipes. Change its kind under Menus, Ingredients.');
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

        return ['yield' => $yield, 'unit' => $yieldUnit?->id, 'times' => $times, 'visibility' => $visibility, 'lines' => $lines];
    }

    /** @param array{yield: float, unit: ?int, times: ?array, visibility: string, lines: array<int, array<string, mixed>>} $c */
    private function store(DishRecipe $r, array $d, array $c, ?string $name = null): DishRecipe
    {
        $r->fill([
            'yield_qty' => $c['yield'], 'made_to_order' => (bool) ($d['made_to_order'] ?? true), 'visibility' => $c['visibility'], 'is_active' => (bool) ($d['is_active'] ?? true),
            'note' => isset($d['note']) && trim((string) $d['note']) !== '' ? mb_substr(trim((string) $d['note']), 0, 255) : null,
            'prep_minutes' => isset($d['prep_minutes']) && $d['prep_minutes'] !== '' ? max(0, (int) $d['prep_minutes']) : null,
            'cook_minutes' => isset($d['cook_minutes']) && $d['cook_minutes'] !== '' ? max(0, (int) $d['cook_minutes']) : null,
        ]);
        if ($name !== null) {
            $r->name = $name;
        }
        if (self::has('yield_unit_id')) {
            $r->yield_unit_id = $c['unit'];
        }
        $r->save();
        $r->lines()->delete();
        foreach ($c['lines'] as $l) {
            DishRecipeLine::create(['recipe_id' => $r->id] + $l);
        }
        if ($c['times'] !== null && RecipeTimes::installed()) {
            $r->times()->delete();
            foreach ($c['times'] as $t) {
                DishRecipeTime::create(['recipe_id' => $r->id] + $t);
            }
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

        return $r->load(array_merge(['lines', 'steps'], RecipeTimes::installed() ? ['times'] : []));
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
            if (RecipeTimes::installed()) {
                $r->times()->delete();
            }
            $r->delete();
        });
    }
}
