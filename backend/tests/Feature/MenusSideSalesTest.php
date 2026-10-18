<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\Menus\Side;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockUse;
use App\Models\Menus\Waste;
use App\Services\Books\BooksException;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishProduction;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishStock;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\SideSales;
use App\Services\Menus\SidesFromDishes;
use App\Services\Menus\SidesReadiness;
use App\Services\Menus\WasteService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Selling a dish through its side (build step 2.4 and 2.5): the switch, the stock taken through the side's recipe, prepared food sold, and the check that comes before the switch. */
class MenusSideSalesTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $prepared;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql', '200_menus_sides.sql', '201_menus_sides_from_dishes.sql');
        $this->prepared = DB::table('ledgers')->insertGetId(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        $this->pantry('Flour', 100000, 0.1);
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function flourLeft(): float
    {
        return (float) StockBatch::sum('qty_left');
    }

    private function switch(bool $on): void
    {
        DB::table('menus_settings')->updateOrInsert(['id' => 1], ['settings' => json_encode(['sell_through_sides' => $on]), 'created_at' => now(), 'updated_at' => now()]);
    }

    /** A dish with a recipe (200 g of flour a portion, 20 at 0.1 a gram) and the side made from it. */
    private function pizza(bool $toOrder = true, string $name = 'Pizza'): Dish
    {
        $d = $this->dish($name);
        app(DishRecipes::class)->save($d, ['made_to_order' => $toOrder, 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 200]]]);
        app(SidesFromDishes::class)->run();

        return $d;
    }

    private function copyOf(Dish $d): DishRecipe
    {
        return DishRecipe::findOrFail(Side::where('from_dish_id', $d->id)->value('recipe_id'));
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function sell(Dish $d, float $qty)
    {
        $v = $this->sale([['dish' => $d, 'qty' => $qty]]);
        app(DishStock::class)->apply($v, null);

        return $v;
    }

    // ------------------------------------------------------------ made to order

    public function test_with_the_switch_off_a_sale_goes_through_the_dishs_own_recipe_as_before(): void
    {
        $d = $this->pizza();
        $this->assertNull(app(SideSales::class)->sideFor($d));
        $this->sell($d, 2);
        $this->assertEqualsWithDelta(400.0, 100000 - $this->flourLeft(), 0.001);
        $this->assertSame(DishRecipe::where('dish_id', $d->id)->value('id'), (int) StockUse::first()->recipe_id);
    }

    public function test_with_the_switch_on_a_sale_goes_through_the_side_and_is_booked_and_undone_as_before(): void
    {
        $d = $this->pizza();
        $this->switch(true);
        $copy = $this->copyOf($d);
        $this->posted = [];
        $v = $this->sell($d, 2);
        $this->assertEqualsWithDelta(400.0, 100000 - $this->flourLeft(), 0.001);
        $use = StockUse::first();
        $this->assertSame([$copy->id, $d->id], [(int) $use->recipe_id, (int) $use->dish_id], 'the side\'s recipe, kept against the dish');
        $this->assertCount(1, $this->posted);
        $this->assertEquals([[$this->costOfSales, 'D', 40.0], [$this->inventory, 'C', 40.0]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $this->posted[0]['entries']));
        app(DishStock::class)->undo($v, null);
        $this->assertEqualsWithDelta(100000.0, $this->flourLeft(), 0.001);
        $this->assertCount(1, $this->cancelled);
    }

    public function test_the_stock_follows_the_copy_not_the_original_and_the_amount_in_a_serving(): void
    {
        $d = $this->pizza();
        $this->switch(true);
        $copy = $this->copyOf($d);
        app(DishRecipes::class)->saveStandalone(['name' => $copy->name, 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 300]]], $copy->id);
        $this->sell($d, 1);
        $this->assertEqualsWithDelta(300.0, 100000 - $this->flourLeft(), 0.001, 'the copy was changed to 300 g');
        Side::where('from_dish_id', $d->id)->update(['base_amount' => 2]);
        $before = $this->flourLeft();
        $this->sell($d, 1);
        $this->assertEqualsWithDelta(600.0, $before - $this->flourLeft(), 0.001, 'a serving of the side holds 2 portions of the recipe');
    }

    public function test_a_dish_without_a_side_keeps_selling_as_before_even_with_the_switch_on(): void
    {
        $d = $this->dish('Plain');
        app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 50]]]);
        $this->switch(true);
        $this->sell($d, 2);
        $this->assertEqualsWithDelta(100.0, 100000 - $this->flourLeft(), 0.001);
        $this->assertSame(DishRecipe::where('dish_id', $d->id)->value('id'), (int) StockUse::first()->recipe_id);
    }

    public function test_a_side_or_recipe_that_is_switched_off_falls_back_to_the_dishs_own_recipe(): void
    {
        $d = $this->pizza();
        $this->switch(true);
        Side::where('from_dish_id', $d->id)->update(['is_active' => false]);
        $this->assertNull(app(SideSales::class)->sideFor($d));
        Side::where('from_dish_id', $d->id)->update(['is_active' => true]);
        $this->assertNotNull(app(SideSales::class)->sideFor($d));
    }

    // ------------------------------------------------------------ made ahead: prepared food is sold

    private function ahead(): Dish
    {
        $d = $this->pizza(false, 'Cake');
        app(PrepProduction::class)->run($this->copyOf($d), 1, 10, ['date' => '2026-10-17']);   // 10 portions made: 2000 g of flour, 200 booked to prepared food
        $this->switch(true);
        $this->posted = [];

        return $d;
    }

    public function test_a_dish_made_ahead_sells_prepared_food_and_books_it_out_of_prepared_food_inventory(): void
    {
        $d = $this->ahead();
        $flour = $this->flourLeft();
        $v = $this->sell($d, 3);
        $this->assertEqualsWithDelta($flour, $this->flourLeft(), 0.001, 'the ingredients were used when the batch was made');
        $this->assertSame(7.0, (float) PrepLot::first()->qty_left);
        $move = PrepMove::where('kind', 'served')->first();
        $this->assertSame([-3.0, 'voucher', (int) $v->id], [(float) $move->quantity, $move->ref_type, (int) $move->ref_id]);
        $use = StockUse::where('ref_type', 'voucher')->first();
        $this->assertEqualsWithDelta(60.0, (float) $use->cost, 0.001, '3 portions at 20 each');
        $this->assertCount(1, $this->posted);
        $this->assertEquals([[$this->costOfSales, 'D', 60.0], [$this->prepared, 'C', 60.0]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $this->posted[0]['entries']), 'Dr Food Cost of Sales, Cr Prepared Food Inventory');
        $this->assertNotNull($use->journal_id);
    }

    public function test_cancelling_a_sale_of_prepared_food_puts_it_back_once(): void
    {
        $d = $this->ahead();
        $v = $this->sell($d, 3);
        app(DishStock::class)->undo($v, null);
        app(DishStock::class)->undo($v, null);   // a second undo must not put it back twice
        $this->assertSame(10.0, (float) PrepLot::first()->qty_left);
        $this->assertSame(['production', 'served', 'served_reversal'], PrepMove::orderBy('id')->pluck('kind')->all());
        $this->assertCount(1, $this->cancelled);
        $this->sell($d, 2);   // and it can be sold again
        $this->assertSame(8.0, (float) PrepLot::first()->qty_left);
    }

    public function test_not_enough_prepared_food_refuses_the_sale_and_expired_batches_do_not_count(): void
    {
        $d = $this->ahead();
        $this->fails(fn () => $this->sell($d, 11), 'Make a batch on the Prepared food page first');
        $this->assertSame(10.0, (float) PrepLot::first()->qty_left, 'nothing was taken');
        PrepLot::query()->update(['expiry_date' => '2020-01-01']);
        $this->fails(fn () => $this->sell($d, 1), 'have 0');
        $this->assertSame(0.0, app(DishStock::class)->portionsAhead($d, 1));
    }

    public function test_the_prepared_batches_that_expire_first_are_sold_first(): void
    {
        $d = $this->pizza(false, 'Cake');
        $copy = $this->copyOf($d);
        $late = app(PrepProduction::class)->run($copy, 1, 5, ['date' => '2026-10-17', 'expiry_date' => '2999-01-01']);
        $soon = app(PrepProduction::class)->run($copy, 1, 5, ['date' => '2026-10-17', 'expiry_date' => '2998-01-01']);
        $this->switch(true);
        $this->sell($d, 6);
        $this->assertSame([4.0, 0.0], [(float) PrepLot::whereKey($late->lot_id)->value('qty_left'), (float) PrepLot::whereKey($soon->lot_id)->value('qty_left')]);
    }

    public function test_the_old_dish_shelf_is_not_sold_from_once_the_switch_is_on(): void
    {
        $d = $this->pizza(false, 'Cake');
        DishBatch::create(['dish_id' => $d->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 5, 'qty_left' => 5, 'status' => 'ok']);
        $this->assertSame(5.0, app(DishStock::class)->portionsAhead($d, 1), 'switch off: the old shelf');
        $this->switch(true);
        $this->assertSame(0.0, app(DishStock::class)->portionsAhead($d, 1), 'switch on: only prepared food counts');
        $this->fails(fn () => $this->sell($d, 1), 'Not enough Cake prepared');
        $this->assertSame(5.0, (float) DishBatch::first()->qty_left);
    }

    // ------------------------------------------------------------ what can be made, what it costs, making ahead, waste

    public function test_portions_available_and_cost_follow_the_side(): void
    {
        $d = $this->pizza();
        $info = app(DishInfo::class);
        $this->assertEqualsWithDelta(500.0, $info->portions($d->fresh(), 1), 0.01, '100000 g at 200 g a portion');
        $this->switch(true);
        Side::where('from_dish_id', $d->id)->update(['base_amount' => 2]);
        $this->assertEqualsWithDelta(250.0, $info->portions($d->fresh(), 1), 0.01, 'a serving holds two portions of the recipe');
        $this->assertEqualsWithDelta(40.0, $info->money($d->fresh(), 1)['cost'], 0.001, '2 portions at 20 each');
        $ahead = $this->pizza(false, 'Cake');
        app(PrepProduction::class)->run($this->copyOf($ahead), 1, 10);
        Side::where('from_dish_id', $ahead->id)->update(['base_amount' => 2]);
        $this->assertSame(5.0, $info->portions($ahead->fresh(), 1), '10 portions of prepared food, 2 to a serving');
    }

    public function test_a_dish_sold_through_a_side_is_made_ahead_on_the_prepared_food_page_not_the_stock_page(): void
    {
        $d = $this->pizza(false, 'Cake');
        $this->fails(fn () => (function () use ($d) {
            $this->switch(true);
            app(DishProduction::class)->run($d, 1, 5);
        })(), 'Prepared food page');
        $this->switch(false);
        $this->assertSame('posted', app(DishProduction::class)->run($d, 1, 5)->status, 'with the switch off it works as before');
    }

    public function test_prepared_food_of_a_dish_written_off_comes_off_the_prepared_batches(): void
    {
        $d = $this->ahead();
        $w = app(WasteService::class)->record(['dish_id' => $d->id, 'location_id' => 1, 'quantity' => 2, 'kind' => 'spoilage']);
        $this->assertSame(8.0, (float) PrepLot::first()->qty_left);
        $this->assertEqualsWithDelta(40.0, (float) $w->cost, 0.001, '2 portions at 20 each');
        $this->assertSame([$d->id, $this->copyOf($d)->id], [(int) $w->dish_id, (int) $w->recipe_id]);
        $waste = (int) DB::table('ledgers')->where('name', 'Food Waste Expense')->value('id');
        $this->assertEquals([[$waste, 'D', 40.0], [$this->prepared, 'C', 40.0]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $this->posted[0]['entries']));
        $this->assertSame('Cake', app(WasteService::class)->recent(1)[0]['item'], 'the log names the dish');
        app(WasteService::class)->void($w);
        $this->assertSame(10.0, (float) PrepLot::first()->qty_left);
    }

    // ------------------------------------------------------------ the switch and the check before it

    public function test_the_switch_can_only_be_turned_on_when_the_scripts_are_run(): void
    {
        $saved = MenusSettings::save(['sell_through_sides' => true], null);
        $this->assertTrue($saved['sell_through_sides']);
        $this->assertTrue(SideSales::enabled());
        $this->assertFalse(MenusSettings::save(['sell_through_sides' => false], null)['sell_through_sides']);
        Schema::table('menus_sides', fn ($t) => $t->dropColumn('from_dish_id'));
        $this->fails(fn () => MenusSettings::save(['sell_through_sides' => true], null), '201_menus_sides_from_dishes');
        $this->assertFalse(SideSales::enabled());
    }

    public function test_the_check_lists_dishes_without_a_side_copies_that_differ_and_stock_on_the_old_shelf(): void
    {
        $clean = $this->pizza();
        $ahead = $this->pizza(false, 'Cake');
        $r = app(SidesReadiness::class)->report();
        $this->assertSame([true, false, 2, 2, [], []], [$r['ready'], $r['on'], $r['dish_recipes'], $r['with_side'], $r['without_side'], $r['differs']]);
        $this->assertSame([], $r['old_shelf']);

        $this->dish('Plain', 50, [['Flour', 10]]);
        app(DishRecipes::class)->saveStandalone(['name' => $this->copyOf($clean)->name, 'yield_qty' => 1, 'made_to_order' => true, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 250]]], $this->copyOf($clean)->id);
        DishBatch::create(['dish_id' => $ahead->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 5, 'qty_left' => 3, 'status' => 'ok']);
        $r = app(SidesReadiness::class)->report();
        $this->assertSame(['Plain'], $r['without_side']);
        $this->assertSame([['dish' => 'Pizza', 'what' => ['the ingredients or amounts differ']]], $r['differs']);
        $this->assertSame([['dish' => 'Cake', 'portions' => 3.0]], $r['old_shelf']);
    }

    public function test_the_check_before_the_scripts_says_it_is_not_ready(): void
    {
        Schema::table('menus_sides', fn ($t) => $t->dropColumn('from_dish_id'));
        $this->assertFalse(app(SidesReadiness::class)->report()['ready']);
        $this->assertFalse(app(\App\Http\Controllers\Admin\MenusSidesController::class)->readiness(app(SidesReadiness::class))->getData(true)['ready']);
    }
}
