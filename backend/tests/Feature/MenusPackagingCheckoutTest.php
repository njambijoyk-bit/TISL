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
use App\Services\Menus\PackagingCheckout;
use App\Models\Menus\OrderPackaging;
use App\Services\Books\BooksException;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus packaging, build step 5.4 (script 209): the checkout list, as the cashier changed it, and what is kept with the order. */
class MenusPackagingCheckoutTest extends TestCase
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
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql', '209_menus_order_packaging.sql', '210_menus_order_packaging_waived.sql');
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

    /** Someone who may, or may not, waive packaging (the permission is data: the stand-in answers for the one permission asked about). */
    private function person(bool $mayWaive): \App\Models\User
    {
        $u = new class() extends \App\Models\User {
            public bool $may = false;

            public function hasPermission(string $permission): bool
            {
                return $permission === 'menus.packaging.waive' && $this->may;
            }
        };
        $u->may = $mayWaive;
        $u->forceFill(['id' => $mayWaive ? 11 : 12]);

        return $u;
    }

    private function co(): PackagingCheckout
    {
        return app(PackagingCheckout::class);
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

    private function resolve(array $items, ?array $given, bool $takeaway = true): array
    {
        return array_column($this->co()->resolve($this->lines($items), $takeaway, $given), null, 'item_id');
    }

    private function meal(int $n = 2): array
    {
        return [['dish_id' => $this->meal->id, 'quantity' => $n]];
    }

    private function ruled(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'compulsory' => true, 'charged' => true]), $this->rule($this->foil)]);
    }

    public function test_with_no_changes_the_list_is_the_rules_list(): void
    {
        $this->ruled();
        $r = $this->resolve($this->meal(), null);
        $this->assertSame([[4, 4, 'rule', false], [2, 2, 'rule', false]], [[$r[$this->box]['quantity'], $r[$this->box]['asked'], $r[$this->box]['source'], $r[$this->box]['removed']], [$r[$this->foil]['quantity'], $r[$this->foil]['asked'], $r[$this->foil]['source'], $r[$this->foil]['removed']]]);
        $this->assertSame($r, $this->resolve($this->meal(), []), 'an empty list of changes is no change');
    }

    public function test_a_count_can_be_changed_and_an_item_taken_off_with_a_reason_and_it_stays_on_the_list_as_removed(): void
    {
        $this->ruled();
        $r = $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 3], ['item_id' => $this->foil, 'quantity' => 0, 'reason' => '  brought their own  ']]);
        $this->assertSame([3, 45.0, 4], [$r[$this->box]['quantity'], $r[$this->box]['amount'], $r[$this->box]['asked']]);
        $this->assertSame([0, true, 'brought their own', 2], [$r[$this->foil]['quantity'], $r[$this->foil]['removed'], $r[$this->foil]['reason'], $r[$this->foil]['asked']]);
        $this->assertSame(0.0, $r[$this->foil]['amount']);
    }

    public function test_an_item_can_be_swapped_for_another_and_the_price_is_the_new_ones_from_the_list(): void
    {
        $this->ruled();
        $r = $this->resolve($this->meal(), [['item_id' => $this->bag, 'replaces' => $this->box]]);
        $this->assertArrayNotHasKey($this->box, $r);
        $this->assertSame([4, 5.0, 20.0, 'swapped', $this->box, true, 4], [$r[$this->bag]['quantity'], $r[$this->bag]['unit_price'], $r[$this->bag]['amount'], $r[$this->bag]['source'], $r[$this->bag]['replaces_item_id'], $r[$this->bag]['compulsory'], $r[$this->bag]['asked']], 'the count and the compulsory flag carry over, the price is the bag\'s');
        $this->makeIngredient('Lid', $this->each, null, [['name' => 'Lid']], 'preferred', ['kind_id' => (int) IngredientKind::where('code', 'packaging')->value('id')]);
        $lid = $this->itemId('Lid');
        $free = $this->resolve($this->meal(), [['item_id' => $lid, 'replaces' => $this->box, 'quantity' => 1]]);
        $this->assertSame([false, 0.0], [$free[$lid]['charged'], $free[$lid]['amount']], 'a swap for an item with no price is free');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->foil, 'replaces' => $this->box]]), 'already on the list');
    }

    public function test_any_packaging_item_can_be_added_and_is_priced_from_the_list_never_typed(): void
    {
        $this->ruled();
        $r = $this->resolve($this->meal(), [['item_id' => $this->bag, 'quantity' => 3, 'price' => 0.01]]);
        $this->assertSame([3, 15.0, 'added', 0, true, false], [$r[$this->bag]['quantity'], $r[$this->bag]['amount'], $r[$this->bag]['source'], $r[$this->bag]['asked'], $r[$this->bag]['charged'], $r[$this->bag]['compulsory']]);
        $this->assertSame(4, $r[$this->box]['quantity'], 'the rest is as the rules made it');
    }

    public function test_a_bad_change_is_refused(): void
    {
        $this->ruled();
        $soap = $this->makeIngredient('Soap', $this->each, null, [['name' => 'Soap']], 'preferred', ['kind_id' => (int) IngredientKind::where('code', 'supplies')->value('id')]);
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->itemId('Soap'), 'quantity' => 1]]), 'not packaging that can be put on an order');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 100]]), 'from 0 to 99');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => -1]]), 'from 0 to 99');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 1], ['item_id' => $this->box, 'quantity' => 2]]), 'same item twice');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->bag, 'replaces' => $this->bag]]), 'not on the list to be swapped');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->bag, 'replaces' => $this->box], ['item_id' => $this->bag, 'quantity' => 1]]), 'same item twice');
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => 99999, 'quantity' => 1]]), 'not there any more');
    }

    public function test_a_sale_keeps_the_list_it_was_checked_out_with_including_what_was_taken_off_and_why(): void
    {
        $this->ruled();
        $o = app(CounterService::class)->sell(['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]],
            'packaging' => [['item_id' => $this->box, 'quantity' => 3], ['item_id' => $this->foil, 'quantity' => 0, 'reason' => 'brought their own']]], $this->person(true), $this->now);
        $rows = OrderPackaging::where('order_id', $o->id)->orderBy('name')->get();
        $this->assertSame([['Container', 3, 4, 'rule', null], ['Foil', 0, 2, 'rule', 'brought their own']], $rows->map(fn ($r) => [$r->name, $r->quantity, $r->asked, $r->source, $r->reason])->all());
        $this->assertSame(['Container', 'Foil'], array_column($this->co()->forOrder($o), 'name'));
        $this->assertTrue($this->co()->forOrder($o)[1]['removed']);
    }

    public function test_a_tab_is_checked_out_when_it_is_paid_with_all_its_rounds_and_a_meal_eaten_in_has_no_list(): void
    {
        $this->ruled();
        $tab = app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $this->assertSame(0, OrderPackaging::where('order_id', $tab->id)->count(), 'nothing is kept until it is paid');
        $tab = app(CounterService::class)->addToTab($tab, ['items' => $this->meal(2)], null, $this->now);
        $q = app(CounterService::class)->quoteTab($tab, ['packaging' => [['item_id' => $this->foil, 'quantity' => 1]]]);
        $this->assertSame([6, 1], [array_column($q['packaging'], 'quantity', 'item_id')[$this->box], array_column($q['packaging'], 'quantity', 'item_id')[$this->foil]], 'three meals: 2 containers each; the foil changed to 1');
        $this->assertSame([$this->bag, $this->box, $this->foil], array_column($q['packaging_choices'], 'item_id'), 'the items that may be added or swapped in, by name');
        app(CounterService::class)->settleTab($tab, ['tenders' => [['payment_method_id' => 1, 'amount' => 9000]], 'packaging' => [['item_id' => $this->box, 'quantity' => 5]]], $this->person(true));
        $this->assertSame([5, 3], [(int) OrderPackaging::where('order_id', $tab->id)->where('item_id', $this->box)->value('quantity'), (int) OrderPackaging::where('order_id', $tab->id)->where('item_id', $this->foil)->value('quantity')]);
        $dine = app(CounterService::class)->quote(['items' => $this->meal(), 'service' => 'dine_in'], $this->now);
        $this->assertSame([[], []], [$dine['packaging'], $dine['packaging_choices']]);
    }

    public function test_before_script_209_an_unchanged_list_still_works_and_a_changed_one_says_which_script(): void
    {
        $this->ruled();
        \Illuminate\Support\Facades\Schema::drop('menus_order_packaging');
        $this->assertFalse(PackagingCheckout::installed());
        $this->assertCount(2, $this->co()->resolve($this->lines($this->meal()), true, null));
        $this->fails(fn () => $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 1]]), '209_menus_order_packaging');
        $o = app(CounterService::class)->sell(['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now);
        $this->assertSame([], $this->co()->forOrder($o));
    }

    // ------------------------------------------------------------ 5.5 waiving

    public function test_taking_off_or_reducing_a_compulsory_priced_line_is_a_waiver_for_the_amount_given_up(): void
    {
        $this->ruled();
        $none = $this->resolve($this->meal(), null);
        $this->assertSame([0.0, 0.0], [$none[$this->box]['waived'], $none[$this->foil]['waived']]);
        $fewer = $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 3]]);
        $this->assertSame(15.0, $fewer[$this->box]['waived'], 'one container of 4 not charged');
        $off = $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 0, 'reason' => 'own pot']]);
        $this->assertSame(60.0, $off[$this->box]['waived']);
        $swapped = $this->resolve($this->meal(), [['item_id' => $this->bag, 'replaces' => $this->box]]);
        $this->assertSame(40.0, $swapped[$this->bag]['waived'], '4 x 15 asked, 4 x 5 charged: the 40 difference is waived');
        $more = $this->resolve($this->meal(), [['item_id' => $this->box, 'quantity' => 6], ['item_id' => $this->bag, 'quantity' => 2]]);
        $this->assertSame([0.0, 0.0], [$more[$this->box]['waived'], $more[$this->bag]['waived']], 'more, or an addition, is never a waiver');
        $freeOff = $this->resolve($this->meal(), [['item_id' => $this->foil, 'quantity' => 0]]);
        $this->assertSame(0.0, $freeOff[$this->foil]['waived'], 'a free line can be taken off by anyone');
    }

    public function test_an_optional_priced_line_and_a_compulsory_free_line_can_be_removed_freely(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->bag, ['charged' => true]), $this->rule($this->foil, ['compulsory' => true])]);
        $r = $this->resolve($this->meal(1), [['item_id' => $this->bag, 'quantity' => 0], ['item_id' => $this->foil, 'quantity' => 0]]);
        $this->assertSame([0.0, 0.0], [$r[$this->bag]['waived'], $r[$this->foil]['waived']]);
        $this->assertFalse($r[$this->bag]['needs_waive']);
        $o = app(CounterService::class)->sell(['items' => $this->meal(1), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]],
            'packaging' => [['item_id' => $this->bag, 'quantity' => 0], ['item_id' => $this->foil, 'quantity' => 0]]], $this->person(false), $this->now);
        $this->assertSame(2, OrderPackaging::where('order_id', $o->id)->count());
    }

    public function test_a_sale_that_waives_needs_the_permission_and_is_refused_without_it_and_nothing_is_kept(): void
    {
        $this->ruled();
        $in = ['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]], 'packaging' => [['item_id' => $this->box, 'quantity' => 0, 'reason' => 'own pot']]];
        $this->fails(fn () => app(CounterService::class)->sell($in, $this->person(false), $this->now), 'Only someone who may waive packaging');
        $this->fails(fn () => app(CounterService::class)->sell($in, null, $this->now), 'Only someone who may waive packaging');
        $this->assertSame([0, 0], [OrderPackaging::count(), \App\Models\Menus\MenuOrder::count()], 'a refused sale leaves nothing behind');
        $o = app(CounterService::class)->sell($in, $this->person(true), $this->now);
        $row = OrderPackaging::where('order_id', $o->id)->where('item_id', $this->box)->first();
        $this->assertSame([0, 60.0, 11, 'own pot'], [$row->quantity, (float) $row->waived_amount, (int) $row->waived_by, $row->reason], 'logged: how much, and who');
        $this->assertSame(60.0, array_sum(array_column($this->co()->forOrder($o), 'waived')));
    }

    public function test_the_quote_says_what_would_be_waived_and_whether_this_person_may(): void
    {
        $this->ruled();
        $in = ['items' => $this->meal(), 'service' => 'take_out', 'packaging' => [['item_id' => $this->box, 'quantity' => 3]]];
        $q = app(CounterService::class)->quote($in, $this->now, $this->person(false));
        $this->assertSame([15.0, ['Container'], false], [$q['packaging_waiver']['amount'], $q['packaging_waiver']['items'], $q['packaging_waiver']['allowed']]);
        $q = app(CounterService::class)->quote($in, $this->now, $this->person(true));
        $this->assertTrue($q['packaging_waiver']['allowed']);
        $q = app(CounterService::class)->quote(['items' => $this->meal(), 'service' => 'take_out'], $this->now, $this->person(false));
        $this->assertSame([0.0, []], [$q['packaging_waiver']['amount'], $q['packaging_waiver']['items']], 'no changes, nothing waived');
    }

    public function test_before_script_210_the_permission_is_still_asked_and_the_sale_still_saves(): void
    {
        $this->ruled();
        \Illuminate\Support\Facades\Schema::table('menus_order_packaging', function ($t) { $t->dropColumn(['waived_amount', 'waived_by']); });
        $in = ['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]], 'packaging' => [['item_id' => $this->box, 'quantity' => 0]]];
        $this->fails(fn () => app(CounterService::class)->sell($in, $this->person(false), $this->now), 'Only someone who may waive packaging');
        $o = app(CounterService::class)->sell($in, $this->person(true), $this->now);
        $this->assertSame(0, (int) OrderPackaging::where('order_id', $o->id)->where('item_id', $this->box)->value('quantity'));
    }
}
