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
use App\Services\Menus\PackagingReport;
use App\Services\Menus\PackagingCheckout;
use App\Models\Menus\OrderPackaging;
use App\Services\Books\BooksException;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus packaging, build step 5.9: why packaging was left off, by item and by the reason given. */
class MenusPackagingReportTest extends TestCase
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
        \Illuminate\Support\Facades\Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql', '209_menus_order_packaging.sql', '210_menus_order_packaging_waived.sql', '209_menus_order_packaging.sql', '210_menus_order_packaging_waived.sql');
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

    private function sell(array $packaging = [], int $n = 2): \App\Models\Menus\MenuOrder
    {
        $in = ['items' => [['dish_id' => $this->meal->id, 'quantity' => $n]], 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 9000]]];

        return app(CounterService::class)->sell($in + ($packaging ? ['packaging' => $packaging] : []), null, $this->now);
    }

    private function report(?string $from = null, ?string $to = null): array
    {
        return app(PackagingReport::class)->build(self::BRANCH, $from ?? $this->now->copy()->subDay()->toDateString(), $to ?? $this->now->copy()->addDay()->toDateString());
    }

    public function test_an_order_nobody_changed_adds_to_what_was_asked_and_given_but_not_to_the_story(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['charged' => true]), $this->rule($this->foil)]);
        $this->sell();
        $r = $this->report();
        $this->assertSame([1, 4, 4, 0, 0], [$r['totals']['orders'], $r['totals']['asked'], $r['totals']['given'], $r['totals']['left_off'], $r['totals']['lines_changed']]);
        $this->assertSame([], $r['latest']);
        $this->assertSame([], $r['by_reason']);
    }

    public function test_what_was_left_off_is_counted_by_item_and_by_reason_the_same_words_adding_up(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->box, ['charged' => true]), $this->rule($this->foil)]);
        $this->sell([['item_id' => $this->foil, 'quantity' => 0, 'reason' => 'Brought their own']]);
        $this->sell([['item_id' => $this->foil, 'quantity' => 0, 'reason' => '  brought   their own ']], 3);
        $this->sell([['item_id' => $this->box, 'quantity' => 1]]);
        $this->sell([['item_id' => $this->foil, 'quantity' => 1]]);
        $this->sell();
        $this->sell([['item_id' => $this->bag, 'replaces' => $this->box]]);
        $r = $this->report();
        $this->assertSame(['orders' => 6, 'asked' => 26, 'given' => 19, 'left_off' => 7, 'lines_changed' => 5, 'swapped' => 1, 'added' => 0, 'waived' => 0.0], $r['totals']);
        $this->assertSame(['brought their own' => [2, 5], 'no reason given' => [2, 2]], collect($r['by_reason'])->mapWithKeys(fn ($x) => [$x['reason'] ?? 'no reason given' => [$x['times'], $x['units']]])->all(), 'the same words in other case and spacing are one reason; a cut with no reason is counted too');
        $byItem = array_column($r['by_item'], null, 'name');
        $this->assertSame([3, 13, 6], [$byItem['Foil']['times_changed'], $byItem['Foil']['asked'], $byItem['Foil']['left_off']], 'the foil was changed on three orders, and 6 of 13 were left off');
        $this->assertSame(1, $byItem['Container swapped for Bag']['times_changed']);
        $this->assertSame(['Bag', 'Foil', 'Container', 'Foil', 'Foil'], array_column($r['latest'], 'item'), 'the lines the cashier changed, newest first');
    }

    public function test_the_report_is_for_a_branch_and_a_period_and_leaves_out_cancelled_orders(): void
    {
        $this->rules()->save('side', $this->stew->id, [$this->rule($this->foil)]);
        $kept = $this->sell([['item_id' => $this->foil, 'quantity' => 0, 'reason' => 'own']]);
        $gone = $this->sell([['item_id' => $this->foil, 'quantity' => 0, 'reason' => 'own']]);
        $gone->update(['status' => 'cancelled']);
        $this->assertSame(1, $this->report()['totals']['orders']);
        $this->assertSame(0, $this->report('2020-01-01', '2020-01-31')['totals']['orders'], 'another period');
        $this->assertSame(0, app(PackagingReport::class)->build(999, '2026-10-01', '2026-10-31')['totals']['orders'], 'another branch');
        $this->assertTrue($this->report()['ready']);
        \Illuminate\Support\Facades\Schema::drop('menus_order_packaging');
        $this->assertFalse($this->report()['ready'], 'before script 209 there is nothing to report');
    }
}
