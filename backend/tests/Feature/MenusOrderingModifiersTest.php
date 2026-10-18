<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrderLine;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishModifiers;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenusLists;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\MenuService;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus modifiers, build step 4.3: leaving out and adding extra on an order, what it costs by the dish's policy, VAT or kept apart, and what the stock is told. */
class MenusOrderingModifiersTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private Dish $burger;
    private int $fee;
    private int $pct;
    private int $jumbo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql', '206_menus_dish_modifiers.sql');
        $lists = app(MenusLists::class);
        $lists->save('policies', ['name' => 'Free', 'kind' => 'free']);
        $this->fee = $lists->save('policies', ['name' => 'Fee 20', 'kind' => 'fixed', 'amount' => 20])->id;
        $this->pct = $lists->save('policies', ['name' => 'Ten percent', 'kind' => 'percent', 'amount' => 10])->id;
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->pantry('Flour', 1000, 0.1);
        $this->pantry('Cheese', 100, 0.5);
        $this->pantry('Onion', 1000, 0.2);
        $this->burger = $this->make('Burger', 500);
        app(DishRecipes::class)->save($this->burger, ['yield_qty' => 1, 'lines' => [
            ['ingredient_id' => $this->ing('Flour'), 'quantity' => 100],
            ['ingredient_id' => $this->ing('Cheese'), 'quantity' => 20, 'removable' => true, 'extra_allowed' => true],
            ['ingredient_id' => $this->ing('Onion'), 'quantity' => 10, 'removable' => true],
        ]]);
        app(DishModifiers::class)->save($this->burger, [['ingredient_id' => $this->ing('Cheese'), 'kind' => 'extra', 'policy_id' => $this->pct], ['ingredient_id' => $this->ing('Onion'), 'kind' => 'remove', 'policy_id' => $this->fee]]);
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $sec = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $sec->id, 'dish_id' => $this->burger->id]);
    }

    protected function tearDown(): void
    {
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
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

    private function item(array $mods, array $o = []): array
    {
        return $o + ['dish_id' => $this->burger->id, 'quantity' => 1, 'mods' => $mods];
    }

    private function lines(array $items)
    {
        $svc = app(MenuOrderService::class);

        return $svc->dishLines(\App\Models\Menus\Channel::where('code', 'counter')->first(), (new \App\Models\Location())->forceFill(['id' => self::BRANCH]), $this->now, $svc->wanted($items))[0];
    }

    private function rows(array $lines): array
    {
        return app(MenuOrderService::class)->lineRows($lines, (new \App\Models\Location())->forceFill(['id' => self::BRANCH]));
    }

    private function cheese(string $kind = 'extra'): array
    {
        return ['ingredient_id' => $this->ing('Cheese'), 'kind' => $kind];
    }

    private function onion(): array
    {
        return ['ingredient_id' => $this->ing('Onion'), 'kind' => 'remove'];
    }

    public function test_a_fee_that_carries_the_dishs_vat_is_part_of_the_price_and_the_choices_are_named(): void
    {
        $l = $this->lines([$this->item([$this->cheese(), $this->onion()])])[0];
        $this->assertSame([570.0, 500.0], [$l['unit_price'], $l['base_price']], '500 + 10% for the cheese + 20 for the onion');
        $this->assertSame([['Extra', 'Extra cheese', 50.0], ['Left out', 'No onion', 20.0]], array_map(fn ($o) => [$o['group'], $o['name'], $o['price_delta']], $l['options']));
        $row = $this->rows([$l])[0];
        $this->assertSame([570.0, 'Extra cheese, No onion'], [(float) $row['rate'], $row['notes']]);
        $this->assertCount(1, $this->rows([$l]), 'no line of its own for the fee');
    }

    public function test_the_stock_is_told_a_removed_ingredient_is_not_used_and_an_extra_is_one_more_of_the_lines_amount(): void
    {
        $l = $this->lines([$this->item([$this->cheese(), $this->onion()], ['quantity' => 2])])[0];
        $uses = $this->rows([$l])[0]['menu_uses'];
        $this->assertSame([['mode' => 'add', 'ingredient_id' => $this->ing('Cheese'), 'quantity' => 20.0, 'unit' => 'base'], ['mode' => 'remove', 'ingredient_id' => $this->ing('Onion')]], $uses);
    }

    public function test_a_percentage_is_of_the_price_of_the_size_not_of_what_the_picks_add(): void
    {
        app(DishMakeup::class)->save($this->burger, ['servings' => [['serving_id' => $this->jumbo, 'price' => 650]]]);
        $l = $this->lines([$this->item([$this->cheese()], ['serving_id' => $this->jumbo])])[0];
        $this->assertSame(715.0, $l['unit_price'], '650 + 10% of 650');
    }

    public function test_a_fee_kept_apart_is_a_line_of_its_own_to_its_account_and_is_not_a_delivery_charge(): void
    {
        MenusSettings::save(['modifier_fees_vatable' => false], null);
        $l = $this->lines([$this->item([$this->cheese(), $this->onion()], ['quantity' => 2])])[0];
        $this->assertSame(500.0, $l['unit_price'], 'the dish alone');
        $rows = $this->rows([$l]);
        $this->assertSame([2, 'charge', 'Modifier fee: Burger', $this->ledger, 140.0], [count($rows), $rows[1]['type'], $rows[1]['description'], $rows[1]['ledger_id'], (float) $rows[1]['amount']], '(50 + 20) x 2, to the dish sales account when no account of its own is set');
        MenusSettings::save(['modifier_fee_ledger_id' => 80], null);
        $this->assertSame(80, $this->rows([$l])[1]['ledger_id'], 'its own account wins');
        $q = app(CounterService::class)->quote(['items' => [$this->item([$this->cheese()])], 'service' => 'take_out'], $this->now);
        $this->assertEqualsWithDelta((500 + 50) * 1.16 - 50 * 0.16, $q['total'], 0.01, 'the books count the fee in the total (the stand-in tax is on dishes only)');
    }

    public function test_a_fee_kept_apart_needs_an_account(): void
    {
        DB::table('menus_settings')->where('id', 1)->update(['settings' => json_encode(['modifier_fees_vatable' => false, 'sales_ledger_id' => null])]);
        $this->fails(fn () => $this->lines([$this->item([$this->onion()])]), 'no account is set');
        $this->lines([$this->item([])]);   // no fee, no account needed
        app(DishModifiers::class)->save($this->burger, []);
        $this->lines([$this->item([$this->onion()])]);   // free: nothing to keep apart
        $this->assertTrue(true);
    }

    public function test_a_tab_keeps_the_choices_and_the_fees_as_they_were(): void
    {
        MenusSettings::save(['modifier_fees_vatable' => false], null);
        $tab = app(CounterService::class)->openTab(['items' => [$this->item([$this->cheese(), $this->onion()])], 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $line = MenuOrderLine::where('order_id', $tab->id)->first();
        $this->assertSame([true, true], [(bool) $line->options[0]['apart'], (bool) $line->options[1]['apart']]);
        $this->assertSame(70.0, $line->apartFee());
        $this->assertEqualsWithDelta(500 * 1.16 + 70, (float) $tab->total, 0.01);
        $rebuilt = app(CounterService::class)->rebuild($tab);
        $this->assertCount(2, $this->rows($rebuilt), 'the fee line comes back from the kept choices');
    }

    public function test_what_the_dish_does_not_offer_is_refused(): void
    {
        $this->fails(fn () => $this->lines([$this->item([['ingredient_id' => $this->ing('Flour'), 'kind' => 'remove']])]), 'can not be changed that way');
        $this->fails(fn () => $this->lines([$this->item([['ingredient_id' => $this->ing('Onion'), 'kind' => 'extra']])]), 'can not be changed that way');
        $this->fails(fn () => $this->lines([$this->item([$this->cheese('extra'), $this->cheese('remove')])]), 'both left out and added to');
    }

    public function test_an_extra_that_is_not_on_the_shelf_stops_the_order(): void
    {
        $this->lines([$this->item([$this->cheese()], ['quantity' => 2])]);   // 2 x 20 g in the recipe and 2 x 20 g extra, of the 100 g
        $this->fails(fn () => $this->lines([$this->item([$this->cheese()], ['quantity' => 3])]), 'not enough Cheese left for the extra');   // 60 + 60 is more than 100: three burgers could be made, but not with extra cheese on each
    }

    public function test_the_public_menu_offers_what_can_be_left_out_or_added_with_the_policy_that_prices_it(): void
    {
        $dish = app(\App\Services\Menus\PublicMenu::class)->build($this->now, self::BRANCH)['menus'][0]['sections'][0]['dishes'][0];
        $this->assertSame([['Cheese', 'remove', 'free', 0.0], ['Cheese', 'extra', 'percent', 10.0], ['Onion', 'remove', 'fixed', 20.0]], array_map(fn ($m) => [$m['name'], $m['kind'], $m['fee']['kind'], $m['fee']['amount']], $dish['modifiers']));
    }
}
