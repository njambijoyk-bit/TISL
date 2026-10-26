<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Menus\Ingredient;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;
use App\Services\Menus\FoodTags;
use App\Services\Menus\Ingredients;

/** Menus → Ingredients: "Wheat flour" in grams (kilograms for buying), with the variants that are bought (Exe, Pembe, Soko). Made through the same service as the Ingredients screen. */
class IngredientsEntity extends AbstractEntity
{
    public function key(): string
    {
        return 'menus.ingredients';
    }

    public function module(): string
    {
        return 'menus';
    }

    public function label(): string
    {
        return 'Ingredients';
    }

    public function description(): string
    {
        return 'The things the kitchen cooks with: a name, the unit it is measured in, and the variants (brands) it is bought as.';
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Name', 'text', ['max' => 120, 'example' => 'Wheat flour', 'help' => 'Must not already be an ingredient.']),
            $this->required('base_unit', 'Base unit', 'text', ['example' => 'g', 'aliases' => ['unit'], 'help' => 'The smallest unit stock is kept in: a unit code or name from Units (g, ml, each...).']),
            $this->optional('alt_unit', 'Alternate unit', 'text', ['example' => 'kg', 'help' => 'For buying and counting. Must measure the same thing as the base unit.']),
            $this->optional('pick_rule', 'Pick rule', 'enum', ['options' => array_keys(Ingredient::PICK_RULES), 'example' => 'preferred', 'help' => 'Which variant the kitchen takes first. Empty means the preferred one.']),
            $this->optional('allergens', 'Allergens', 'list', ['example' => 'wheat;gluten', 'help' => 'Several, separated by ; — each one must be a known allergen.']),
            $this->optional('tags', 'Tags', 'list', ['example' => 'gluten', 'help' => 'Diet tags, separated by ; — each one must be a known tag.']),
            $this->optional('notes', 'Notes', 'text', ['max' => 255]),
            $this->optional('is_active', 'Active', 'boolean', ['example' => 'yes', 'help' => 'Empty means yes.']),
            $this->optional('variants', 'Variants', 'list', ['example' => 'Exe;Pembe;Soko', 'help' => 'Names separated by ;, most preferred first.']),
        ];
    }

    public function examples(): array
    {
        return [
            ['name' => 'Wheat flour', 'base_unit' => 'g', 'alt_unit' => 'kg', 'pick_rule' => 'preferred', 'allergens' => 'wheat', 'tags' => 'gluten', 'notes' => '', 'is_active' => 'yes', 'variants' => 'Exe;Pembe'],
            ['name' => 'Tomatoes', 'base_unit' => 'g', 'alt_unit' => 'kg', 'pick_rule' => 'cheapest', 'allergens' => '', 'tags' => '', 'notes' => 'Fresh, from the market', 'is_active' => 'yes', 'variants' => ''],
        ];
    }

    public function check(array $r, ImportContext $ctx): void
    {
        if (Ingredient::whereRaw('LOWER(name) = ?', [mb_strtolower($r['name'])])->exists()) {
            throw new RowProblem("There is already an ingredient called {$r['name']}.", RowProblem::EXISTS, 'name');
        }
        foreach (['base_unit', 'alt_unit'] as $col) {
            if ($this->str($r, $col) && ! $ctx->unit($r[$col])) {
                throw new RowProblem("The unit \"{$r[$col]}\" is not in Units. Use a unit's code or name.", RowProblem::MISSING_REF, $col);
            }
        }
        foreach (['allergens' => FoodTags::allergens(), 'tags' => FoodTags::tags()] as $col => $known) {
            if (! empty($r[$col]) && ($bad = FoodTags::unknown($r[$col], $known))) {
                throw new RowProblem('Unknown '.rtrim($col, 's').': '.implode(', ', $bad).'. Known: '.implode(', ', array_keys($known)).'.', RowProblem::MISSING_REF, $col);
            }
        }
    }

    public function store(array $r, ImportContext $ctx): void
    {
        app(Ingredients::class)->save([
            'name' => $r['name'],
            'base_unit_id' => $ctx->unit($r['base_unit'])->id,
            'alt_unit_id' => $this->str($r, 'alt_unit') ? $ctx->unit($r['alt_unit'])->id : null,
            'pick_rule' => $r['pick_rule'] ?? 'preferred',
            'allergens' => $r['allergens'] ?? [],
            'tags' => $r['tags'] ?? [],
            'notes' => $r['notes'] ?? null,
            'is_active' => $r['is_active'] ?? true,
            'variants' => array_map(fn ($n) => ['name' => $n], $r['variants'] ?? []),
        ]);
    }
}
