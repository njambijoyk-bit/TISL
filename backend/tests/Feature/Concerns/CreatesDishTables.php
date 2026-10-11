<?php

namespace Tests\Feature\Concerns;

use App\Models\Menus\Dish;
use App\Models\Recipe;
use App\Services\CurrencyConversionService;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishService;
use App\Services\Menus\IngredientFamilies;
use App\Services\Menus\RecipeLines;
use App\Services\SkuGenerator;
use App\Services\Stock\RecipeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** On top of the Menus tables: recipes, products and variants as they really are, ledgers, dishes and the Menus settings, with the licence, currency and SKU generator stood in for. */
trait CreatesDishTables
{
    use CreatesMenusTables;

    private int $ledger;

    protected function createDishTables(): void
    {
        $this->createMenusTables();
        Schema::create('recipes', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->unique(); $t->decimal('yield_qty', 18, 4)->default(1); $t->boolean('deduct_on_sale')->default(false); $t->string('note')->nullable(); $t->boolean('is_active')->default(true); $t->string('visibility', 12)->default('internal'); $t->unsignedSmallInteger('prep_minutes')->nullable(); $t->unsignedSmallInteger('cook_minutes')->nullable(); $t->timestamps(); });
        Schema::create('recipe_items', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); $t->decimal('waste_pct', 5, 2)->default(0); $t->decimal('quantity', 18, 4); });
        Schema::create('recipe_steps', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedSmallInteger('position')->default(1); $t->text('body'); $t->unsignedSmallInteger('minutes')->nullable(); $t->string('image')->nullable(); $t->timestamps(); });
        Schema::create('productions', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); });
        Schema::create('stock_movements', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->nullable(); });
        Schema::create('categories', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->string('behaviour')->nullable(); $t->json('settings')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->string('tax_nature')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->timestamps(); });
        Schema::create('menus_dishes', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->text('description')->nullable(); $t->string('photo')->nullable(); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id')->unique(); $t->unsignedSmallInteger('prep_minutes')->nullable(); $t->json('allergens_override')->nullable(); $t->json('tags_override')->nullable(); $t->date('sold_out_on')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::table('products', function ($t) { foreach (['slug', 'sku', 'type'] as $c) { $t->string($c)->nullable(); } $t->unsignedBigInteger('category_id')->nullable(); $t->decimal('price', 18, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('default_unit_id')->nullable(); $t->boolean('in_stock')->default(true); $t->decimal('stock_quantity', 18, 4)->default(0); $t->string('status')->nullable(); $t->boolean('track_expiry')->default(false); $t->unsignedBigInteger('sales_ledger_id')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->decimal('sellable_quantity', 18, 4)->default(0); });
        Schema::table('product_variants', function ($t) { $t->string('combination_key')->nullable(); $t->boolean('is_default')->default(false); $t->decimal('stock_quantity', 18, 4)->default(0); $t->string('status')->nullable(); $t->decimal('sellable_quantity', 18, 4)->default(0); $t->softDeletes(); });
        Schema::create('product_variant_units', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('unit_id'); $t->string('role')->default('base'); $t->unsignedBigInteger('contains_variant_unit_id')->nullable(); $t->decimal('contains_qty', 18, 4)->nullable(); $t->decimal('base_factor', 18, 10)->default(1); $t->decimal('price', 18, 2)->nullable(); $t->decimal('compare_at_price', 18, 2)->nullable(); $t->boolean('is_sellable')->default(true); $t->boolean('is_purchasable')->default(true); $t->boolean('is_default_sale')->default(false); $t->integer('position')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('variant_location_stock', function ($t) { $t->id(); $t->unsignedBigInteger('product_variant_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 18, 4)->default(0); $t->decimal('reorder_level', 18, 4)->nullable(); $t->timestamps(); });
        Schema::table('locations', fn ($t) => $t->integer('sort_order')->default(0));
        RecipeLines::forget();
        RecipeService::forget();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        $this->mock(CurrencyConversionService::class, fn ($m) => $m->shouldReceive('getBaseCurrency')->andReturn((new \App\Models\Currency())->forceFill(['id' => 1])));
        $this->app->instance(SkuGenerator::class, new class extends SkuGenerator {
            private int $n = 0;

            public function __construct() {}

            public function generate(): string
            {
                return 'SKU'.(++$this->n);
            }
        });
        $group = DB::table('ledger_groups')->insertGetId(['name' => 'Sales Accounts', 'behaviour' => 'sales']);
        $this->ledger = DB::table('ledgers')->insertGetId(['name' => 'Food sales', 'group_id' => $group, 'tax_nature' => 'taxable']);
        DB::table('categories')->insert(['id' => 1, 'name' => 'Menu']);
    }

    protected function dishes(): DishService
    {
        return app(DishService::class);
    }

    protected function make(string $name = 'Chapati', float $price = 50, array $o = []): Dish
    {
        return $this->dishes()->save(['name' => $name, 'price' => $price, 'sales_ledger_id' => $this->ledger] + $o);
    }

    protected function recipe(Dish $d, array $items, float $yield = 1, bool $onSale = true): Recipe
    {
        return app(RecipeService::class)->save((int) $d->variant_id, $yield, $onSale, null, $items);
    }

    protected function family(string $name, array $o = [], array $items = []): int
    {
        return app(IngredientFamilies::class)->save(['name' => $name, 'unit_id' => $this->g, 'variants' => array_map(fn ($i) => ['variant_id' => $i[0], 'units_per_stock' => $i[1]], $items)] + $o)->id;
    }

    protected function info(): DishInfo
    {
        return app(DishInfo::class);
    }

}
