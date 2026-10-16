<?php

namespace Tests\Feature\Concerns;

use App\Models\Menus\Dish;
use App\Services\CurrencyConversionService;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishService;
use App\Services\Menus\MenusSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** On top of Menus' own stock tables: the sales account, the Menus settings, dishes made through the service, with the licence and currency stood in for. Nothing here is a product. */
trait CreatesDishTables
{
    use CreatesFoodTables;

    private int $ledger;

    protected function createDishTables(): void
    {
        $this->createFoodTables();
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->string('behaviour')->nullable(); $t->json('settings')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->string('tax_nature')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->timestamps(); });
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        $this->mock(CurrencyConversionService::class, fn ($m) => $m->shouldReceive('getBaseCurrency')->andReturn((new \App\Models\Currency())->forceFill(['id' => 1])));
        $group = DB::table('ledger_groups')->insertGetId(['name' => 'Sales Accounts', 'behaviour' => 'sales']);
        $this->ledger = DB::table('ledgers')->insertGetId(['name' => 'Food sales', 'group_id' => $group, 'tax_nature' => 'taxable']);
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('dish_id')->nullable(); });
        MenusSettings::save(['sales_ledger_id' => $this->ledger], null);
    }

    /** The tables a dish delete or a save touches beyond the dish: its choices, the menus it is on and its category. For tests that do not build the whole counter world. */
    protected function createDishNeighbours(): void
    {
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('ingredient_id')->nullable(); $t->string('unit', 4)->default('base'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->unique(['section_id', 'dish_id']); });
        Schema::create('categories', function ($t) { $t->id(); $t->string('name'); });
        DB::table('categories')->insert(['id' => 1, 'name' => 'General']);
    }

    protected function dishes(): DishService
    {
        return app(DishService::class);
    }

    /** A dish made through the service (its own price; the sales account is the one in the Menus settings). */
    protected function make(string $name = 'Chapati', float $price = 50, array $o = []): Dish
    {
        return $this->dishes()->save(['name' => $name, 'price' => $price] + $o);
    }

    protected function info(): DishInfo
    {
        return app(DishInfo::class);
    }

    /** An ingredient (grams, one variant of the same name) by name, made once; the id. `$o` can carry allergens and tags. The extra arguments are accepted for the old call shape and ignored. */
    protected function family(string $name, array $o = [], array $ignored = []): int
    {
        return \App\Models\Menus\Ingredient::where('name', $name)->value('id') ?? $this->makeIngredient($name, $this->g, null, [['name' => $name]], 'preferred', $o)->id;
    }

    /** Write a dish's recipe from [['family_id' | 'variant_id' => an ingredient, 'quantity' => grams]] lines. */
    protected function recipe(Dish $d, array $items, float $yield = 1, bool $onSale = true): \App\Models\Menus\DishRecipe
    {
        return $this->writeRecipe($d, array_map(fn ($i) => [(int) ($i['family_id'] ?? $i['variant_id']), $i['quantity']], $items), $onSale, $yield);
    }
}
