<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusDishController;
use App\Models\Menus\Dish;
use App\Models\Product;
use App\Models\Recipe;
use App\Services\Books\BooksException;
use App\Services\CurrencyConversionService;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\DietBadges;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishService;
use App\Services\Menus\IngredientFamilies;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\RecipeLines;
use App\Services\SkuGenerator;
use App\Services\Stock\RecipeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus steps 1.3 and 1.4: dishes with a hidden stock item, allergens and diets inherited from the ingredients, what can be made now, what it costs, and the settings. */
class MenusDishesTest extends TestCase
{
    use Concerns\CreatesMenusTables;

    private int $ledger;

    protected function setUp(): void
    {
        parent::setUp();
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

    private function dishes(): DishService
    {
        return app(DishService::class);
    }

    private function make(string $name = 'Chapati', float $price = 50, array $o = []): Dish
    {
        return $this->dishes()->save(['name' => $name, 'price' => $price, 'sales_ledger_id' => $this->ledger] + $o);
    }

    private function recipe(Dish $d, array $items, float $yield = 1, bool $onSale = true): Recipe
    {
        return app(RecipeService::class)->save((int) $d->variant_id, $yield, $onSale, null, $items);
    }

    private function family(string $name, array $o = [], array $items = []): int
    {
        return app(IngredientFamilies::class)->save(['name' => $name, 'unit_id' => $this->g, 'variants' => array_map(fn ($i) => ['variant_id' => $i[0], 'units_per_stock' => $i[1]], $items)] + $o)->id;
    }

    private function info(): DishInfo
    {
        return app(DishInfo::class);
    }

    // ------------------------------------------------------------ diets

    public function test_diet_badges_only_claim_what_the_ingredients_allow(): void
    {
        $this->assertSame(['vegetarian', 'vegan', 'halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], []));
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], ['meat']));
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for(['fish'], []), 'fish is not vegetarian');
        $this->assertSame(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], array_values(array_intersect(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], DietBadges::for(['milk'], ['dairy']))));
        $this->assertNotContains('vegan', DietBadges::for(['eggs'], []));
        $this->assertNotContains('vegan', DietBadges::for([], ['honey']));
        $this->assertContains('vegetarian', DietBadges::for(['milk', 'eggs'], ['dairy', 'egg']));
        $this->assertNotContains('halal_friendly', DietBadges::for([], ['pork']));
        $this->assertNotContains('halal_friendly', DietBadges::for([], ['alcohol']));
        $this->assertNotContains('gluten_free', DietBadges::for(['wheat'], []));
        $this->assertNotContains('gluten_free', DietBadges::for([], ['gluten']));
        $this->assertNotContains('dairy_free', DietBadges::for(['milk'], []));
        $this->assertNotContains('nut_free', DietBadges::for(['peanuts'], []));
        $this->assertNotContains('nut_free', DietBadges::for(['tree_nuts'], []));
    }

    // ------------------------------------------------------------ allergens inherited

    public function test_a_dish_inherits_allergens_and_tags_from_the_ingredients_it_is_made_from(): void
    {
        $d = $this->make();
        $flour = $this->family('Flour', ['allergens' => ['wheat'], 'tags' => ['gluten']], [[$this->item('Exe', '2 kg'), 2000]]);
        $egg = $this->item('Egg', 'tray');
        $this->family('Eggs', ['allergens' => ['eggs'], 'tags' => ['egg']], [[$egg, 30]]);   // an exact line to an item that sits in a family
        $this->recipe($d, [['family_id' => $flour, 'quantity' => 500], ['variant_id' => $egg, 'quantity' => 1]]);
        $p = $this->info()->profile($d->fresh());
        $this->assertSame(['eggs', 'wheat'], $p['allergens']);
        $this->assertSame(['egg', 'gluten'], $p['tags']);
        $this->assertTrue($p['complete']);
        $this->assertSame(['vegetarian', 'halal_friendly', 'dairy_free', 'nut_free'], $p['diets']);
    }

    public function test_a_sub_recipe_made_ahead_passes_its_ingredients_on(): void
    {
        $sauce = $this->make('Cheese sauce');
        $milk = $this->family('Milk', ['allergens' => ['milk'], 'tags' => ['dairy']], [[$this->item('Milk', '1 l'), 1000]]);
        $this->recipe($sauce, [['family_id' => $milk, 'quantity' => 200]], 1, false);          // made ahead: a stock item of its own
        $pasta = $this->make('Pasta bake');
        $this->recipe($pasta, [['variant_id' => $sauce->variant_id, 'quantity' => 1]]);
        $p = $this->info()->profile($pasta->fresh());
        $this->assertSame(['milk'], $p['allergens']);
        $this->assertTrue($p['complete']);
    }

    public function test_an_ingredient_nothing_is_known_about_means_no_claims_at_all(): void
    {
        $d = $this->make();
        $this->recipe($d, [['variant_id' => $this->item('Mystery powder', '1 kg'), 'quantity' => 1]]);
        $p = $this->info()->profile($d->fresh());
        $this->assertFalse($p['complete']);
        $this->assertSame([], $p['diets'], 'no diet badge is claimed for a dish with an ingredient nobody has classified');
    }

    public function test_a_dish_with_no_recipe_claims_nothing_either(): void
    {
        $p = $this->info()->profile($this->make());
        $this->assertSame([false, []], [$p['complete'], $p['diets']]);
    }

    public function test_what_the_dish_declares_replaces_what_is_inherited_and_makes_it_complete_when_both_are_declared(): void
    {
        $d = $this->make('Salad', 40, ['allergens' => ['sesame'], 'tags' => []]);
        $this->recipe($d, [['variant_id' => $this->item('Greens', '1 kg'), 'quantity' => 1]]);
        $p = $this->info()->profile($d->fresh());
        $this->assertSame(['sesame'], $p['allergens']);
        $this->assertTrue($p['complete'] && $p['declared']);
        $this->assertContains('vegan', $p['diets']);
        $this->assertNotContains('nut_free', array_diff($p['diets'], ['nut_free']));
        $d->update(['tags_override' => null]);
        $this->assertFalse($this->info()->profile($d->fresh())['complete'], 'declaring only the allergens leaves the tags unknown');
    }

    public function test_a_recipe_that_uses_itself_does_not_loop(): void
    {
        $a = $this->make('A');
        $r = $this->recipe($a, [['variant_id' => $this->item('X', '1'), 'quantity' => 1]]);
        DB::table('recipe_items')->where('recipe_id', $r->id)->update(['variant_id' => $a->variant_id]);   // pointed at itself behind the screen's back
        $p = $this->info()->profile($a->fresh());
        $this->assertSame([], $p['allergens']);
    }

    // ------------------------------------------------------------ can it be made now

    public function test_a_dish_made_to_order_can_be_sold_as_often_as_the_scarcest_ingredient_allows(): void
    {
        $d = $this->make();
        $exe = $this->item('Exe', '2 kg');
        $pembe = $this->item('Pembe', '24 kg');
        $flour = $this->family('Flour', [], [[$exe, 2000], [$pembe, 24000]]);
        $oil = $this->item('Oil', '1 l');
        $this->stock($exe, 1);        // 2000 g
        $this->stock($pembe, 0.5);    // 12000 g
        $this->stock($oil, 3);
        $this->recipe($d, [['family_id' => $flour, 'quantity' => 100, 'waste_pct' => 20], ['variant_id' => $oil, 'quantity' => 0.5]]);   // 125 g flour and half a litre per chapati
        $this->assertSame(min(14000 / 125, 3 / 0.5), $this->info()->portions($d->fresh(), self::BRANCH), 'flour allows 112, oil allows 6');
        $this->stock($oil, 100);
        $this->assertSame(112.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_a_recipe_yield_counts_when_working_out_how_many_can_be_made(): void
    {
        $d = $this->make();
        $oil = $this->item('Oil', '1 l');
        $this->stock($oil, 3);
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 1]], 10);   // one litre makes ten
        $this->assertSame(30.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_an_unclassified_ingredient_deep_in_a_sub_recipe_still_makes_the_dish_incomplete(): void
    {
        $sauce = $this->make('Sauce');
        $this->recipe($sauce, [['variant_id' => $this->item('Mystery', '1 kg'), 'quantity' => 1]], 1, false);
        $plate = $this->make('Plate');
        $this->recipe($plate, [['variant_id' => $sauce->variant_id, 'quantity' => 1]]);
        $this->assertFalse($this->info()->profile($plate->fresh())['complete']);
    }

    public function test_an_ingredient_that_is_gone_makes_a_dish_unavailable(): void
    {
        $d = $this->make();
        $oil = $this->item('Oil', '1 l');
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 1]]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_a_switched_off_ingredient_makes_the_dish_unavailable_instead_of_failing(): void
    {
        $d = $this->make();
        $fam = $this->family('Flour', [], [[$this->item('Exe', '2 kg'), 2000]]);
        $this->recipe($d, [['family_id' => $fam, 'quantity' => 100]]);
        \App\Models\Menus\IngredientFamily::find($fam)->update(['is_active' => false]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_a_dish_made_ahead_is_what_is_on_the_shelf(): void
    {
        $d = $this->make('Samosa');
        $this->recipe($d, [['variant_id' => $this->item('Filling', '1 kg'), 'quantity' => 1]], 10, false);
        $this->stock((int) $d->variant_id, 24);
        $this->assertSame(24.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_sold_out_today_and_switched_off_mean_none_whatever_the_stock_says(): void
    {
        $d = $this->make();
        $this->stock((int) $d->variant_id, 10);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $this->dishes()->soldOutToday($d, true);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $this->dishes()->soldOutToday($d, false);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $d->update(['sold_out_on' => today()->subDay()->toDateString()]);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH), 'yesterday\'s "sold out" is over');
        $d->update(['is_active' => false]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    // ------------------------------------------------------------ the money

    public function test_the_price_the_cost_and_the_margin(): void
    {
        $d = $this->make('Chapati', 50);
        $oil = $this->item('Oil', '1 l');
        $this->stock($oil, 10, 400);
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 0.05]]);   // 20 of cost per chapati
        $m = $this->info()->money($d->fresh(), self::BRANCH);
        $this->assertSame([50.0, 20.0, 30.0, 40.0, true], [$m['price'], $m['cost'], $m['margin'], $m['food_cost_pct'], $m['complete']]);
        $none = $this->info()->money($this->make('Plain', 10), self::BRANCH);
        $this->assertSame([10.0, null, null, null, false], [$none['price'], $none['cost'], $none['margin'], $none['food_cost_pct'], $none['complete']]);
    }

    // ------------------------------------------------------------ making dishes

    public function test_a_new_dish_gets_a_hidden_product_and_one_stock_item(): void
    {
        $d = $this->make('Beef stew', 450, ['description' => 'Slow cooked', 'prep_minutes' => 20]);
        $product = Product::find($d->product_id);
        $this->assertSame(['Beef stew', 'dish', 0, 0, 450.0], [$product->name, $product->type, (int) $product->is_for_sale, (int) $product->is_visible, (float) $product->price], 'kept out of the shop');
        $this->assertSame($this->ledger, (int) $product->sales_ledger_id);
        $variant = DB::table('product_variants')->where('id', $d->variant_id)->first();
        $this->assertSame([(int) $product->id, 'Standard'], [(int) $variant->product_id, $variant->name]);
        $this->assertSame(450.0, (float) DB::table('product_variant_units')->where('variant_id', $d->variant_id)->where('role', 'base')->value('price'));
        $this->assertSame(['beef-stew', 'Slow cooked', 20], [$d->slug, $d->description, $d->prep_minutes]);
        $this->assertSame(1, Dish::count() + 0);
    }

    public function test_two_dishes_with_the_same_name_get_different_addresses(): void
    {
        $a = $this->make('Pilau');
        $b = $this->make('Pilau');
        $this->assertSame(['pilau', 'pilau-2'], [$a->slug, $b->slug]);
        $this->assertNotSame($a->variant_id, $b->variant_id);
        $this->assertNotSame(Product::find($a->product_id)->slug, Product::find($b->product_id)->slug, 'the hidden products do not clash either');
    }

    public function test_it_needs_a_name_a_price_and_a_sales_account_and_says_so(): void
    {
        $svc = $this->dishes();
        $cases = [
            [['name' => '  ', 'price' => 1, 'sales_ledger_id' => $this->ledger], 'Give the dish a name'],
            [['name' => 'X', 'sales_ledger_id' => $this->ledger], 'Give the dish a price'],
            [['name' => 'X', 'price' => -1, 'sales_ledger_id' => $this->ledger], 'less than nothing'],
            [['name' => 'X', 'price' => 'free', 'sales_ledger_id' => $this->ledger], 'less than nothing'],
            [['name' => 'X', 'price' => 1], 'Choose the sales account dishes are booked under'],
            [['name' => 'X', 'price' => 1, 'sales_ledger_id' => 9999], 'Choose an active sales account'],
            [['name' => 'X', 'price' => 1, 'sales_ledger_id' => $this->ledger, 'allergens' => ['glitter']], 'Unknown allergen: glitter'],
            [['name' => 'X', 'price' => 1, 'sales_ledger_id' => $this->ledger, 'tags' => ['unicorn']], 'Unknown tag: unicorn'],
        ];
        foreach ($cases as [$in, $why]) {
            try {
                $svc->save($in);
                $this->fail("should be refused: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->assertSame(0, Dish::count());
        $this->assertSame(0, Product::count(), 'a refused dish leaves nothing behind');
    }

    public function test_the_sales_account_can_come_from_the_settings(): void
    {
        MenusSettings::save(['sales_ledger_id' => $this->ledger, 'category_id' => 1], 7);
        $d = $this->dishes()->save(['name' => 'Tea', 'price' => 30]);
        $this->assertSame([$this->ledger, 1], [(int) Product::find($d->product_id)->sales_ledger_id, (int) Product::find($d->product_id)->category_id]);
    }

    public function test_changing_a_dish_keeps_its_hidden_item_in_step(): void
    {
        $d = $this->make('Tea', 30);
        $d = $this->dishes()->save(['name' => 'Masala tea', 'price' => 45, 'is_active' => false, 'sort_order' => 3], $d->id);
        $this->assertSame(['Masala tea', false, 3], [$d->name, $d->is_active, $d->sort_order]);
        $this->assertSame('Masala tea', Product::find($d->product_id)->name);
        $this->assertSame(45.0, (float) Product::find($d->product_id)->price);
        $this->assertSame(45.0, (float) DB::table('product_variant_units')->where('variant_id', $d->variant_id)->value('price'));
        $this->assertSame('tea', $d->slug, 'the address does not change under a customer');
    }

    public function test_allergens_can_be_declared_cleared_and_left_alone(): void
    {
        $d = $this->make('Cake', 100, ['allergens' => ['soy', 'MILK']]);
        $this->assertSame(['milk', 'soy'], $d->allergens_override);
        $d = $this->dishes()->save(['name' => 'Cake', 'price' => 100], $d->id);
        $this->assertSame(['milk', 'soy'], $d->allergens_override, 'a save that says nothing about them leaves them');
        $d = $this->dishes()->save(['name' => 'Cake', 'allergens' => []], $d->id);
        $this->assertSame([], $d->allergens_override, 'declared as none');
        $d = $this->dishes()->save(['name' => 'Cake', 'allergens' => null], $d->id);
        $this->assertNull($d->allergens_override, 'back to what the ingredients say');
    }

    public function test_a_dish_never_sold_can_be_deleted_with_its_hidden_item_and_recipe(): void
    {
        $d = $this->make();
        $this->recipe($d, [['variant_id' => $this->item('Oil', '1 l'), 'quantity' => 1]]);
        $this->dishes()->delete($d);
        $this->assertSame([0, 0, 0, 0], [Dish::count(), Product::where('id', $d->product_id)->count(), DB::table('recipes')->count(), DB::table('recipe_items')->count()]);
        $this->assertSame(0, DB::table('product_variants')->where('id', $d->variant_id)->count());
    }

    public function test_a_dish_that_has_been_sold_or_stocked_or_produced_is_switched_off_instead(): void
    {
        foreach (['stock_movements', 'voucher_items', 'productions'] as $table) {
            $d = $this->make('Dish '.$table);
            DB::table($table)->insert(['variant_id' => $d->variant_id]);
            try {
                $this->dishes()->delete($d);
                $this->fail("{$table} should block the delete");
            } catch (BooksException $e) {
                $this->assertStringContainsString('Switch it off instead', $e->getMessage());
            }
            $this->assertSame(1, Dish::where('id', $d->id)->count());
        }
        $d = $this->make('Stocked');
        $this->stock((int) $d->variant_id, 1);
        $this->expectExceptionMessage('has been sold or stocked');
        $this->dishes()->delete($d);
    }

    // ------------------------------------------------------------ settings

    public function test_settings_keep_a_valid_sales_account_and_say_why_when_it_is_not(): void
    {
        $s = MenusSettings::save(['sales_ledger_id' => $this->ledger, 'allergen_note' => '  Ask us  ', 'receipt_footer' => 'Thank you'], 5);
        $this->assertSame([$this->ledger, 'Ask us', 'Thank you'], [$s['sales_ledger_id'], $s['allergen_note'], $s['receipt_footer']]);
        $this->assertSame($s, MenusSettings::all());
        $expense = DB::table('ledger_groups')->insertGetId(['name' => 'Expenses', 'behaviour' => 'expense']);
        $bad = DB::table('ledgers')->insertGetId(['name' => 'Rent', 'group_id' => $expense, 'tax_nature' => 'exempt']);
        foreach ([['sales_ledger_id' => $bad, 'not a sales account'], ['category_id' => 999, 'does not exist']] as $in) {
            $why = array_pop($in);
            try {
                MenusSettings::save($in, 5);
                $this->fail($why);
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->assertSame($this->ledger, MenusSettings::all()['sales_ledger_id'], 'a refused change leaves the settings as they were');
        $this->assertNull(MenusSettings::save(['sales_ledger_id' => null], 5)['sales_ledger_id']);
    }

    public function test_before_script_134_the_defaults_apply_and_saving_is_refused(): void
    {
        Schema::drop('menus_settings');
        $this->assertSame(MenusSettings::DEFAULTS, MenusSettings::all());
        $this->expectExceptionMessage('run database script 134');
        MenusSettings::save(['receipt_footer' => 'x'], 1);
    }

    // ------------------------------------------------------------ the screen's API

    public function test_the_list_shows_each_dish_with_its_allergens_diets_availability_and_money(): void
    {
        $d = $this->make('Chapati', 50);
        $oil = $this->item('Oil', '1 l');
        $this->family('Oil', [], [[$oil, 1000]]);   // classified, with nothing to declare
        $this->stock($oil, 10, 400);
        $fam = $this->family('Wheat', ['allergens' => ['wheat'], 'tags' => ['gluten']], [[$exe = $this->item('Exe', '2 kg'), 2000]]);
        $this->stock($exe, 5, 200);
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 0.05], ['family_id' => $fam, 'quantity' => 100]]);
        $data = app(MenusDishController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $row = $data['dishes'][0];
        $this->assertSame(['Chapati', true, true, ['wheat']], [$row['name'], $row['has_recipe'], $row['made_to_order'], $row['allergens']]);
        $this->assertContains('vegetarian', $row['diets']);
        $this->assertNotContains('gluten_free', $row['diets']);
        $this->assertEquals([50, 30, 20, 60], [$row['price'], $row['cost'], $row['margin'], $row['food_cost_pct']], 'oil 20 plus 100 g of flour at 0.10 a gram is 30');
        $this->assertEquals(min(5 * 2000 / 100, 10 / 0.05), $row['available']);
        $this->assertArrayHasKey('wheat', $data['allergens']);
        $this->assertTrue($data['settings_ready']);
    }

    public function test_the_save_endpoint_answers_in_plain_words_and_marks_sold_out(): void
    {
        $c = app(MenusDishController::class);
        $ok = $c->save(Request::create('/x', 'POST', ['name' => 'Soda', 'price' => 80, 'sales_ledger_id' => $this->ledger]));
        $this->assertSame(201, $ok->status());
        $bad = $c->save(Request::create('/x', 'POST', ['name' => 'Water', 'price' => 50]));
        $this->assertSame(422, $bad->status());
        $this->assertStringContainsString('sales account', $bad->getData(true)['message']);
        $id = Dish::first()->id;
        $out = $c->soldOut(Request::create('/x', 'POST', ['sold_out' => true]), $id)->getData(true);
        $this->assertTrue($out['dish']['sold_out_today']);
        $this->assertStringContainsString('sold out for today', $out['message']);
        $this->assertSame(200, $c->destroy($id)->status());
        $this->assertSame(0, Dish::count());
    }
}
