<?php

namespace App\Services\Menus;

use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Making and changing ingredients and their variants (Menus' own stock, no product behind them). An ingredient has a base unit and may have an alternate unit of the same
 * kind; both come from the units table, so the conversions are the ones the rest of the system uses. A variant may carry a pack size, in either unit, that is kept in the base unit.
 */
class Ingredients
{
    /**
     * @param array{name: string, base_unit_id: int, alt_unit_id?: ?int, pick_rule?: string, allergens?: array, tags?: array, notes?: ?string, is_active?: bool, variants?: array<int, array{id?: ?int, name: string, code?: ?string, pack_size?: mixed, pack_unit_id?: ?int, track_expiry?: bool, is_allowed?: bool, is_active?: bool}>} $d
     * the variants are in order of preference (the first is the preferred one)
     */
    public function save(array $d, ?int $id = null): Ingredient
    {
        $name = trim((string) $d['name']);
        if ($name === '') {
            throw new BooksException('Give the ingredient a name.');
        }
        if (Ingredient::where('name', $name)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new BooksException("There is already an ingredient called {$name}.");
        }
        $rule = $d['pick_rule'] ?? 'preferred';
        if (! array_key_exists($rule, Ingredient::PICK_RULES)) {
            throw new BooksException('Choose how the kitchen picks between the variants: the preferred one, the cheapest, or the one that expires first.');
        }
        $base = UnitOfMeasure::find((int) ($d['base_unit_id'] ?? 0));
        if (! $base || ! $base->is_active) {
            throw new BooksException('Choose the base unit: the smallest one the ingredient is measured in (grams, millilitres, each...).');
        }
        $alt = null;
        if (! empty($d['alt_unit_id'])) {
            $alt = UnitOfMeasure::find((int) $d['alt_unit_id']);
            if (! $alt || ! $alt->is_active) {
                throw new BooksException('The alternate unit is not available.');
            }
            if ($alt->id === $base->id) {
                throw new BooksException('The alternate unit must be a different unit from the base unit (kilograms for grams).');
            }
            if ($alt->dimension !== $base->dimension) {
                throw new BooksException("The alternate unit must measure the same thing as the base unit: {$base->name} and {$alt->name} are different kinds ({$base->dimension} and {$alt->dimension}).");
            }
        }
        foreach ([['allergens', FoodTags::allergens(), 'allergen'], ['tags', FoodTags::tags(), 'tag']] as [$key, $known, $word]) {
            if ($bad = FoodTags::unknown($d[$key] ?? [], $known)) {
                throw new BooksException('Unknown '.$word.': '.implode(', ', $bad).'.');
            }
        }
        $purchase = ! empty($d['purchase_ledger_id']) ? (int) $d['purchase_ledger_id'] : null;
        if ($purchase && ($problem = \App\Services\Books\TradingAccounts::problem($purchase, 'purchase'))) {
            throw new BooksException($problem);
        }
        $variants = $this->variants(array_values($d['variants'] ?? []), $base, $alt);
        $existing = $id ? Ingredient::findOrFail($id)->variants()->get()->keyBy('id') : collect();
        foreach ($variants as $v) {
            if ($v['id'] && ! $existing->has($v['id'])) {
                throw new BooksException('One of the variants does not belong to this ingredient.');
            }
        }
        $keep = array_values(array_filter(array_column($variants, 'id')));
        foreach ($existing->except($keep) as $gone) {
            $this->assertCanRemove($gone);
        }

        return DB::transaction(function () use ($d, $id, $name, $rule, $base, $alt, $variants, $keep, $existing, $purchase) {
            $ingredient = Ingredient::updateOrCreate(['id' => $id], [
                'name' => $name, 'base_unit_id' => $base->id, 'alt_unit_id' => $alt?->id, 'pick_rule' => $rule,
                'allergens' => FoodTags::clean($d['allergens'] ?? [], FoodTags::allergens()), 'tags' => FoodTags::clean($d['tags'] ?? [], FoodTags::tags()),
                'notes' => isset($d['notes']) && trim((string) $d['notes']) !== '' ? mb_substr(trim((string) $d['notes']), 0, 255) : null, 'is_active' => (bool) ($d['is_active'] ?? true),
            ] + (Schema::hasColumn('menus_ingredients', 'purchase_ledger_id') ? ['purchase_ledger_id' => $purchase] : []));   // (once script 189 is run)
            if ($existing->isNotEmpty()) {
                // a variant whose name is being taken by another in the same save would clash on the unique name: move the changing ones aside first
                foreach ($existing as $e) {
                    IngredientItem::whereKey($e->id)->update(['name' => '~'.$e->id.'~'.$e->name]);
                }
            }
            IngredientItem::where('ingredient_id', $ingredient->id)->whereNotIn('id', $keep ?: [0])->delete();
            foreach ($variants as $i => $v) {
                $row = ['ingredient_id' => $ingredient->id, 'name' => $v['name'], 'code' => $v['code'], 'pack_size' => $v['pack_size'], 'track_expiry' => $v['track_expiry'], 'preference' => $i + 1, 'is_allowed' => $v['is_allowed'], 'is_active' => $v['is_active']];
                if (\Illuminate\Support\Facades\Schema::hasColumn('menus_ingredient_items', 'reorder_level')) {   // script 185
                    $row['reorder_level'] = $v['reorder_level'];
                }
                if ($v['id']) {
                    IngredientItem::whereKey($v['id'])->update($row + ['updated_at' => now()]);
                } else {
                    IngredientItem::create($row);
                }
            }

            return $ingredient->load('variants');
        });
    }

    public function delete(Ingredient $ingredient): void
    {
        foreach ($ingredient->variants as $v) {
            $this->assertCanRemove($v);
        }
        $this->assertNotInRecipe($ingredient);
        DB::transaction(function () use ($ingredient) {
            $ingredient->variants()->delete();
            $ingredient->delete();
        });
    }

    /** @return array<int, array{id: ?int, name: string, code: ?string, pack_size: ?float, track_expiry: bool, is_allowed: bool, is_active: bool, reorder_level: ?float}> */
    private function variants(array $in, UnitOfMeasure $base, ?UnitOfMeasure $alt): array
    {
        $out = [];
        $seen = [];
        foreach ($in as $v) {
            $name = trim((string) ($v['name'] ?? ''));
            if ($name === '') {
                throw new BooksException('Give every variant a name (Exe, Pembe, Soko...).');
            }
            if (isset($seen[mb_strtolower($name)])) {
                throw new BooksException("The variant {$name} is listed twice.");
            }
            $seen[mb_strtolower($name)] = true;
            $out[] = [
                'id' => ! empty($v['id']) ? (int) $v['id'] : null, 'name' => mb_substr($name, 0, 120),
                'code' => isset($v['code']) && trim((string) $v['code']) !== '' ? mb_substr(trim((string) $v['code']), 0, 40) : null,
                'pack_size' => $this->packSize($v, $base, $alt, $name),
                'track_expiry' => (bool) ($v['track_expiry'] ?? false), 'is_allowed' => (bool) ($v['is_allowed'] ?? true), 'is_active' => (bool) ($v['is_active'] ?? true),
                'reorder_level' => $this->level($v, $name),
            ];
        }

        return $out;
    }

    /** The least to keep on the shelf, in the base unit (empty for no level). */
    private function level(array $v, string $name): ?float
    {
        if (! isset($v['reorder_level']) || $v['reorder_level'] === '' || $v['reorder_level'] === null) {
            return null;
        }
        $n = (float) $v['reorder_level'];
        if ($n < 0) {
            throw new BooksException("The level to keep of {$name} can not be below nothing.");
        }

        return $n > 0 ? round($n, 4) : null;
    }

    /** The pack size in the base unit. It can be typed in the base unit or the alternate one (2 in kg is 2000 g). */
    private function packSize(array $v, UnitOfMeasure $base, ?UnitOfMeasure $alt, string $name): ?float
    {
        if (! isset($v['pack_size']) || $v['pack_size'] === '' || $v['pack_size'] === null) {
            return null;
        }
        $size = (float) $v['pack_size'];
        if ($size <= 0) {
            throw new BooksException("The pack size of {$name} must be more than nothing, or left empty.");
        }
        $in = $base;
        if (! empty($v['pack_unit_id']) && (int) $v['pack_unit_id'] !== $base->id) {
            if (! $alt || (int) $v['pack_unit_id'] !== $alt->id) {
                throw new BooksException("The pack size of {$name} can be given in {$base->code}".($alt ? " or {$alt->code}" : '').' only.');
            }
            $in = $alt;
        }

        return round($in->convertTo($base, $size), 6);
    }

    /** Stock and purchases arrive in the next step; a variant that has been bought or counted can then not be deleted, only switched off. */
    private function assertCanRemove(IngredientItem $item): void
    {
        foreach (['menus_stock_batches', 'menus_stock_moves'] as $table) {
            if (\Illuminate\Support\Facades\Schema::hasTable($table) && DB::table($table)->where('item_id', $item->id)->exists()) {
                throw new BooksException("{$item->name} has stock history, so it cannot be deleted. Switch it off instead.");
            }
        }
    }

    /** Recipes arrive on ingredients in a later step; until then nothing uses one. */
    private function assertNotInRecipe(Ingredient $ingredient): void
    {
        if (\Illuminate\Support\Facades\Schema::hasTable('menus_recipe_lines') && DB::table('menus_recipe_lines')->where('ingredient_id', $ingredient->id)->exists()) {
            throw new BooksException("{$ingredient->name} is used in a recipe. Take it out of the recipe first, or switch the ingredient off instead.");
        }
    }
}
