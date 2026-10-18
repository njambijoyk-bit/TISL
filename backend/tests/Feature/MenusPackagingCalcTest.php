<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\Side;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\MenuService;
use App\Services\Menus\PackagingCalc;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus packaging, build step 5.3: what takeaway packaging an order needs, and what it costs. */
class MenusPackagingCalcTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private int $box;
    private int $bag;
    private int $foil;
    private Side $stew;
    private Side $rice;
    private Dish $meal;
    private Dish $snack;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql');
        app(IngredientKinds::class)->seedDefaults();
        $packaging = (int) IngredientKind::where('code', 'packaging')->value('id');
        foreach (['Container' => 'box', 'Bag' => 'bag', 'Foil' => 'foil'] as $name => $prop) {
            $this->makeIngredient($name, $this->each, null, [['name' => $name]], 'preferred', ['kind_id' => $packaging]);
            $this->$prop = $this->itemId($name);
        }
        MenusSettings::save(['packaging_kind_id' => $packaging], null);
        app(PackagingPrices::class)->save([['item_id' => $this->box, 'price' => 15], ['item_id' => $this->bag, 'price' => 5]]);
        $this->pantry('Flour', 100000, 0.1);
        $recipes = app(DishRecipes::class);
        $flour = (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id');
        $this->stew = app(Sides::class)->save(['name' => 'Stew', 'recipe_id' => $recipes->saveStandalone(['name' => 'Stew', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $flour, 'quantity' => 10]]])->id]);
        $this->rice = app(Sides::class)->save(['name' => 'Rice', 'recipe_id' => $recipes->saveStandalone(['name' => 'Rice', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $flour, 'quantity' => 10]]])->id]);
        $this->meal = $this->make('Meal', 400);
        app(DishMakeup::class)->save($this->meal, ['slots' => [['name' => 'Main', 'kind' => 'fixed', 'choices' => [['side_id' => $this->stew->id]]], ['name' => 'Starch', 'kind' => 'fixed', 'choices' => [['side_id' => $this->rice->id]]]]]);
        $this->snack = $this->make('Snack', 100);
        $this->stockDish($this->snack, 50);
        $menu = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $sec = $menu->sections()->first() ?? $menu->sections()->create(['name' => 'Mains']);
        foreach ([$this->meal, $this->snack] as $d) {
            DB::table('menus_section_dishes')->insert(['section_id' => $sec->id, 'dish_id' => $d->id]);
        }
    }

    protected function tearDown(): void
    {
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
    }

    private function rule(int $item, array $o = []): array
    {
        return $o + ['item_id' => $item, 'scope' => 'per_dish', 'quantity' => 1, 'compulsory' => false, 'charged' => false, 'receipt' => 'auto'];
    }

    private function rules(): PackagingRules
    {
        return app(PackagingRules::class);
    }

    /** The priced lines of an order, as the counter prepares them. */
    private function lines(array $items): array
    {
        $svc = app(MenuOrderService::class);

        return $svc->dishLines(\App\Models\Menus\Channel::where('code', 'counter')->first(), (new \App\Models\Location())->forceFill(['id' => self::BRANCH]), $this->now, $svc->wanted($items))[0];
    }

    private function calc(array $items, bool $takeaway = true): array
    {
        return array_column(app(PackagingCalc::class)->forLines($this->lines($items), $takeaway), null, 'name');
    }

    public function test_a_per_dish_rule_counts_once_for_each_dish_sold_and_is_priced_from_the_list(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'compulsory' => true, 'charged' => true, 'receipt' => 'always'])]);
        $p = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 3]]);
        $c = $p['Container'];
        $this->assertSame([6, 15.0, 90.0, true, true, true, 'always', ['Stew']], [$c['quantity'], $c['unit_price'], $c['amount'], $c['charged'], $c['compulsory'], $c['needs_waive'], $c['receipt'], $c['from']], '2 for each of 3 meals, 15 each');
        $this->assertSame([true], [$c['shown']]);
    }

    public function test_a_per_order_rule_counts_once_whatever_is_ordered_and_the_largest_wins(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 1])]);
        $this->rules()->save('side', $this->rice->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 3])]);
        $p = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 4]]);
        $this->assertSame(3, $p['Bag']['quantity'], 'not 1 + 3, and not times four');
        $this->rules()->save('dish', $this->snack->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 2])]);
        $this->assertSame(3, $this->calc([['dish_id' => $this->meal->id, 'quantity' => 1], ['dish_id' => $this->snack->id, 'quantity' => 6]])['Bag']['quantity'], 'two dishes ask for the order: the larger of 3 and 2, not 5');
    }

    public function test_the_same_item_asked_for_both_ways_adds_the_two_and_a_dish_override_replaces_its_sides(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->bag, ['quantity' => 1])]);
        $this->rules()->save('side', $this->rice->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 2])]);
        $this->assertSame(2 * 1 + 2, $this->calc([['dish_id' => $this->meal->id, 'quantity' => 2]])['Bag']['quantity'], '1 for each of 2 meals, and 2 for the order');
        $this->rules()->save('dish', $this->meal->id, [$this->rule($this->bag, ['quantity' => 5])]);
        $this->assertSame(10, $this->calc([['dish_id' => $this->meal->id, 'quantity' => 2]])['Bag']['quantity'], 'the dish says 5 for each: its sides\' rules for the bag are replaced');
    }

    public function test_rules_of_different_dishes_add_up_per_dish_and_a_dish_without_rules_adds_nothing(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->foil)]);
        $this->rules()->save('dish', $this->snack->id, [$this->rule($this->foil, ['quantity' => 2])]);
        $p = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 2], ['dish_id' => $this->snack->id, 'quantity' => 3]]);
        $this->assertSame(2 + 6, $p['Foil']['quantity']);
        $this->assertSame(['Foil'], array_keys($p));
        $this->assertSame(['Foil' => 2], array_map(fn ($l) => $l['quantity'], $this->calc([['dish_id' => $this->snack->id, 'quantity' => 1]])), 'a snack alone follows its own rule');
    }

    public function test_a_free_item_costs_nothing_and_the_receipt_switch_decides_if_it_shows(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->foil, ['receipt' => 'auto']), $this->rule($this->bag, ['receipt' => 'always']), $this->rule($this->box, ['charged' => true, 'receipt' => 'never'])]);
        $p = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 1]]);
        $this->assertSame([0.0, false, false], [$p['Foil']['amount'], $p['Foil']['charged'], $p['Foil']['shown']], 'auto: shown only when charged');
        $this->assertSame([true, false], [$p['Bag']['shown'], $p['Bag']['charged']], 'always: shown though free');
        $this->assertSame([15.0, false], [$p['Container']['amount'], $p['Container']['shown']], 'never: charged but kept off the receipt');
    }

    public function test_only_a_compulsory_and_priced_line_needs_permission_to_waive(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['compulsory' => true, 'charged' => true]), $this->rule($this->bag, ['charged' => true]), $this->rule($this->foil, ['compulsory' => true])]);
        $p = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 1]]);
        $this->assertSame(['Bag' => false, 'Container' => true, 'Foil' => false], array_map(fn ($l) => $l['needs_waive'], $p), 'in name order');
    }

    public function test_nothing_is_needed_for_a_meal_eaten_in_and_the_quote_carries_the_list(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['charged' => true])]);
        $this->assertSame([], $this->calc([['dish_id' => $this->meal->id, 'quantity' => 1]], false));
        $q = app(CounterService::class)->quote(['items' => [['dish_id' => $this->meal->id, 'quantity' => 2]], 'service' => 'take_out'], $this->now);
        $this->assertSame([['Container', 2, 30.0]], array_map(fn ($l) => [$l['name'], $l['quantity'], $l['amount']], $q['packaging']));
        $dine = app(CounterService::class)->quote(['items' => [['dish_id' => $this->meal->id, 'quantity' => 2]], 'service' => 'dine_in'], $this->now);
        $this->assertSame([], $dine['packaging']);
    }

    public function test_a_price_that_has_left_the_list_makes_the_item_free(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['charged' => true])]);
        DB::table('menus_packaging_prices')->where('item_id', $this->box)->update(['is_active' => false]);
        $c = $this->calc([['dish_id' => $this->meal->id, 'quantity' => 1]])['Container'];
        $this->assertSame([false, 0.0], [$c['charged'], $c['amount']]);
    }
}
