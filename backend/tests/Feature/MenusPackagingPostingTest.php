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

/** Menus packaging, build step 5.6: charged packaging is sold with the dishes (its own sales account, the account decides the VAT). */
class MenusPackagingPostingTest extends TestCase
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

    private function ruled(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'charged' => true]), $this->rule($this->foil)]);
    }

    private function meal(int $n = 2): array
    {
        return [['dish_id' => $this->meal->id, 'quantity' => $n]];
    }

    public function test_charged_packaging_is_a_sale_line_of_its_own_with_the_sales_account_of_the_item(): void
    {
        $this->ruled();
        $o = app(CounterService::class)->sell(['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now);
        $custom = array_values(array_filter($this->placed[0]['lines'], fn ($l) => $l['type'] === 'custom'));
        $this->assertSame([['Packaging: Container', 4, 15.0, $this->ledger]], array_map(fn ($l) => [$l['description'], $l['quantity'], (float) $l['rate'], $l['ledger_id']], $custom), 'the free foil is not sold; the account is the packaging default (the dishes\' account here)');
        $this->assertEqualsWithDelta((800 + 60) * 1.16, (float) $o->total, 0.01, 'the dishes and the containers, with tax');
    }

    public function test_the_quote_includes_the_packaging_and_follows_the_cashiers_changes(): void
    {
        $this->ruled();
        $in = ['items' => $this->meal(), 'service' => 'take_out'];
        $this->assertEqualsWithDelta((800 + 60) * 1.16, app(CounterService::class)->quote($in, $this->now)['total'], 0.01);
        $this->assertEqualsWithDelta((800 + 30) * 1.16, app(CounterService::class)->quote($in + ['packaging' => [['item_id' => $this->box, 'quantity' => 2]]], $this->now)['total'], 0.01);
        $this->assertEqualsWithDelta(800 * 1.16, app(CounterService::class)->quote($in + ['packaging' => [['item_id' => $this->box, 'quantity' => 0]]], $this->now)['total'], 0.01, 'taken off: not charged');
        $this->assertEqualsWithDelta(800 * 1.16, app(CounterService::class)->quote(['items' => $this->meal(), 'service' => 'dine_in'], $this->now)['total'], 0.01, 'eaten in: no packaging');
    }

    public function test_the_item_may_name_its_own_sales_account_and_none_at_all_is_refused(): void
    {
        $this->ruled();
        app(PackagingPrices::class)->save([['item_id' => $this->box, 'price' => 15, 'ledger_id' => $this->ledger]]);
        $own = DB::table('ledgers')->insertGetId(['name' => 'Packaging income', 'group_id' => DB::table('ledger_groups')->where('name', 'Sales Accounts')->value('id'), 'tax_nature' => 'taxable']);
        app(PackagingPrices::class)->save([['item_id' => $this->box, 'price' => 15, 'ledger_id' => $own]]);
        app(CounterService::class)->sell(['items' => $this->meal(1), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now);
        $custom = array_values(array_filter($this->placed[0]['lines'], fn ($l) => $l['type'] === 'custom'));
        $this->assertSame([$own], array_column($custom, 'ledger_id'));
        $this->assertSame([], PackagingCheckout::saleRows([]));
        DB::table('menus_packaging_prices')->update(['ledger_id' => null]);
        DB::table('menus_settings')->where('id', 1)->update(['settings' => json_encode(['packaging_kind_id' => (int) IngredientKind::where('code', 'packaging')->value('id'), 'sales_ledger_id' => null])]);
        $this->expectException(\App\Services\Books\BooksException::class);
        $this->expectExceptionMessage('Choose the sales account packaging is booked to');
        app(CounterService::class)->quote(['items' => $this->meal(1), 'service' => 'take_out'], $this->now);
    }

    public function test_a_tab_is_priced_with_its_packaging_only_when_it_is_paid(): void
    {
        $this->ruled();
        $tab = app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $this->assertEqualsWithDelta(400 * 1.16, (float) $tab->total, 0.01, 'the running total is the dishes');
        $q = app(CounterService::class)->quoteTab($tab, []);
        $this->assertEqualsWithDelta((400 + 30) * 1.16, $q['total'], 0.01, 'the bill at the end has the 2 containers');
        app(CounterService::class)->settleTab($tab, ['tenders' => [['payment_method_id' => 1, 'amount' => 5000]]]);
        $this->assertSame(['Packaging: Container'], array_column(array_filter($this->placed[0]['lines'], fn ($l) => $l['type'] === 'custom'), 'description'));
    }

    public function test_an_online_order_carries_the_packaging_in_its_sales_order(): void
    {
        $this->ruled();
        \App\Models\Menus\Channel::where('code', 'counter')->update(['order_type' => 'pickup']);
        $q = app(MenuOrderService::class)->quote(['channel' => 'counter', 'location_id' => self::BRANCH, 'items' => $this->meal(1), 'fulfil' => 'asap', 'name' => 'A', 'phone' => '0700', 'payment_mode' => 'later'], null, $this->now);
        $this->assertEqualsWithDelta((400 + 30) * 1.16, $q['total'], 0.01);
        $this->assertSame([['Container', 2, 30.0], ['Foil', 1, 0.0]], array_map(fn ($l) => [$l['name'], $l['quantity'], $l['amount']], $q['packaging']));
    }

    public function test_the_stock_of_the_packaging_is_taken_after_each_sale_the_till_makes(): void
    {
        $this->ruled();
        $calls = [];
        $fake = $this->createMock(\App\Services\Menus\PackagingStock::class);
        $fake->method('apply')->willReturnCallback(function ($o, $sale) use (&$calls) { $calls[] = [$o->id, $sale->id]; });
        $this->app->instance(\App\Services\Menus\PackagingStock::class, $fake);
        $sold = app(CounterService::class)->sell(['items' => $this->meal(1), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now);
        $tab = app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $this->assertCount(1, $calls, 'a tab takes nothing until it is paid');
        $paid = app(CounterService::class)->settleTab($tab, ['tenders' => [['payment_method_id' => 1, 'amount' => 5000]]]);
        $this->assertSame([$sold->id, $paid->id], array_column($calls, 0));
    }

    // ------------------------------------------------------------ 5.7 the receipt and the packers' ticket

    public function test_the_packers_see_every_line_even_the_ones_the_customer_does_not(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'charged' => true, 'receipt' => 'never']), $this->rule($this->foil, ['receipt' => 'auto']), $this->rule($this->bag, ['receipt' => 'always'])]);
        $o = app(CounterService::class)->sell(['items' => $this->meal(1), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]], null, $this->now)->fresh();
        $text = app(\App\Services\Menus\ReceiptService::class)->for($o, 32)['text'];
        $this->assertStringNotContainsString('Container', $text, 'charged, but the switch says never');
        $this->assertStringNotContainsString('Foil', $text, 'free and auto: not shown');
        $this->assertMatchesRegularExpression('/1  Packaging: Bag\s+free/', $text, 'always: shown, though free');
        $station = \App\Models\Menus\Station::first();
        $card = app(\App\Services\Menus\KitchenService::class)->screen($station, $this->now)['tickets'][0];
        $this->assertSame([['Bag', 1], ['Container', 2], ['Foil', 1]], array_map(fn ($p) => [$p['name'], $p['quantity']], $card['packaging']), 'the packers get the whole list');
        $this->assertSame(['Bag'], array_column(app(\App\Services\Menus\MenuOrderView::class)->customer($o)['packaging'], 'name'), 'the customer\'s page shows what the receipt shows');
        $this->assertCount(3, app(\App\Services\Menus\MenuOrderView::class)->staff($o)['packaging']);
    }

    public function test_a_charged_line_the_receipt_shows_carries_its_amount_and_what_was_taken_off_is_not_listed(): void
    {
        $this->ruled();
        $o = app(CounterService::class)->sell(['items' => $this->meal(), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]], 'packaging' => [['item_id' => $this->foil, 'quantity' => 0, 'reason' => 'own']]], null, $this->now)->fresh();
        $text = app(\App\Services\Menus\ReceiptService::class)->for($o, 32)['text'];
        $this->assertMatchesRegularExpression('/4  Packaging: Container\s+60\.00/', $text);
        $this->assertStringNotContainsString('Foil', $text);
        $card = app(\App\Services\Menus\KitchenService::class)->screen(\App\Models\Menus\Station::first(), $this->now)['tickets'][0];
        $this->assertSame(['Container'], array_column($card['packaging'], 'name'), 'taken off: the packers do not pack it');
    }

    public function test_a_tab_shows_the_packers_what_the_rules_ask_for_and_a_meal_eaten_in_shows_nothing(): void
    {
        $this->ruled();
        app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $card = app(\App\Services\Menus\KitchenService::class)->screen(\App\Models\Menus\Station::first(), $this->now)['tickets'][0];
        $this->assertSame([['Container', 2], ['Foil', 1]], array_map(fn ($p) => [$p['name'], $p['quantity']], $card['packaging']));
        app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'dine_in', 'label' => 'Table 5'], null, $this->now);
        $cards = app(\App\Services\Menus\KitchenService::class)->screen(\App\Models\Menus\Station::first(), $this->now)['tickets'];
        $this->assertSame([], end($cards)['packaging']);
    }

    public function test_only_the_first_ticket_of_an_order_carries_the_list(): void
    {
        $this->ruled();
        $tab = app(CounterService::class)->openTab(['items' => $this->meal(1), 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        app(CounterService::class)->addToTab($tab, ['items' => $this->meal(1)], null, $this->now);
        $cards = app(\App\Services\Menus\KitchenService::class)->screen(\App\Models\Menus\Station::first(), $this->now)['tickets'];
        $this->assertSame([true, false], array_map(fn ($c) => count($c['packaging']) > 0, $cards), 'two rounds, one list: on the first');
    }
}
