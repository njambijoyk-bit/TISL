<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientFamily;
use App\Models\Menus\IngredientVariant;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/** Making and changing ingredient families and the stock items under them. */
class IngredientFamilies
{
    /**
     * @param array{name: string, unit_id: int, pick_rule?: string, allergens?: array, tags?: array, notes?: ?string, is_active?: bool, variants?: array<int, array{variant_id: int, units_per_stock: float, is_allowed?: bool, sell_retail?: bool}>} $d
     * the variants are in order of preference (the first is the preferred one)
     */
    public function save(array $d, ?int $id = null): IngredientFamily
    {
        $name = trim((string) $d['name']);
        if ($name === '') {
            throw new BooksException('Give the ingredient a name.');
        }
        if (IngredientFamily::where('name', $name)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new BooksException("There is already an ingredient called {$name}.");
        }
        $rule = $d['pick_rule'] ?? 'preferred';
        if (! array_key_exists($rule, IngredientFamily::PICK_RULES)) {
            throw new BooksException('Choose how the kitchen picks between the items: the preferred one, the cheapest, or the one that expires first.');
        }
        $unit = UnitOfMeasure::find((int) $d['unit_id']);
        if (! $unit) {
            throw new BooksException('Choose the unit recipes use for this ingredient (grams, millilitres, each...).');
        }
        foreach ([['allergens', FoodTags::ALLERGENS, 'allergen'], ['tags', FoodTags::TAGS, 'tag']] as [$key, $known, $word]) {
            if ($bad = FoodTags::unknown($d[$key] ?? [], $known)) {
                throw new BooksException('Unknown '.$word.': '.implode(', ', $bad).'.');
            }
        }
        $variants = array_values($d['variants'] ?? []);
        $ids = array_map(fn ($v) => (int) $v['variant_id'], $variants);
        if (count($ids) !== count(array_unique($ids))) {
            throw new BooksException('The same item is listed twice.');
        }
        foreach ($variants as $v) {
            if ((float) ($v['units_per_stock'] ?? 0) <= 0) {
                throw new BooksException('Say how much of '.$unit->code.' one stock unit of each item holds (a 2 kg pack in grams is 2000).');
            }
        }
        if ($ids) {
            $taken = IngredientVariant::whereIn('variant_id', $ids)->when($id, fn ($q) => $q->where('family_id', '!=', $id))->with('family:id,name')->first();
            if ($taken) {
                $item = $this->itemName((int) $taken->variant_id);
                throw new BooksException("{$item} is already in {$taken->family->name}. An item can belong to one ingredient only.");
            }
            $missing = array_diff($ids, DB::table('product_variants')->whereIn('id', $ids)->pluck('id')->map(fn ($i) => (int) $i)->all());
            if ($missing) {
                throw new BooksException('One of the items is not in the catalogue.');
            }
        }

        return DB::transaction(function () use ($d, $id, $name, $rule, $variants, $ids) {
            $family = IngredientFamily::updateOrCreate(['id' => $id], [
                'name' => $name, 'unit_id' => (int) $d['unit_id'], 'pick_rule' => $rule,
                'allergens' => FoodTags::clean($d['allergens'] ?? [], FoodTags::ALLERGENS), 'tags' => FoodTags::clean($d['tags'] ?? [], FoodTags::TAGS),
                'notes' => isset($d['notes']) && trim((string) $d['notes']) !== '' ? mb_substr(trim((string) $d['notes']), 0, 255) : null, 'is_active' => (bool) ($d['is_active'] ?? true),
            ]);
            $family->variants()->whereNotIn('variant_id', $ids ?: [0])->delete();
            foreach ($variants as $i => $v) {
                IngredientVariant::updateOrCreate(['variant_id' => (int) $v['variant_id']], [
                    'family_id' => $family->id, 'rank' => $i + 1, 'units_per_stock' => round((float) $v['units_per_stock'], 6),
                    'is_allowed' => (bool) ($v['is_allowed'] ?? true), 'sell_retail' => (bool) ($v['sell_retail'] ?? false),
                ]);
            }
            $this->hideFromShop($family);

            return $family->load('variants');
        });
    }

    public function delete(IngredientFamily $family): void
    {
        if (\Illuminate\Support\Facades\Schema::hasColumn('recipe_items', 'family_id') && DB::table('recipe_items')->where('family_id', $family->id)->exists()) {
            throw new BooksException("{$family->name} is used in a recipe. Take it out of the recipe first, or switch the ingredient off instead.");
        }
        DB::transaction(function () use ($family) {
            $family->variants()->delete();
            $family->delete();
        });
    }

    /** Ingredients are not for sale in the shop unless said so: the products behind them are hidden (only when every item of the product is an ingredient kept off the shop). */
    private function hideFromShop(IngredientFamily $family): void
    {
        foreach ($family->variants as $v) {
            if ($v->sell_retail) {
                continue;
            }
            $productId = DB::table('product_variants')->where('id', $v->variant_id)->value('product_id');
            if (! $productId) {
                continue;
            }
            $others = DB::table('product_variants')->where('product_id', $productId)->pluck('id');
            $kept = IngredientVariant::whereIn('variant_id', $others)->where('sell_retail', false)->count();
            if ($kept === $others->count()) {
                DB::table('products')->where('id', $productId)->update(['is_for_sale' => false, 'is_visible' => false]);
            }
        }
    }

    private function itemName(int $variantId): string
    {
        $r = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $variantId)->first(['p.name', 'pv.name as variant']);

        return $r ? trim($r->name.($r->variant ? ' — '.$r->variant : '')) : "Item {$variantId}";
    }

    /** What one stock unit of an item holds in the family's unit, worked out from the item's net content when it has one (null when it can not be told). */
    public function suggestUnitsPerStock(int $variantId, UnitOfMeasure $familyUnit): ?float
    {
        $v = DB::table('product_variants')->where('id', $variantId)->first(['net_content_qty', 'net_content_unit_id']);
        if (! $v || ! $v->net_content_unit_id || (float) $v->net_content_qty <= 0) {
            return null;
        }
        $from = UnitOfMeasure::find($v->net_content_unit_id);
        if (! $from || $from->dimension !== $familyUnit->dimension) {
            return null;
        }

        return round($from->convertTo($familyUnit, (float) $v->net_content_qty), 6);
    }
}
