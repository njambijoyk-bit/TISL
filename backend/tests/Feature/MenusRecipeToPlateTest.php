<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusRecipesController;
use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishSlot;
use App\Models\Menus\Side;
use App\Services\Menus\DishSelection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The shortcut on the recipe form: "Also make it a side and a dish" makes the side and the dish of the same name, with one slot holding the side. */
class MenusRecipeToPlateTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $station;
    private int $box;
    private int $jumbo;
    private int $adults;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql', '214_menus_timers.sql');
        Schema::table('accounting_settings', function ($t) { $t->unsignedBigInteger('tips_payable_ledger_id')->nullable(); $t->unsignedBigInteger('default_sales_ledger_id')->nullable(); });
        Schema::table('currencies', function ($t) { $t->boolean('is_active')->default(true); $t->string('name')->nullable(); });
        app(\App\Services\Menus\IngredientKinds::class)->seedDefaults();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::table('ledger_groups', fn ($t) => $t->string('behaviour')->nullable());
        Schema::table('ledgers', fn ($t) => $t->string('tax_nature')->nullable());
        $group = DB::table('ledger_groups')->insertGetId(['name' => 'Sales Accounts', 'behaviour' => 'sales']);
        \App\Services\Menus\MenusSettings::save(['sales_ledger_id' => DB::table('ledgers')->insertGetId(['name' => 'Food sales', 'group_id' => $group, 'tax_nature' => 'taxable'])], null);
        $this->station = DB::table('menus_stations')->insertGetId(['name' => 'Hot kitchen', 'is_active' => true]);
        $packaging = (int) \App\Models\Menus\IngredientKind::where('code', 'packaging')->value('id');
        $this->makeIngredient('Takeaway box', $this->each, null, [['name' => 'Pack of 50']], 'preferred', ['kind_id' => $packaging]);
        $this->box = (int) $this->itemId('Pack of 50');
        \App\Services\Menus\MenusSettings::save(['packaging_kind_id' => $packaging], null);
        app(\App\Services\Menus\PackagingPrices::class)->save([['item_id' => $this->box, 'price' => 15]]);
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->adults = DB::table('menus_audiences')->insertGetId(['name' => 'Adults', 'sort_order' => 1, 'is_active' => true]);
        $this->pantry('Rice', 5000, 0.19);
        $this->pantry('Beef', 5000, 0.8);
    }

    private function body(string $name, array $over = []): array
    {
        return $over + ['name' => $name, 'yield_qty' => 1, 'lines' => [
            ['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Rice')->value('id'), 'quantity' => 150],
            ['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Beef')->value('id'), 'quantity' => 180],
        ]];
    }

    private function saveRecipe(array $body, ?int $id = null)
    {
        return app(MenusRecipesController::class)->saveBook(Request::create('/x', $id ? 'PUT' : 'POST', $body), $id);
    }

    public function test_one_form_makes_the_recipe_the_side_and_the_dish_with_one_slot(): void
    {
        $res = $this->saveRecipe($this->body('Beef pilau', ['also_dish' => true, 'dish_price' => 600, 'station_id' => $this->station]));
        $this->assertSame(201, $res->getStatusCode(), $res->getContent());
        $this->assertStringContainsString('Also made: the side Beef pilau and the dish Beef pilau', $res->getData(true)['message']);
        $recipe = DishRecipe::standalone()->first();
        $side = Side::first();
        $dish = Dish::first();
        $this->assertSame([$recipe->id, $this->station], [(int) $side->recipe_id, (int) $side->station_id]);
        $this->assertSame(['Beef pilau', 600.0], [$dish->name, (float) $dish->price], 'the dish station is set by DishService where the kitchen tables exist');
        $slot = DishSlot::with('choices')->where('dish_id', $dish->id)->get();
        $this->assertSame(['fixed'], $slot->pluck('kind')->all());
        $this->assertSame([(int) $side->id], $slot->first()->choices->pluck('side_id')->map(fn ($i) => (int) $i)->all());
        $sel = app(DishSelection::class)->resolve($dish, null, []);
        $this->assertSame([600.0, [(int) $side->id]], [$sel['unit_price'], array_column($sel['sides'], 'side_id')], 'the dish sells through the side');
    }

    public function test_a_side_alone_makes_no_dish_and_saving_again_makes_no_second_side(): void
    {
        $this->saveRecipe($this->body('Kale', ['also_side' => true]));
        $this->assertSame([1, 0], [Side::count(), Dish::count()]);
        $id = (int) DishRecipe::standalone()->value('id');
        $res = $this->saveRecipe($this->body('Kale', ['also_side' => true, 'also_dish' => true, 'dish_price' => 100]), $id);
        $this->assertSame([1, 1], [Side::count(), Dish::count()], 'the side is reused, the dish is new');
        $this->assertStringContainsString('the dish Kale', $res->getData(true)['message']);
        $this->assertStringNotContainsString('the side', $res->getData(true)['message']);
    }

    public function test_a_side_of_the_same_name_already_there_refuses_the_save_in_words(): void
    {
        $other = app(\App\Services\Menus\DishRecipes::class)->saveStandalone($this->body('Base'));
        app(\App\Services\Menus\Sides::class)->save(['name' => 'Beef pilau', 'recipe_id' => $other->id]);
        $res = $this->saveRecipe($this->body('Beef pilau', ['also_side' => true]));
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('Not a simple meal', $res->getData(true)['message']);
        $this->assertSame([1, 1], [DishRecipe::standalone()->count(), Side::count()], 'only the recipe and side that were there');
    }

    public function test_a_refusal_leaves_nothing_behind(): void
    {
        $this->saveRecipe($this->body('Beef pilau', ['also_dish' => true, 'dish_price' => 600]));
        $res = $this->saveRecipe($this->body('Another', ['also_dish' => true]));
        $this->assertSame(422, $res->getStatusCode());
        $this->assertStringContainsString('price', $res->getData(true)['message']);
        $this->assertSame([1, 1, 1], [DishRecipe::standalone()->count(), Side::count(), Dish::count()], 'neither the recipe nor a side was kept');
    }

    public function test_the_recipes_door_lists_the_stations_for_the_form(): void
    {
        $out = app(MenusRecipesController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $this->assertTrue($out['plate_installed']);
        $this->assertSame(['Hot kitchen'], array_column($out['stations'], 'name'));
    }

    public function test_the_side_and_dish_details_of_the_form_are_kept_sizes_who_it_is_for_plating_and_packaging(): void
    {
        $rule = ['item_id' => $this->box, 'scope' => 'per_dish', 'quantity' => 2, 'compulsory' => true, 'charged' => true, 'receipt' => 'auto'];
        $res = $this->saveRecipe($this->body('Beef pilau', ['also_dish' => true, 'dish_price' => 600, 'station_id' => $this->station,
            'side_details' => ['base_amount' => 1, 'amounts' => [['serving_id' => $this->jumbo, 'amount' => 1.5]], 'task_minutes' => 3, 'note' => 'Plate hot', 'packaging' => [$rule]],
            'dish_details' => ['description' => 'Spiced rice with beef', 'servings' => [['serving_id' => $this->jumbo, 'price' => 800]], 'audience_ids' => [$this->adults], 'packaging' => [['quantity' => 1] + $rule]]]));
        $this->assertSame(201, $res->getStatusCode(), $res->getContent());
        $side = Side::with('amounts')->first();
        $dish = Dish::first();
        $this->assertSame([3, 'Plate hot', [$this->jumbo => 1.5]], [(int) $side->task_minutes, $side->note, $side->amounts->pluck('amount', 'serving_id')->map(fn ($a) => (float) $a)->all()]);
        $this->assertSame('Spiced rice with beef', $dish->description);
        $m = app(\App\Services\Menus\DishMakeup::class)->show($dish);
        $this->assertSame([[$this->jumbo, 800.0]], array_map(fn ($r) => [$r['serving_id'], (float) $r['price']], $m['servings']));
        $this->assertSame([$this->adults], $m['audience_ids']);
        $this->assertSame([2, 1], [(int) \App\Models\Menus\PackagingRule::where('side_id', $side->id)->value('quantity'), (int) \App\Models\Menus\PackagingRule::where('dish_id', $dish->id)->value('quantity')]);
        $sel = app(DishSelection::class)->resolve($dish, $this->jumbo, []);
        $this->assertSame(800.0, $sel['unit_price']);
    }

    public function test_a_packaging_item_that_is_not_packaging_refuses_the_whole_save(): void
    {
        $res = $this->saveRecipe($this->body('Beef pilau', ['also_side' => true, 'side_details' => ['packaging' => [['item_id' => 99999, 'scope' => 'per_dish', 'quantity' => 1]]]]));
        $this->assertSame(422, $res->getStatusCode());
        $this->assertSame([0, 0], [DishRecipe::standalone()->count(), Side::count()]);
    }

    public function test_the_door_offers_the_sizes_audiences_and_packaging_items_for_the_form(): void
    {
        $out = app(MenusRecipesController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $this->assertSame([['Jumbo'], ['Adults'], ['Takeaway box - Pack of 50']], [array_column($out['lists']['servings'], 'name'), array_column($out['lists']['audiences'], 'name'), array_column($out['packaging_items'], 'name')]);
    }
}
