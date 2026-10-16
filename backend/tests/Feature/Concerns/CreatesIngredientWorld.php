<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Menus\Dish;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Services\Books\VoucherService;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\Ingredients;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Menus' own ingredient stock (scripts 181 to 183): units, the three food accounts, the books stood in for (what they are asked to post or cancel is kept in $posted and $cancelled),
 * and helpers to make ingredients, put batches on the shelf and write a dish with a recipe.
 */
trait CreatesIngredientWorld
{
    use CreatesMenusTables, RunsSqlScripts;

    protected array $posted = [];
    protected array $cancelled = [];
    protected int $inventory;
    protected int $costOfSales;
    protected int $supplier;

    protected function createIngredientWorld(): void
    {
        $this->createMenusTables();
        $this->runSqlScripts('181_menus_ingredients_own.sql', '182_menus_ingredient_stock.sql', '183_menus_recipes_own.sql');
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->timestamps(); $t->softDeletes(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->string('status')->default('posted'); $t->unsignedBigInteger('location_id')->nullable(); $t->decimal('subtotal', 18, 2)->default(0); $t->decimal('tax_total', 18, 2)->default(0); $t->decimal('total_amount', 18, 2)->default(0); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedInteger('line_no')->default(1); $t->decimal('tax_amount', 18, 2)->default(0); });
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('opening_balance_ledger_id')->nullable(); $t->integer('edit_window_days')->default(30); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        Schema::create('menus_dishes', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->nullable(); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->date('sold_out_on')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('product_id')->nullable(); $t->timestamps(); });
        Schema::create('recipes', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->unique(); $t->decimal('yield_qty', 18, 4)->default(1); $t->boolean('deduct_on_sale')->default(false); $t->string('note')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });   // the older recipes, which a dish still falls back to
        Schema::create('recipe_items', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->default(0); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        DB::table('accounting_settings')->insert(['id' => 1, 'edit_window_days' => 30]);
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'purchase'], ['id' => 2, 'base_type' => 'journal']]);
        $stock = DB::table('ledger_groups')->insertGetId(['name' => 'Stock-in-hand']);
        $creditors = DB::table('ledger_groups')->insertGetId(['name' => 'Sundry Creditors']);
        $direct = DB::table('ledger_groups')->insertGetId(['name' => 'Direct Expenses']);
        $this->inventory = DB::table('ledgers')->insertGetId(['name' => 'Food Ingredients Inventory', 'group_id' => $stock]);
        $this->costOfSales = DB::table('ledgers')->insertGetId(['name' => 'Food Cost of Sales', 'group_id' => $direct]);
        DB::table('ledgers')->insert(['name' => 'Food Waste Expense', 'group_id' => $direct]);
        $this->supplier = DB::table('ledgers')->insertGetId(['name' => 'Naivas Wholesale', 'group_id' => $creditors]);

        $books = $this->createMock(VoucherService::class);
        $books->method('create')->willReturnCallback(function (array $d) {
            $this->posted[] = $d;
            $sub = collect($d['lines'] ?? [])->sum(fn ($l) => round($l['quantity'] * $l['rate'], 2)) ?: collect($d['entries'] ?? [])->where('side', 'D')->sum('amount');
            $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $d['voucher_type_id'], 'voucher_number' => 'V-'.count($this->posted), 'location_id' => $d['location_id'] ?? null,
                'subtotal' => $sub, 'tax_total' => 0, 'total_amount' => $sub, 'created_at' => now(), 'updated_at' => now()]);
            foreach (array_values($d['lines'] ?? []) as $i => $l) {
                DB::table('voucher_items')->insert(['voucher_id' => $id, 'line_no' => $i + 1, 'tax_amount' => 0]);
            }

            return Voucher::find($id);
        });
        $books->method('cancel')->willReturnCallback(function (Voucher $v, ?string $reason = null) {
            $this->cancelled[] = [$v->id, $reason];
            if (! empty($v->meta['menus_receipt_id'])) {
                app(IngredientReceiving::class)->beforeVoucherCancelled($v, null);
            }
            $v->update(['status' => 'cancelled']);

            return $v;
        });
        $this->app->instance(VoucherService::class, $books);
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

    protected function dish(string $name = 'Pancakes'): Dish
    {
        return Dish::create(['name' => $name, 'slug' => strtolower($name), 'is_active' => true]);
    }
}
