<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\DishSlot;
use App\Models\Menus\MenuOrderLine;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuService;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Ordering a dish with a make-up (build step 3.7): a size and the sides picked, the price that follows, the sides' stock checked, and all of it kept on the tab and sent to the books. */
class MenusOrderingMakeupTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private int $jumbo;
    private int $kids;
    private Dish $steak;
    /** @var array<string, int> */
    private array $side = [];
    /** @var array<string, int> */
    private array $slot = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql');
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 2, 'is_active' => true]);
        $this->pantry('Flour', 1000, 0.1);
        foreach (['Bread', 'Choma', 'Wet fry', 'Kale'] as $name) {
            $r = app(DishRecipes::class)->saveStandalone(['name' => $name, 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 10]]]);
            $this->side[$name] = app(Sides::class)->save(['name' => $name, 'recipe_id' => $r->id])->id;
        }
        $this->steak = $this->make('Steak sandwich', 500);
        app(DishMakeup::class)->save($this->steak, [
            'servings' => [['serving_id' => $this->jumbo, 'price' => 650], ['serving_id' => $this->kids, 'price' => 350]],
            'slots' => [
                ['name' => 'Bread', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]],
                ['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma'], 'is_default' => true], ['side_id' => $this->side['Wet fry'], 'upcharge' => 50]]],
                ['name' => 'Greens', 'kind' => 'choose_any', 'min' => 0, 'max' => 2, 'choices' => [['side_id' => $this->side['Kale'], 'upcharge' => 20]]],
            ],
        ]);
        foreach (DishSlot::where('dish_id', $this->steak->id)->get() as $s) {
            $this->slot[$s->name] = (int) $s->id;
        }
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $sec = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $sec->id, 'dish_id' => $this->steak->id]);
    }

    protected function tearDown(): void
    {
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
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

    private function item(array $o = []): array
    {
        return $o + ['dish_id' => $this->steak->id, 'quantity' => 1, 'serving_id' => $this->jumbo];
    }

    private function lines(array $items)
    {
        return app(MenuOrderService::class)->dishLines(\App\Models\Menus\Channel::where('code', 'counter')->first(), \App\Models\Location::default() ?? (new \App\Models\Location())->forceFill(['id' => self::BRANCH]), $this->now, app(MenuOrderService::class)->wanted($items))[0];
    }

    public function test_a_size_is_needed_and_the_price_is_the_sizes_plus_what_the_picks_add(): void
    {
        $this->fails(fn () => $this->lines([['dish_id' => $this->steak->id, 'quantity' => 1]]), 'Choose a size');
        $l = $this->lines([$this->item(['picks' => [$this->slot['Protein'] => [$this->side['Wet fry']], $this->slot['Greens'] => [$this->side['Kale']]]], 2)])[0];
        $this->assertSame([720.0, 720.0, 'Jumbo'], [$l['unit_price'], $l['base_price'], $l['serving']], '650 + wet fry 50 + kale 20');
        $this->assertSame(['Bread', 'Wet fry', 'Kale'], array_column($l['selection'], 'side'));
        $kids = $this->lines([$this->item(['serving_id' => $this->kids])])[0];
        $this->assertSame(350.0, $kids['unit_price']);
    }

    public function test_the_voucher_line_has_the_price_a_note_and_the_sides_for_the_stock(): void
    {
        $rows = app(MenuOrderService::class)->lineRows($this->lines([$this->item(['quantity' => 2])]), (new \App\Models\Location())->forceFill(['id' => self::BRANCH]));
        $this->assertSame([650.0, 2.0, 'Jumbo: Bread, Choma'], [(float) $rows[0]['rate'], (float) $rows[0]['quantity'], $rows[0]['notes']]);
        $this->assertSame(['Bread', 'Choma'], array_map(fn ($s) => Sides::class ? \App\Models\Menus\Side::find($s['side_id'])->name : '', DishSelection::sidesIn($rows[0]['menu_uses'])));
    }

    public function test_a_side_that_has_run_out_stops_the_order_and_the_whole_order_is_counted_together(): void
    {
        DB::table('menus_stock_batches')->update(['qty_left' => 25]);   // 25 g: 2 breads and no more
        $this->lines([$this->item(['quantity' => 1])]);   // bread and choma need 10 + 10
        $this->fails(fn () => $this->lines([$this->item(['quantity' => 2])]), 'run out');
        $this->fails(fn () => $this->lines([$this->item(['quantity' => 1]), $this->item(['quantity' => 1])]), 'run out');
        DB::table('menus_stock_batches')->update(['qty_left' => 0]);
        $this->fails(fn () => $this->lines([$this->item()]), 'run out');
    }

    public function test_a_tab_keeps_the_size_and_sides_and_adds_them_up_again(): void
    {
        $tab = app(CounterService::class)->openTab(['items' => [$this->item(['quantity' => 2, 'picks' => [$this->slot['Greens'] => [$this->side['Kale']]]])], 'service' => 'take_out', 'label' => 'Amina'], null, $this->now);
        $row = MenuOrderLine::where('order_id', $tab->id)->first();
        $this->assertSame([$this->jumbo, 'Jumbo', ['Bread', 'Choma', 'Kale']], [(int) $row->serving_id, $row->serving, array_column($row->selection, 'side')]);
        $this->assertEqualsWithDelta(2 * 670.0 * 1.16, (float) $tab->total, 0.01);
        $tab = app(CounterService::class)->addToTab($tab, ['items' => [$this->item(['serving_id' => $this->kids])]], null, $this->now);
        $this->assertEqualsWithDelta((2 * 670.0 + 350.0) * 1.16, (float) $tab->total, 0.01);
    }

    public function test_the_quote_names_the_size_and_sides(): void
    {
        $quote = app(CounterService::class)->quote(['items' => [$this->item()], 'service' => 'take_out'], $this->now);
        $this->assertEqualsWithDelta(650 * 1.16, $quote['total'], 0.01);
    }

    public function test_the_public_menu_shows_the_sizes_and_what_can_be_picked_and_what_has_run_out(): void
    {
        $aud = DB::table('menus_audiences')->insertGetId(['name' => 'Adults', 'sort_order' => 1, 'is_active' => true]);
        app(DishMakeup::class)->save($this->steak, ['audience_ids' => [$aud]]);
        $dish = fn () => app(\App\Services\Menus\PublicMenu::class)->build($this->now, self::BRANCH)['menus'][0]['sections'][0]['dishes'][0];
        $m = $dish()['makeup'];
        $this->assertSame([['Jumbo', 650.0], ['Kids', 350.0]], array_map(fn ($s) => [$s['name'], $s['price']], $m['servings']));
        $this->assertSame([350.0, ['Adults']], [$m['from'], $m['audiences']]);
        $this->assertSame(['Bread', 'Protein', 'Greens'], array_column($m['slots'], 'name'));
        $protein = $m['slots'][1];
        $this->assertSame([['Choma', 0.0, true, true], ['Wet fry', 50.0, false, true]], array_map(fn ($c) => [$c['name'], $c['upcharge'], $c['is_default'], $c['available']], $protein['choices']));
        DB::table('menus_stock_batches')->update(['qty_left' => 0]);
        $this->assertSame([false, false], array_column($dish()['makeup']['slots'][1]['choices'], 'available'));
    }
}
