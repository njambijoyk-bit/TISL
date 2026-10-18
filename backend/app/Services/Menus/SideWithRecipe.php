<?php

namespace App\Services\Menus;

use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * A side and the recipe it is made from, made in one go from the guided dish screen (a new "wet fry" while setting up a dish). The recipe is one of its own, named after the side, and it is
 * made to order unless said otherwise. Either both are made or neither is.
 */
class SideWithRecipe
{
    public function __construct(private DishRecipes $recipes, private Sides $sides)
    {
    }

    /**
     * @param array{name?: string, yield_qty?: mixed, made_to_order?: bool, lines?: array<int, array<string, mixed>>, base_amount?: mixed, station_id?: ?int, note?: ?string} $d
     * @return array{side: Side, recipe: \App\Models\Menus\DishRecipe}
     */
    public function make(array $d): array
    {
        $name = mb_substr(trim((string) ($d['name'] ?? '')), 0, 80);
        if ($name === '') {
            throw new BooksException('Give the side a name.');
        }
        if (empty($d['lines'])) {
            throw new BooksException('Say what the side is made of: add at least one ingredient.');
        }

        return DB::transaction(function () use ($d, $name) {
            $recipe = $this->recipes->saveStandalone(['name' => $name, 'yield_qty' => $d['yield_qty'] ?? 1, 'made_to_order' => (bool) ($d['made_to_order'] ?? true), 'lines' => $d['lines']]);
            $side = $this->sides->save(['name' => $name, 'recipe_id' => $recipe->id, 'base_amount' => $d['base_amount'] ?? 1, 'station_id' => $d['station_id'] ?? null, 'note' => $d['note'] ?? null]);

            return ['side' => $side, 'recipe' => $recipe];
        });
    }
}
