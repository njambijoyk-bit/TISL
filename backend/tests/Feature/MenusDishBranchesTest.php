<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusDishController;
use App\Models\Menus\Dish;
use App\Services\Books\BooksException;
use App\Services\Menus\DishBranches;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishSelection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Script 226: dishes are shared, but a branch may not serve one and may price it (and its sizes) differently. */
class MenusDishBranchesTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private Dish $dish;
    private int $other;
    private int $jumbo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '226_menus_dish_branches.sql');
        $this->other = DB::table('locations')->insertGetId(['name' => 'Westlands', 'is_active' => 1, 'is_default' => 0]);
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->dish = Dish::create(['name' => 'Chips', 'slug' => 'chips', 'price' => 300, 'is_active' => true]);
        $r = app(\App\Services\Menus\DishRecipes::class)->saveStandalone(['name' => 'Chips', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->flour(), 'quantity' => 10]]]);
        $side = app(\App\Services\Menus\Sides::class)->save(['name' => 'Chips', 'recipe_id' => $r->id]);
        app(DishMakeup::class)->save($this->dish, ['servings' => [['serving_id' => $this->jumbo, 'price' => 400]], 'slots' => [['name' => 'Plate', 'kind' => 'fixed', 'choices' => [['side_id' => $side->id]]]]]);
        DishBranches::forget();
    }

    private function flour(): int
    {
        $this->pantry('Flour', 1000, 0.1);

        return (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id');
    }

    private function save(array $rows)
    {
        return app(DishBranches::class)->save($this->dish, $rows);
    }

    public function test_with_no_row_a_dish_is_served_everywhere_at_its_own_price(): void
    {
        $this->assertTrue(DishBranches::available($this->dish, $this->other));
        $this->assertSame(300.0, DishBranches::price($this->dish, $this->other));
        $this->assertSame(400.0, app(DishSelection::class)->resolve($this->dish, $this->jumbo, [], $this->other)['unit_price']);
    }

    public function test_a_branch_can_price_the_dish_and_its_sizes_itself_and_others_keep_theirs(): void
    {
        $this->save([['location_id' => $this->other, 'is_available' => true, 'price' => 350, 'size_prices' => [$this->jumbo => 450]]]);
        $this->assertSame(350.0, DishBranches::price($this->dish, $this->other));
        $this->assertSame(450.0, app(DishSelection::class)->resolve($this->dish, $this->jumbo, [], $this->other)['unit_price']);
        $this->assertSame(300.0, DishBranches::price($this->dish, 1), 'the first branch has no row');
        $this->assertSame(400.0, app(DishSelection::class)->resolve($this->dish, $this->jumbo, [], 1)['unit_price']);
        $this->assertSame(350.0, app(DishInfo::class)->money($this->dish->fresh(), $this->other)['price'], 'the Dishes page money follows the branch');
    }

    public function test_a_branch_that_does_not_serve_the_dish_has_none_available_and_the_order_is_refused(): void
    {
        $this->save([['location_id' => $this->other, 'is_available' => false]]);
        $this->assertFalse(DishBranches::available($this->dish, $this->other));
        $this->assertSame(0.0, app(DishInfo::class)->portions($this->dish->fresh(), $this->other));
        $this->assertTrue(DishBranches::available($this->dish, 1));
        $loc = \App\Models\Location::find($this->other);
        $channel = \App\Models\Menus\Channel::first() ?? \App\Models\Menus\Channel::create(['code' => 'counter', 'name' => 'Counter', 'is_active' => true]);
        try {
            app(\App\Services\Menus\MenuOrderService::class)->dishLines($channel, $loc, now(), [['dish_id' => $this->dish->id, 'quantity' => 1, 'option_ids' => [], 'note' => null, 'serving_id' => $this->jumbo]]);
            $this->fail('ordered');
        } catch (BooksException $e) {
            $this->assertSame('Chips is not served at Westlands.', $e->getMessage());
        }
    }

    public function test_a_branch_back_to_normal_loses_its_row_and_bad_input_is_refused(): void
    {
        $this->save([['location_id' => $this->other, 'is_available' => false, 'price' => 350]]);
        $this->assertSame(1, DB::table('menus_dish_branches')->count());
        $this->save([['location_id' => $this->other, 'is_available' => true, 'price' => '', 'size_prices' => [$this->jumbo => '']]]);
        $this->assertSame(0, DB::table('menus_dish_branches')->count(), 'served at its own prices: no row');
        foreach ([[['location_id' => 9999], 'not there any more'], [['location_id' => $this->other, 'price' => -1], 'less than nothing'], [['location_id' => $this->other, 'size_prices' => [999 => 5]], 'not sold in that size']] as [$row, $part]) {
            try {
                $this->save([$row]);
                $this->fail('saved');
            } catch (BooksException $e) {
                $this->assertStringContainsString($part, $e->getMessage());
            }
        }
    }

    public function test_the_dishes_door_shows_each_branch_and_the_dish_row_says_how_it_stands_at_the_chosen_one(): void
    {
        $this->save([['location_id' => $this->other, 'is_available' => false, 'price' => 350]]);
        $c = app(MenusDishController::class);
        $shown = $c->branches($this->dish->id)->getData(true);
        $west = collect($shown['branches'])->firstWhere('location_id', $this->other);
        $this->assertSame([true, false, 350], [$shown['ready'], $west['is_available'], $west['price']]);
        $this->assertSame([['serving_id' => $this->jumbo, 'serving' => 'Jumbo', 'price' => 400]], $shown['servings']);
        $row = collect($c->index(Request::create('/x', 'GET', ['location_id' => $this->other]))->getData(true)['dishes'])->firstWhere('name', 'Chips');
        $this->assertSame([350, false], [$row['branch_price'], $row['branch_available']]);
        $this->assertSame(200, $c->saveBranches(Request::create('/x', 'PUT', ['branches' => [['location_id' => $this->other, 'is_available' => true, 'price' => 320]]]), $this->dish->id)->getStatusCode());
        $this->assertSame(320.0, DishBranches::price($this->dish, $this->other));
    }

    public function test_the_menu_a_branch_shows_leaves_out_a_dish_it_does_not_serve_and_carries_its_prices(): void
    {
        $menu = \App\Models\Menus\Menu::first() ?? app(\App\Services\Menus\MenuService::class)->save(['name' => 'All day']);
        $section = $menu->sections()->first() ?? $menu->sections()->create(['name' => 'Sides']);
        DB::table('menus_section_dishes')->insert(['section_id' => $section->id, 'dish_id' => $this->dish->id, 'sort_order' => 1]);
        $this->save([['location_id' => $this->other, 'is_available' => true, 'price' => 350, 'size_prices' => [$this->jumbo => 450]]]);
        $dishesOf = fn (int $loc) => collect(app(\App\Services\Menus\PublicMenu::class)->build(now(), $loc)['menus'])->flatMap(fn ($m) => $m['sections'])->flatMap(fn ($sec) => $sec['dishes'])->firstWhere('name', 'Chips');
        $west = $dishesOf($this->other);
        $this->assertSame([350.0, 450.0], [$west['price'], $west['makeup']['servings'][0]['price']]);
        $this->assertSame([300.0, 400.0], [$dishesOf(1)['price'], $dishesOf(1)['makeup']['servings'][0]['price']]);
        $this->save([['location_id' => $this->other, 'is_available' => false]]);
        $this->assertNull($dishesOf($this->other), 'not on the menu at a branch that does not serve it');
        $this->assertNotNull($dishesOf(1));
    }
}
