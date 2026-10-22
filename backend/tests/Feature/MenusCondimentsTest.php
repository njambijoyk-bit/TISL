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
use App\Services\Menus\Condiments;
use App\Models\Menus\OrderCondiment;
use App\Services\Menus\PackagingCheckout;
use App\Models\Menus\OrderPackaging;
use App\Services\Books\BooksException;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus free condiments, build step 5.8 (script 211): an allowance on the dish, what is given at checkout, a warning and never a block. */
class MenusCondimentsTest extends TestCase
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
        $this->app->instance(\App\Services\Menus\PackagingStock::class, $this->createMock(\App\Services\Menus\PackagingStock::class));   // the stock side has its own test
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql', '209_menus_order_packaging.sql', '211_menus_condiments.sql', '209_menus_order_packaging.sql', '210_menus_order_packaging_waived.sql');
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

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
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

    private function fries(): \App\Models\Menus\Dish
    {
        $this->pantry('Ketchup', 100, 0.5);
        $this->pantry('Mayo', 100, 0.5);

        return $this->snack;
    }

    private function allow(): void
    {
        app(Condiments::class)->save($this->fries(), [['ingredient_id' => $this->ing('Ketchup'), 'quantity' => 2], ['ingredient_id' => $this->ing('Mayo'), 'quantity' => 1]]);
    }

    private function items(int $n = 3): array
    {
        return [['dish_id' => $this->snack->id, 'quantity' => $n]];
    }

    public function test_a_dish_has_an_allowance_that_is_kept_and_checked(): void
    {
        $this->allow();
        $shown = app(Condiments::class)->show($this->snack);
        $this->assertSame([['Ketchup', 2], ['Mayo', 1]], array_map(fn ($a) => [$a['name'], $a['quantity']], $shown['allowance']));
        $this->assertContains('Ketchup', array_column($shown['items'], 'name'));
        $box = collect($shown['items'])->firstWhere('name', 'Container');
        $this->assertSame('packaging', $box['kind_code'], 'every ingredient says its kind, so the form can offer one kind at a time');
        $this->fails(fn () => app(Condiments::class)->save($this->snack, [['ingredient_id' => $this->ing('Ketchup'), 'quantity' => 0]]), 'from 1 to 99');
        $this->fails(fn () => app(Condiments::class)->save($this->snack, [['ingredient_id' => $this->ing('Ketchup'), 'quantity' => 1], ['ingredient_id' => $this->ing('Ketchup'), 'quantity' => 2]]), 'listed twice');
        $this->fails(fn () => app(Condiments::class)->save($this->snack, [['ingredient_id' => 99999, 'quantity' => 1]]), 'not there any more');
        $this->assertCount(2, app(Condiments::class)->show($this->snack)['allowance'], 'a refused save changes nothing');
        app(Condiments::class)->save($this->snack, []);
        $this->assertSame([], app(Condiments::class)->show($this->snack)['allowance']);
    }

    public function test_the_allowance_of_an_order_is_each_dishs_count_times_the_dishes_sold_added_up(): void
    {
        $this->allow();
        app(Condiments::class)->save($this->meal, [['ingredient_id' => $this->ing('Ketchup'), 'quantity' => 1]]);
        $r = array_column(app(Condiments::class)->resolve($this->lines([['dish_id' => $this->snack->id, 'quantity' => 3], ['dish_id' => $this->meal->id, 'quantity' => 2]]), null), null, 'name');
        $this->assertSame([8, 8, false, null], [$r['Ketchup']['allowed'], $r['Ketchup']['given'], $r['Ketchup']['differs'], $r['Ketchup']['warning']], '3 x 2 and 2 x 1');
        $this->assertSame(3, $r['Mayo']['allowed']);
    }

    public function test_giving_a_different_count_is_a_warning_never_a_block(): void
    {
        $this->allow();
        $lines = $this->lines($this->items());
        $r = array_column(app(Condiments::class)->resolve($lines, [['ingredient_id' => $this->ing('Ketchup'), 'given' => 9], ['ingredient_id' => $this->ing('Mayo'), 'given' => 0]]), null, 'name');
        $this->assertSame([9, true, '9 Ketchup given, 6 allowed.'], [$r['Ketchup']['given'], $r['Ketchup']['differs'], $r['Ketchup']['warning']]);
        $this->assertSame([0, true, 'Only 0 Mayo given, 3 allowed.'], [$r['Mayo']['given'], $r['Mayo']['differs'], $r['Mayo']['warning']]);
        $q = app(CounterService::class)->quote(['items' => $this->items(), 'service' => 'take_out', 'condiments' => [['ingredient_id' => $this->ing('Ketchup'), 'given' => 9]]], $this->now);
        $this->assertTrue(array_column($q['condiments'], 'differs', 'name')['Ketchup'], 'the quote carries the warning, and still prices the order');
        $this->assertGreaterThan(0, $q['total']);
        $o = app(CounterService::class)->sell(['items' => $this->items(), 'service' => 'dine_in', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]], 'condiments' => [['ingredient_id' => $this->ing('Ketchup'), 'given' => 9]]], null, $this->now);
        $this->assertSame([[6, 9], [3, 3]], OrderCondiment::where('order_id', $o->id)->orderBy('name')->get()->map(fn ($c) => [$c->allowed, $c->given])->all(), 'it went through, and the order keeps what was allowed and what was given');
    }

    public function test_only_a_condiment_of_the_dishes_ordered_can_be_given_and_condiments_are_the_same_dining_in(): void
    {
        $this->allow();
        $this->pantry('Salt', 10, 0.1);
        $this->fails(fn () => app(Condiments::class)->resolve($this->lines($this->items()), [['ingredient_id' => $this->ing('Salt'), 'given' => 1]]), 'not a free condiment of any dish');
        $this->fails(fn () => app(Condiments::class)->resolve($this->lines($this->items()), [['ingredient_id' => $this->ing('Ketchup'), 'given' => 1], ['ingredient_id' => $this->ing('Ketchup'), 'given' => 2]]), 'same item twice');
        $this->fails(fn () => app(Condiments::class)->resolve($this->lines($this->items()), [['ingredient_id' => $this->ing('Ketchup'), 'given' => -1]]), 'from 0 up');
        $dine = app(CounterService::class)->quote(['items' => $this->items(), 'service' => 'dine_in'], $this->now);
        $this->assertCount(2, $dine['condiments'], 'eaten in: the ketchup still goes with the fries');
        $this->assertSame(0.0, (float) array_sum(array_column($dine['condiments'], 'allowed')) - 9.0);
    }

    public function test_the_packers_are_told_what_to_give_and_a_tab_shows_the_allowance_until_it_is_paid(): void
    {
        $this->allow();
        $tab = app(CounterService::class)->openTab(['items' => $this->items(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $card = app(\App\Services\Menus\KitchenService::class)->screen(\App\Models\Menus\Station::first(), $this->now)['tickets'][0];
        $this->assertSame([['Ketchup', 2], ['Mayo', 1]], array_map(fn ($c) => [$c['name'], $c['quantity']], $card['condiments']));
        app(CounterService::class)->settleTab($tab, ['tenders' => [['payment_method_id' => 1, 'amount' => 5000]], 'condiments' => [['ingredient_id' => $this->ing('Mayo'), 'given' => 0]]]);
        $this->assertSame([['Ketchup', 2]], array_map(fn ($c) => [$c['name'], $c['quantity']], app(Condiments::class)->forPackers($tab->fresh())), 'what was given, not what was allowed');
    }

    public function test_deleting_a_dish_takes_its_allowance_and_before_script_211_nothing_breaks(): void
    {
        $this->allow();
        Condiments::forget($this->snack->id);
        $this->assertSame([], app(Condiments::class)->show($this->snack)['allowance']);
        \Illuminate\Support\Facades\Schema::drop('menus_dish_condiments');
        $this->assertFalse(Condiments::installed());
        $this->assertSame([], app(Condiments::class)->resolve($this->lines($this->items()), null));
        $this->fails(fn () => app(Condiments::class)->resolve($this->lines($this->items()), [['ingredient_id' => 1, 'given' => 1]]), '211_menus_condiments');
        $this->fails(fn () => app(Condiments::class)->save($this->snack, []), '211_menus_condiments');
        $this->assertSame([], app(Condiments::class)->forPackers((new \App\Models\Menus\MenuOrder())->forceFill(['id' => 1])));
    }
}
