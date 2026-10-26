<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;
use App\Services\Menus\DishRecipes;
use Illuminate\Support\Facades\Schema;

/**
 * Menus → Recipes of their own (not a dish's recipe): one row per ingredient line, the rows of one recipe tied together by its name. The
 * ingredients (or recipes) it names must already be in the system, so a recipes file is refused with a plain reason until they are.
 */
class RecipesEntity extends AbstractEntity
{
    public function key(): string
    {
        return 'menus.recipes';
    }

    public function module(): string
    {
        return 'menus';
    }

    public function label(): string
    {
        return 'Recipes';
    }

    public function description(): string
    {
        return 'Recipes of their own: one row per ingredient, the rows of a recipe share its name. Needs the ingredients to be in the system first.';
    }

    public function groupBy(): ?string
    {
        return 'name';
    }

    public function requires(): array
    {
        return [[
            'label' => 'Ingredients', 'entity' => 'menus.ingredients',
            'present' => fn () => Schema::hasTable('menus_ingredients') && Ingredient::query()->exists(),
        ]];
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Recipe', 'text', ['max' => 120, 'aliases' => ['recipe'], 'example' => 'Tomato base', 'help' => 'Repeat it on every row of the recipe. Must not already be a recipe.']),
            $this->optional('yield_qty', 'Makes', 'number', ['example' => '4', 'help' => 'How much one batch makes (portions, or the yield unit). Empty means 1.']),
            $this->optional('yield_unit', 'Yield unit', 'text', ['example' => '', 'help' => 'A weight, volume or count unit; empty means portions.']),
            $this->optional('visibility', 'Visibility', 'enum', ['options' => array_keys(DishRecipe::VISIBILITY), 'example' => 'internal', 'help' => 'internal = the kitchen only; public = may be shown on the website.']),
            $this->optional('made_to_order', 'Made to order', 'boolean', ['example' => 'yes', 'help' => 'Empty means yes.']),
            $this->optional('prep_minutes', 'Prep minutes', 'integer', ['example' => '10']),
            $this->optional('cook_minutes', 'Cook minutes', 'integer', ['example' => '25']),
            $this->optional('note', 'Note', 'text', ['max' => 255]),
            $this->optional('ingredient', 'Ingredient', 'text', ['perRow' => true, 'example' => 'Tomatoes', 'help' => 'An ingredient already in the system. Give this or Recipe line, not both.']),
            $this->optional('recipe_line', 'Recipe line', 'text', ['perRow' => true, 'aliases' => ['subrecipe'], 'example' => '', 'help' => 'Another recipe of its own to use whole, instead of an ingredient.']),
            $this->required('quantity', 'Quantity', 'number', ['perRow' => true, 'example' => '500', 'help' => 'In the ingredient\'s unit (see Unit).']),
            $this->optional('unit', 'Unit', 'text', ['perRow' => true, 'example' => 'g', 'help' => 'The ingredient\'s base or alternate unit (or base / alt). Empty means the base unit.']),
            $this->optional('waste_pct', 'Waste %', 'number', ['perRow' => true, 'example' => '5', 'help' => '0 to 90.']),
        ];
    }

    public function examples(): array
    {
        $head = ['name' => 'Tomato base', 'yield_qty' => '4', 'yield_unit' => '', 'visibility' => 'internal', 'made_to_order' => 'yes', 'prep_minutes' => '10', 'cook_minutes' => '25', 'note' => ''];

        return [
            $head + ['ingredient' => 'Tomatoes', 'recipe_line' => '', 'quantity' => '500', 'unit' => 'g', 'waste_pct' => '5'],
            $head + ['ingredient' => 'Wheat flour', 'recipe_line' => '', 'quantity' => '50', 'unit' => 'g', 'waste_pct' => ''],
        ];
    }

    public function check(array $r, ImportContext $ctx): void
    {
        if (! DishRecipes::has('name')) {
            throw new RowProblem('Recipes of their own are not set up on this installation yet (database script 194).', RowProblem::NOT_ALLOWED);
        }
        if (DishRecipe::whereRaw('LOWER(name) = ?', [mb_strtolower($r['name'])])->exists()) {
            throw new RowProblem("There is already a recipe called {$r['name']}.", RowProblem::EXISTS, 'name');
        }
        if ($this->str($r, 'yield_unit') && ! $ctx->unit($r['yield_unit'])) {
            throw new RowProblem("The yield unit \"{$r['yield_unit']}\" is not in Units.", RowProblem::MISSING_REF, 'yield_unit');
        }
        foreach ($r['_lines'] as $l) {
            $this->line($l, $ctx);
        }
    }

    /** One line: exactly one of an ingredient or a recipe, that exists, in a unit it has. @return array{ingredient_id?: int, recipe_id?: int, unit: string} */
    private function line(array $l, ImportContext $ctx): array
    {
        $row = $l['_row'];
        $ing = $this->str($l, 'ingredient');
        $sub = $this->str($l, 'recipe_line');
        if ($ing && $sub) {
            throw new RowProblem('Give an ingredient or a recipe on a row, not both.', RowProblem::INVALID, 'ingredient', $row);
        }
        if (! $ing && ! $sub) {
            throw new RowProblem('Each row needs an ingredient (or a recipe line).', RowProblem::REQUIRED, 'ingredient', $row);
        }
        if ($sub) {
            $recipe = DishRecipe::whereRaw('LOWER(name) = ?', [mb_strtolower($sub)])->whereNull('dish_id')->first();
            if (! $recipe) {
                throw new RowProblem("The recipe \"{$sub}\" is not in the system. A recipe used inside another has to exist first.", RowProblem::MISSING_REF, 'recipe_line', $row);
            }

            return ['recipe_id' => $recipe->id, 'unit' => 'base'];
        }
        $i = Ingredient::with('baseUnit', 'altUnit')->whereRaw('LOWER(name) = ?', [mb_strtolower($ing)])->first();
        if (! $i) {
            throw new RowProblem("The ingredient \"{$ing}\" is not in the system. Import or add it first (Menus → Ingredients).", RowProblem::MISSING_REF, 'ingredient', $row);
        }
        $unit = mb_strtolower($this->str($l, 'unit') ?? 'base');
        $is = fn ($u) => $u && ($unit === mb_strtolower($u->code) || $unit === mb_strtolower($u->name));
        $which = match (true) {
            $unit === 'base', $is($i->baseUnit) => 'base',
            $unit === 'alt', $is($i->altUnit) => 'alt',
            default => throw new RowProblem("{$i->name} is measured in {$i->baseUnit->code}".($i->altUnit ? " or {$i->altUnit->code}" : '').", not \"{$l['unit']}\".", RowProblem::INVALID, 'unit', $row),
        };

        return ['ingredient_id' => $i->id, 'unit' => $which];
    }

    public function store(array $r, ImportContext $ctx): void
    {
        $lines = [];
        foreach ($r['_lines'] as $l) {
            $ref = $this->line($l, $ctx);
            $lines[] = $ref + ['quantity' => $l['quantity'], 'waste_pct' => $l['waste_pct'] ?? 0];
        }
        app(DishRecipes::class)->saveStandalone([
            'name' => $r['name'],
            'yield_qty' => $r['yield_qty'] ?? 1,
            'yield_unit_id' => $this->str($r, 'yield_unit') ? $ctx->unit($r['yield_unit'])->id : null,
            'visibility' => $r['visibility'] ?? 'internal',
            'made_to_order' => $r['made_to_order'] ?? true,
            'prep_minutes' => $r['prep_minutes'] ?? null,
            'cook_minutes' => $r['cook_minutes'] ?? null,
            'note' => $r['note'] ?? null,
            'lines' => $lines,
        ]);
    }
}
