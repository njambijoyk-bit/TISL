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
        $this->runSqlScripts('181_menus_ingredients_own.sql', '182_menus_ingredient_stock.sql', '183_menus_recipes_own.sql', '184_menus_dishes_own.sql', '185_menus_operations_own.sql');
        // the columns script 185 adds with its helper procedure (the test runner only reads CREATE TABLE and plain ADD COLUMN)
        Schema::table('menus_ingredient_items', fn ($t) => $t->decimal('reorder_level', 18, 4)->nullable());
        // the core stock count (script 30) and script 187's tables and columns for ingredients on it
        if (! Schema::hasTable('stock_counts')) {
            Schema::create('stock_counts', function ($t) {
                $t->id(); $t->string('number', 30)->nullable(); $t->unsignedBigInteger('location_id'); $t->string('status', 10)->default('open'); $t->string('note')->nullable(); $t->unsignedBigInteger('created_by')->nullable();
                $t->unsignedBigInteger('posted_by')->nullable(); $t->dateTime('posted_at')->nullable(); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('ingredient_voucher_id')->nullable(); $t->timestamps();
            });
            Schema::create('stock_count_lines', function ($t) {
                $t->id(); $t->unsignedBigInteger('count_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('batch_id'); $t->decimal('expected_qty', 18, 4); $t->decimal('counted_qty', 18, 4)->nullable(); $t->decimal('unit_cost', 18, 4)->default(0);
            });
        }
        if (! Schema::hasTable('stock_transfers')) {
            Schema::create('stock_transfers', function ($t) {
                $t->id(); $t->string('number', 30)->nullable(); $t->unsignedBigInteger('from_location_id'); $t->unsignedBigInteger('to_location_id'); $t->string('status', 12)->default('in_transit'); $t->string('note')->nullable();
                $t->unsignedBigInteger('sent_by')->nullable(); $t->dateTime('sent_at')->nullable(); $t->unsignedBigInteger('received_by')->nullable(); $t->dateTime('received_at')->nullable(); $t->timestamps();
            });
            Schema::create('stock_transfer_lines', function ($t) {
                $t->id(); $t->unsignedBigInteger('transfer_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('batch_id'); $t->decimal('quantity', 18, 4); $t->decimal('received_qty', 18, 4)->nullable(); $t->decimal('unit_cost', 18, 4)->default(0);
            });
        }
        $this->runSqlScripts('187_menus_core_stock.sql');
        // script 187's columns on the lots (the books' own tables are made by the tests that need them)
        Schema::table('menus_stock_batches', function ($t) { $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('voucher_item_id')->nullable(); });
        Schema::create('menus_waste', function ($t) {
            $t->id(); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('item_id')->nullable(); $t->unsignedBigInteger('dish_id')->nullable(); $t->decimal('quantity', 18, 4);
            $t->decimal('cost', 14, 2)->default(0); $t->string('kind', 12); $t->string('note', 200)->nullable(); $t->json('voucher_ids')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->date('wasted_on');
            $t->dateTime('voided_at')->nullable(); $t->unsignedBigInteger('voided_by')->nullable(); $t->timestamps();
        });
        Schema::create('menus_dishes', function ($t) {
            $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->text('description')->nullable(); $t->string('photo')->nullable(); $t->unsignedBigInteger('product_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable();
            $t->decimal('price', 18, 2)->default(0); $t->unsignedSmallInteger('prep_minutes')->nullable(); $t->json('allergens_override')->nullable(); $t->json('tags_override')->nullable(); $t->date('sold_out_on')->nullable();
            $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
    }

    /** @param array<int, array{name: string, pack?: float (in the base unit), level?: float (the level to keep, base unit), expires?: bool, allowed?: bool, active?: bool}> $variants */
    protected function makeIngredient(string $name, int $base, ?int $alt, array $variants, string $rule = 'preferred', array $extra = []): Ingredient
    {
        return app(Ingredients::class)->save($extra + ['name' => $name, 'base_unit_id' => $base, 'alt_unit_id' => $alt, 'pick_rule' => $rule, 'variants' => array_map(fn ($v) => [
            'name' => $v['name'], 'track_expiry' => $v['expires'] ?? false, 'is_allowed' => $v['allowed'] ?? true, 'is_active' => $v['active'] ?? true,
            'pack_size' => $v['pack'] ?? null, 'reorder_level' => $v['level'] ?? null,
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

    /**
     * Make a dish sellable: made to order, it gets a one-line recipe on a private ingredient (one each per portion) with that many on the shelf; made ahead, that many portions are
     * on the shelf already made. The tests that only need "a dish with N portions available" use this.
     */
    protected function stockDish(Dish $d, float $portions, bool $toOrder = true, float $cost = 10.0): void
    {
        if ($toOrder) {
            $name = 'Portion of '.$d->name;
            $this->pantry($name, $portions, $cost, $this->each);
            $this->writeRecipe($d, [[$name, 1]], true);

            return;
        }
        $this->writeRecipe($d, [[$this->pantry('Base of '.$d->name, 0, 1, $this->each)->name, 1]], false);
        \App\Models\Menus\DishBatch::create(['dish_id' => $d->id, 'location_id' => self::BRANCH, 'made_on' => '2026-10-01', 'unit_cost' => $cost, 'qty_in' => $portions, 'qty_left' => $portions, 'status' => 'ok']);
    }
}
