<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\DishRecipeStep;
use App\Models\Menus\DishRecipeTime;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Writing a dish's recipe on ingredients (Menus' own stock): the amounts for one batch, the waste in preparing each, and the method. */
class DishRecipes
{
    /** What a batch may be counted in (the units table's dimensions). */
    public const YIELD_DIMENSIONS = ['mass', 'volume', 'count'];

    /** How many levels of recipes may be nested (a recipe in a recipe in a recipe...). */
    public const MAX_DEPTH = 4;

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
        $c = $this->clean($d, $row);
        if ($row->exists && array_key_exists('is_active', $d) && ! $d['is_active'] && ($by = $this->usedBy((int) $row->id))) {
            throw new BooksException("{$name} is used in ".implode(', ', array_slice($by, 0, 3)).'. Take it out there before switching it off.');
        }
        if ($row->exists && array_key_exists('is_active', $d) && ! $d['is_active'] && ($sides = Sides::usingRecipe((int) $row->id))) {
            throw new BooksException("{$name} is the recipe of the side ".implode(', ', array_slice($sides, 0, 3)).'. Switch the side off or change it before switching the recipe off.');
        }
        if ($row->exists && self::has('yield_unit_id') && (int) $row->yield_unit_id !== (int) $c['unit'] && ($sides = Sides::usingRecipe((int) $row->id))) {
            throw new BooksException("{$name} is the recipe of the side ".implode(', ', array_slice($sides, 0, 3)).', whose amounts are written for its unit: change the side first.');
        }
        if ($row->exists && self::has('yield_unit_id') && (int) $row->yield_unit_id !== (int) $c['unit'] && self::madeInBatches((int) $row->id)) {
            throw new BooksException("{$name} has been made in a batch, so the unit it is counted in can not change.");
        }

