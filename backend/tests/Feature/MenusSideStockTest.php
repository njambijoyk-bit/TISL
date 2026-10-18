<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\PrepLot;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\DishStock;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Stock on a sale follows the sides the guest picked (build step 3.6): each side from its own source, what was left out left out, what was added taken, and all of it given back on a cancel. */
class MenusSideStockTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $jumbo;
    private int $kids;
    private int $prepared;
    private Dish $meal;
    /** @var array<string, int> */
    private array $side = [];
    /** @var array<string, int> */
    private array $slot = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql');
        $this->prepared = DB::table('ledgers')->insertGetId(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 2, 'is_active' => true]);
        $this->pantry('Flour', 100000, 0.1);
        $this->pantry('Onion', 10000, 0.5);
        $coke = $this->makeIngredient('Coke', $this->each, null, [['name' => 'Coke 500ml']], 'preferred', ['kind_id' => (int) IngredientKind::where('code', 'ready_to_serve')->value('id')]);
        $this->shelve('Coke 500ml', 20, 30);
        $recipes = app(DishRecipes::class);
        $bread = $recipes->saveStandalone(['name' => 'Bread', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 10]]]);
        $choma = $recipes->saveStandalone(['name' => 'Choma', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 10]]]);
        $kale = $recipes->saveStandalone(['name' => 'Kale', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 10], ['ingredient_id' => $this->ing('Onion'), 'quantity' => 5]]]);
        $cake = $recipes->saveStandalone(['name' => 'Cake', 'made_to_order' => false, 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 20]]]);
        $sides = app(Sides::class);
        $this->side['Bread'] = $sides->save(['name' => 'Bread', 'recipe_id' => $bread->id])->id;
        $this->side['Choma'] = $sides->save(['name' => 'Choma', 'recipe_id' => $choma->id, 'base_amount' => 2, 'amounts' => [['serving_id' => $this->kids, 'amount' => 1]]])->id;
        $this->side['Kale'] = $sides->save(['name' => 'Kale', 'recipe_id' => $kale->id])->id;
        $this->side['Cake'] = $sides->save(['name' => 'Cake', 'recipe_id' => $cake->id])->id;
        $this->side['Coke'] = $sides->save(['name' => 'Coke', 'ingredient_id' => $coke->id])->id;
        $this->cakeRecipe = $cake;
        $this->meal = $this->dish('Steak sandwich', 500);
        app(DishMakeup::class)->save($this->meal, [
            'servings' => [['serving_id' => $this->jumbo, 'price' => 650], ['serving_id' => $this->kids, 'price' => 350]],
            'slots' => [
                ['name' => 'Bread', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]],
                ['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma'], 'is_default' => true], ['side_id' => $this->side['Cake']]]],
                ['name' => 'Greens', 'kind' => 'choose_any', 'min' => 0, 'max' => 2, 'choices' => [['side_id' => $this->side['Kale']]]],
                ['name' => 'Drink', 'kind' => 'free_extra', 'max' => 2, 'choices' => [['side_id' => $this->side['Coke']]]],
            ],
        ]);
        foreach (\App\Models\Menus\DishSlot::where('dish_id', $this->meal->id)->get() as $s) {
            $this->slot[$s->name] = (int) $s->id;
        }
    }

    private \App\Models\Menus\DishRecipe $cakeRecipe;

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function left(string $name): float
    {
        return (float) StockBatch::whereIn('item_id', DB::table('menus_ingredient_items')->where('ingredient_id', $this->ing($name))->pluck('id'))->sum('qty_left');
    }

    /** Sell qty of the meal with these picks (the way the till builds the line) inside a transaction like the books' one. */
    private function sell(?int $serving, array $picks = [], float $qty = 1, array $extra = []): \App\Models\Books\Voucher
    {
        $r = app(DishSelection::class)->resolve($this->meal, $serving, $picks);
        $v = $this->sale([['dish' => $this->meal, 'qty' => $qty, 'uses' => array_merge($r['uses'], $extra)]]);
        DB::transaction(fn () => app(DishStock::class)->apply($v, null));

        return $v;
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

    public function test_each_side_picked_takes_its_own_recipe_in_the_amount_of_the_size(): void
    {
        $this->sell($this->jumbo, [], 2);   // bread 10, choma 2 portions of 10, for 2 meals; the greens are not picked to begin with
        $this->assertEqualsWithDelta(2 * 30, 100000 - $this->left('Flour'), 0.001);
        $this->assertSame(10000.0, $this->left('Onion'));
        $before = $this->left('Flour');
        $this->sell($this->kids, []);   // kids: choma is 1 portion
        $this->assertEqualsWithDelta(20.0, $before - $this->left('Flour'), 0.001);
    }

    public function test_the_picks_decide_what_is_taken_and_a_dish_recipe_is_not_taken_on_top(): void
    {
        app(DishRecipes::class)->save($this->meal, ['yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 200]]]);
        $this->sell($this->jumbo, [$this->slot['Greens'] => [$this->side['Kale']]]);
        $this->assertEqualsWithDelta(10 + 20 + 10, 100000 - $this->left('Flour'), 0.001, 'bread, choma and kale; not the 200 g of the dish\'s own recipe');
        $this->assertEqualsWithDelta(5.0, 10000 - $this->left('Onion'), 0.001);
    }

    public function test_what_the_guest_left_out_is_left_out_of_the_sides_and_what_was_added_is_taken(): void
    {
        $this->sell($this->jumbo, [$this->slot['Greens'] => [$this->side['Kale']]], 2, [
            ['mode' => 'remove', 'ingredient_id' => $this->ing('Onion')],
            ['mode' => 'add', 'ingredient_id' => $this->ing('Onion'), 'quantity' => 7, 'unit' => 'base'],
        ]);
        $this->assertEqualsWithDelta(2 * 40, 100000 - $this->left('Flour'), 0.001);
        $this->assertEqualsWithDelta(2 * 7, 10000 - $this->left('Onion'), 0.001, 'the kale\'s onion was left out; the 7 g the guest added is taken for each meal');
    }

    public function test_a_ready_to_serve_side_takes_its_ingredient_off_the_shelf(): void
    {
        $this->sell($this->jumbo, [$this->slot['Drink'] => [['side_id' => $this->side['Coke'], 'qty' => 2]]], 3);
        $this->assertSame(14.0, $this->left('Coke'), '2 a meal, 3 meals');
        $this->assertEqualsWithDelta(3 * 30, 100000 - $this->left('Flour'), 0.001);
    }

    public function test_a_side_made_ahead_is_sold_from_the_prepared_shelf_and_booked_out_of_prepared_food(): void
    {
        app(PrepProduction::class)->run($this->cakeRecipe, 1, 10, ['date' => '2026-10-17']);   // 10 portions, 20 g of flour each, 2 a portion
        $flour = $this->left('Flour');
        $this->posted = [];
        $v = $this->sell($this->jumbo, [$this->slot['Protein'] => [$this->side['Cake']]], 3);
        $this->assertSame(7.0, (float) PrepLot::first()->qty_left);
        $this->assertEqualsWithDelta(30.0, $flour - $this->left('Flour'), 0.001, 'only the bread came off the shelf of ingredients, 10 a meal');
        $this->assertCount(2, $this->posted, 'the ingredients, and the prepared food on its own');
        $prepared = array_values(array_filter($this->posted, fn ($p) => in_array($this->prepared, array_column($p['entries'], 'ledger_id'), true)));
        $this->assertEquals([[$this->costOfSales, 'D', 6.0], [$this->prepared, 'C', 6.0]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $prepared[0]['entries']), '3 portions at 2');
        app(DishStock::class)->undo($v, null);
        $this->assertSame(10.0, (float) PrepLot::first()->qty_left);
        $this->assertEqualsWithDelta($flour, $this->left('Flour'), 0.001);
    }

    public function test_not_enough_of_a_side_refuses_the_sale_and_names_the_side(): void
    {
        app(PrepProduction::class)->run($this->cakeRecipe, 1, 2, ['date' => '2026-10-17']);
        $this->fails(fn () => $this->sell($this->jumbo, [$this->slot['Protein'] => [$this->side['Cake']]], 3), 'Not enough Cake prepared');
        $this->fails(fn () => $this->sell($this->jumbo, [$this->slot['Drink'] => [['side_id' => $this->side['Coke'], 'qty' => 2]]], 11), 'Coke');
    }

    public function test_cancelling_gives_every_side_back(): void
    {
        $v = $this->sell($this->jumbo, [$this->slot['Greens'] => [$this->side['Kale']], $this->slot['Drink'] => [$this->side['Coke']]], 2);
        $this->assertLessThan(100000, $this->left('Flour'));
        $this->posted = [];
        app(DishStock::class)->undo($v, null);
        $this->assertEqualsWithDelta(100000.0, $this->left('Flour'), 0.001);
        $this->assertEqualsWithDelta(10000.0, $this->left('Onion'), 0.001);
        $this->assertSame(20.0, $this->left('Coke'));
        $this->assertCount(1, $this->cancelled);
    }

    public function test_the_cost_is_booked_to_cost_of_sales_in_one_journal(): void
    {
        $this->posted = [];
        $this->sell($this->jumbo, [$this->slot['Drink'] => [$this->side['Coke']]]);
        $this->assertCount(1, $this->posted);
        $this->assertEqualsWithDelta(1.0 + 2.0 + 30.0, array_sum(array_map(fn ($e) => $e['side'] === 'D' ? $e['amount'] : 0, $this->posted[0]['entries'])), 0.001, 'bread 1 + choma 2 + a coke at 30');
    }

    public function test_a_dish_with_no_picks_still_uses_its_own_recipe(): void
    {
        $plain = $this->dish('Plain', 100);
        app(DishRecipes::class)->save($plain, ['yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 50]]]);
        $v = $this->sale([['dish' => $plain, 'qty' => 2]]);
        app(DishStock::class)->apply($v, null);
        $this->assertEqualsWithDelta(100.0, 100000 - $this->left('Flour'), 0.001);
    }

    // ------------------------------------------------------------ what can be sold now

    public function test_a_dish_with_a_makeup_can_be_sold_as_many_times_as_its_sides_allow(): void
    {
        $info = app(\App\Services\Menus\DishInfo::class);
        // bread 10 g and choma 2 x 10 g a meal at jumbo (the greater of the kids and jumbo needs decides with no size asked): 100000 g is plenty
        $this->assertSame(5000.0, $info->portions($this->meal, 1), 'choma at jumbo is 2 portions of 10 g, bread 10 g: flour 100000 / 20 for the choma, and the cake is not made, so choma decides');
    }

    public function test_one_of_a_choose_one_slot_is_enough_and_a_missing_always_included_side_stops_the_dish(): void
    {
        $stock = app(\App\Services\Menus\SideStock::class);
        \App\Models\Menus\StockBatch::query()->update(['qty_left' => 0]);
        $this->shelve('Coke 500ml', 5, 30);
        $this->assertSame(0.0, $stock->portions($this->meal, 1), 'no flour: no bread');
        $this->assertSame(0.0, app(\App\Services\Menus\DishInfo::class)->portions($this->meal, 1));
        $this->assertSame(0.0, $stock->portions($this->meal, 2), 'another branch holds nothing');
    }

    public function test_a_side_made_ahead_counts_by_what_is_on_the_prepared_shelf_and_a_short_order_is_named(): void
    {
        $stock = app(\App\Services\Menus\SideStock::class);
        $cake = \App\Models\Menus\Side::find($this->side['Cake']);
        $this->assertSame(0.0, $stock->available($cake, 1));
        app(PrepProduction::class)->run($this->cakeRecipe, 1, 6, ['date' => '2026-10-17']);
        $this->assertSame(6.0, $stock->available($cake, 1));
        $this->assertSame(['Cake' => 2.0], $stock->short([$this->side['Cake'] => 8.0, $this->side['Bread'] => 10.0], 1));
        $this->assertSame([], $stock->short([$this->side['Cake'] => 6.0], 1));
    }
}
