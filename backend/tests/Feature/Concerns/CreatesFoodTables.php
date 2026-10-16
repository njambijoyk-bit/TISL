<?php

namespace Tests\Feature\Concerns;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\Ingredients;
use Illuminate\Support\Facades\Schema;

/**
 * Menus' own stock for the tests (scripts 181 to 184): units, a branch, ingredients with variants, batches on the shelf, dishes with a price of their own and recipes written on ingredients.
 * Nothing here is a product.
 */
trait CreatesFoodTables
{
    use CreatesMenusTables, RunsSqlScripts;

    protected function createFoodTables(): void
    {
        $this->createMenusTables();
        $this->runSqlScripts('181_menus_ingredients_own.sql', '182_menus_ingredient_stock.sql', '183_menus_recipes_own.sql', '184_menus_dishes_own.sql');
        Schema::create('menus_dishes', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->text('description')->nullable(); $t->string('photo')->nullable(); $t->unsignedBigInteger('product_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable();
            $t->decimal('price', 18, 2)->default(0); $t->unsignedSmallInteger('prep_minutes')->nullable(); $t->json('allergens_override')->nullable(); $t->json('tags_override')->nullable(); $t->date('sold_out_on')->nullable();
            $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
    }

    /** @param array<int, array{name: string, pack?: float, expires?: bool, allowed?: bool, active?: bool}> $variants */
    protected function makeIngredient(string $name, int $base, ?int $alt, array $variants, string $rule = 'preferred', array $extra = []): Ingredient
    {
        return app(Ingredients::class)->save($extra + ['name' => $name, 'base_unit_id' => $base, 'alt_unit_id' => $alt, 'pick_rule' => $rule, 'variants' => array_map(fn ($v) => [
            'name' => $v['name'], 'track_expiry' => $v['expires'] ?? false, 'is_allowed' => $v['allowed'] ?? true, 'is_active' => $v['active'] ?? true,
        ], $variants)]);
    }

    protected function itemId(string $name): int
    {
        return (int) IngredientItem::where('name', $name)->value('id');
    }

    /** A lot on the shelf: base-unit quantity, cost per base unit, expiry. */
    protected function shelve(string $item, float $qty, float $cost = 1.0, ?string $expiry = null, int $location = 1, string $status = 'ok'): StockBatch
    {
        return StockBatch::create(['item_id' => $this->itemId($item), 'location_id' => $location, 'received_on' => '2026-10-01', 'expiry_date' => $expiry, 'unit_cost' => $cost, 'qty_in' => $qty, 'qty_left' => $qty, 'status' => $status, 'source' => 'purchase']);
    }

    /** A dish with a price of its own and, when lines are given, a recipe: lines are [ingredient name, amount in the base unit]. */
    protected function dish(string $name = 'Pancakes', float $price = 100, array $lines = [], bool $toOrder = true, float $yield = 1): Dish
    {
        $dish = Dish::create(['name' => $name, 'slug' => \Illuminate\Support\Str::slug($name).'-'.(Dish::count() + 1), 'price' => $price, 'is_active' => true]);
        if ($lines) {
            $this->writeRecipe($dish, $lines, $toOrder, $yield);
        }

        return $dish;
    }

    protected function writeRecipe(Dish $dish, array $lines, bool $toOrder = true, float $yield = 1): DishRecipe
    {
        return app(DishRecipes::class)->save($dish, ['made_to_order' => $toOrder, 'yield_qty' => $yield, 'lines' => array_map(fn ($l) => [
            'ingredient_id' => is_int($l[0]) ? $l[0] : (int) \Illuminate\Support\Facades\DB::table('menus_ingredients')->where('name', $l[0])->value('id'), 'quantity' => $l[1], 'unit' => $l[2] ?? 'base', 'waste_pct' => $l[3] ?? 0,
        ], $lines)]);
    }

    /** An ingredient with one variant of the same name (in grams unless a unit is given) and, when a quantity is given, that much on the shelf at the branch. */
    protected function pantry(string $name, float $qty = 0, float $cost = 1.0, ?int $unit = null): Ingredient
    {
        $ing = Ingredient::where('name', $name)->first() ?? $this->makeIngredient($name, $unit ?? $this->g, null, [['name' => $name]]);
        if ($qty > 0) {
            $this->shelve($name, $qty, $cost);
        }

        return $ing;
    }
}