        return DB::transaction(fn () => $this->store($row, $d, $c, $name));
    }

    /** Has this recipe been made in a batch (a dish batch or a prepared one)? */
    public static function madeInBatches(int $recipeId): bool
    {
        foreach (['menus_productions', 'menus_prep_runs'] as $table) {
            if (Schema::hasTable($table) && DB::table($table)->where('recipe_id', $recipeId)->exists()) {
                return true;
            }
        }

        return false;
    }

    /** Remove a recipe of its own. A dish's recipe goes with delete(). */
    public function deleteStandalone(int $id): void
    {
        $r = DishRecipe::findOrFail($id);
        if ($r->dish_id) {
            throw new BooksException("That is the recipe of {$r->title()}: remove it from the dish's row.");
        }
        if ($by = $this->usedBy((int) $r->id)) {
            throw new BooksException("{$r->title()} is used in ".implode(', ', array_slice($by, 0, 3)).(count($by) > 3 ? ' and more' : '').'. Take it out there first.');
        }
        if (self::madeInBatches((int) $r->id)) {
            throw new BooksException("{$r->title()} has been made in a batch, so it can not be removed. Switch it off instead.");
        }
        if ($sides = Sides::usingRecipe((int) $r->id)) {
            throw new BooksException("{$r->title()} is the recipe of the side ".implode(', ', array_slice($sides, 0, 3)).'. Change or remove the side first.');
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
    private function clean(array $d, ?DishRecipe $self = null): array
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
        $toOrder = (bool) ($d['made_to_order'] ?? true);
        foreach (array_values($d['lines'] ?? []) as $i => $l) {
            $row = $i + 1;
            $qty = round((float) ($l['quantity'] ?? 0), 4);
            if ($qty <= 0) {
                continue;   // an empty line is just left out
            }
            $flags = $this->flags($l, $row, $toOrder, empty($l['ingredient_id']) && ! empty($l['recipe_id']));
            if (empty($l['ingredient_id']) && ! empty($l['recipe_id'])) {
                $lines[] = $this->subLine($row, (int) $l['recipe_id'], $qty, round((float) ($l['waste_pct'] ?? 0), 2), $self, $seen, count($lines) + 1);
                continue;
            }
            $ing = Ingredient::with('baseUnit', 'altUnit')->find((int) ($l['ingredient_id'] ?? 0));
            if (! $ing) {
                throw new BooksException("Line {$row}: choose an ingredient or a recipe.");
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
            $lines[] = ['ingredient_id' => $ing->id, 'quantity' => $qty, 'unit' => $unit, 'waste_pct' => $waste, 'position' => count($lines) + 1] + $flags + $this->pin($l, $row, $ing);
        }
        if (! $lines) {
            throw new BooksException('Add at least one ingredient.');
        }

        return ['yield' => $yield, 'unit' => $yieldUnit?->id, 'times' => $times, 'visibility' => $visibility, 'lines' => $lines];
    }

    /**
     * The "may be removed" and "may have extra" flags of a line, checked: only an ingredient line of a recipe made to order can carry them (a cooked pot cannot lose its beef, and a recipe
     * inside a recipe is taken whole). Nothing is returned for a line that sets neither, so a recipe saved before script 205 is unaffected.
     *
     * @param array<string, mixed> $l
     * @return array{removable?: bool, extra_allowed?: bool}
     */
    private function flags(array $l, int $row, bool $toOrder, bool $isRecipe): array
    {
        $removable = ! empty($l['removable']);
        $extra = ! empty($l['extra_allowed']);
        if (! $removable && ! $extra) {
            return self::hasFlags() ? ['removable' => false, 'extra_allowed' => false] : [];
        }
        if (! self::hasFlags()) {
            throw new BooksException('Run database script 205_menus_recipe_line_flags.sql first: until then a line can not say it may be removed or have extra.');
        }
        if ($isRecipe) {
            throw new BooksException("Line {$row}: a recipe inside this recipe is taken as a whole. Only an ingredient can be left out or added to.");
        }
        if (! $toOrder) {
            throw new BooksException("Line {$row}: a recipe made ahead in batches cannot lose an ingredient once it is cooked. Make it to order, or untick it.");
        }

        return ['removable' => $removable, 'extra_allowed' => $extra];
    }

    /** What a recipe line that is another recipe looks like once it is checked. @param array<string, bool> $seen */
    private function subLine(int $row, int $recipeId, float $qty, float $waste, ?DishRecipe $self, array &$seen, int $position): array
    {
        if (! self::hasSubLines()) {
            throw new BooksException('Run database script 197_menus_recipes_in_recipes.sql first: until then a recipe can only be made of ingredients.');
        }
        $sub = DishRecipe::with('yieldUnit')->find($recipeId);
        if (! $sub) {
            throw new BooksException("Line {$row}: choose a recipe.");
        }
        $name = $sub->title();
        if ($sub->dish_id) {
            throw new BooksException("Line {$row}: {$name} is a dish's recipe. Only a recipe of its own can go inside another recipe.");
        }
        if (! $sub->is_active) {
            throw new BooksException("Line {$row}: the recipe {$name} is switched off.");
        }
        if ($self?->exists && ((int) $sub->id === (int) $self->id || in_array((int) $self->id, $this->usesAll((int) $sub->id), true))) {
            throw new BooksException("Line {$row}: {$name} already uses {$self->title()}, so {$self->title()} can not use {$name}: it would go round in a circle.");
        }
        if (1 + $this->depth((int) $sub->id) > self::MAX_DEPTH) {
            throw new BooksException("Line {$row}: {$name} is already made of recipes nested ".self::MAX_DEPTH.' deep. Keep recipes to '.self::MAX_DEPTH.' levels.');
        }
        if (isset($seen['r'.$sub->id])) {
            throw new BooksException("{$name} is listed twice: add the amounts together.");
        }
        $seen['r'.$sub->id] = true;
        if ($waste < 0 || $waste > 90) {
            throw new BooksException("Line {$row}: waste must be between 0 and 90 percent.");
        }

        return ['ingredient_id' => null, 'sub_recipe_id' => $sub->id, 'quantity' => $qty, 'unit' => 'base', 'waste_pct' => $waste, 'position' => $position];
    }

    /** The variant a line names, checked: one of this ingredient's own that may be used. Empty leaves it to the pick rule. @return array{item_id?: ?int} */
    private function pin(array $l, int $row, Ingredient $ing): array
    {
        $id = (int) ($l['item_id'] ?? 0);
        if (! self::hasPins()) {
            if ($id) {
                throw new BooksException('Run database script 225_menus_recipe_line_variant.sql first: until then a recipe line can not name a variant.');
            }

            return [];
        }
        if (! $id) {
            return ['item_id' => null];
        }
        $item = IngredientItem::where('id', $id)->where('ingredient_id', $ing->id)->first();
        if (! $item) {
            throw new BooksException("Line {$row}: that is not a variant of {$ing->name}.");
        }
        if (! $item->is_allowed || ! $item->is_active) {
            throw new BooksException("Line {$row}: {$item->name} may not be used (it is switched off or marked not to be used), so choose another or leave it on automatic.");
        }

        return ['item_id' => $id];
    }

    /** Has script 225 been run: can a recipe line name the variant it takes? */
    public static function hasPins(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('menus_recipe_lines', 'item_id');
        }

        return self::$columns['@pins'] ??= Schema::hasColumn('menus_recipe_lines', 'item_id');
    }

    /** Has script 205 been run: can a recipe line say it may be removed or have extra? */
    public static function hasFlags(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('menus_recipe_lines', 'removable');
        }

        return self::$columns['@flags'] ??= Schema::hasColumn('menus_recipe_lines', 'removable');
    }

    /** Has script 197 been run? */
    public static function hasSubLines(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('menus_recipe_lines', 'sub_recipe_id');
        }

        return self::$columns['@sub_lines'] ??= Schema::hasColumn('menus_recipe_lines', 'sub_recipe_id');
    }

    /** Every recipe a recipe uses, directly or through others. @return int[] */
    public function usesAll(int $recipeId): array
    {
        if (! self::hasSubLines()) {
            return [];
        }
        $seen = [];
        $todo = [$recipeId];
        while ($todo) {
            $next = DishRecipeLine::whereIn('recipe_id', $todo)->whereNotNull('sub_recipe_id')->pluck('sub_recipe_id')->map(fn ($i) => (int) $i)->unique()->all();
            $todo = array_values(array_diff($next, $seen));
            $seen = array_merge($seen, $todo);
        }

        return $seen;
    }

    /** The recipes that use this one directly: id => name. @return array<int, string> */
    public function usedBy(int $recipeId): array
    {
        if (! self::hasSubLines()) {
            return [];
        }
        $ids = DishRecipeLine::where('sub_recipe_id', $recipeId)->pluck('recipe_id')->unique();

        return DishRecipe::with('dish')->whereIn('id', $ids)->get()->mapWithKeys(fn (DishRecipe $r) => [(int) $r->id => $r->title()])->all();
    }

    /** How many levels of recipes a recipe is made of (0: only ingredients). */
    private function depth(int $recipeId, int $guard = 0): int
    {
        if (! self::hasSubLines() || $guard > self::MAX_DEPTH + 2) {
            return 0;
        }
        $subs = DishRecipeLine::where('recipe_id', $recipeId)->whereNotNull('sub_recipe_id')->pluck('sub_recipe_id');
        $max = 0;
        foreach ($subs as $id) {
            $max = max($max, 1 + $this->depth((int) $id, $guard + 1));
        }

        return $max;
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
