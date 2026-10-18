<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Models\Menus\Side;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\DishStock;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus dish selection (build steps 3.3 and 3.4, script 203): the rules for a guest's picks, the price, what the kitchen must make, and what an order line keeps. */
class MenusDishSelectionTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $jumbo;
    private int $kids;
    private Dish $steak;
    /** @var array<string, int> side name => id */
    private array $side = [];
    /** @var array<string, int> slot name => id */
    private array $slot = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_order_lines', function ($t) {
            $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->string('name', 150); $t->decimal('quantity', 10, 2)->default(1); $t->decimal('base_price', 12, 2)->default(0);
            $t->decimal('unit_price', 12, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->unsignedInteger('round')->default(1); $t->json('uses')->nullable(); $t->json('linked')->nullable(); $t->unsignedBigInteger('ticket_id')->nullable(); $t->timestamps();
        });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '203_menus_order_lines_selection.sql');
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 2, 'is_active' => true]);
        $this->pantry('Flour', 100000, 0.1);
        foreach (['Bread', 'Choma', 'Wet fry', 'Kale', 'Cabbage', 'Spinach', 'Ketchup', 'Mayo', 'Egg'] as $name) {
            $r = app(DishRecipes::class)->saveStandalone(['name' => $name, 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 10]]]);
            $this->side[$name] = app(Sides::class)->save(['name' => $name, 'recipe_id' => $r->id] + ($name === 'Choma' ? ['base_amount' => 2, 'amounts' => [['serving_id' => $this->kids, 'amount' => 1]]] : []))->id;
        }
        $this->steak = $this->dish('Steak sandwich', 500);
        app(DishMakeup::class)->save($this->steak, [
            'servings' => [['serving_id' => $this->jumbo, 'price' => 650], ['serving_id' => $this->kids, 'price' => 350]],
            'slots' => [
                ['name' => 'Bread', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]],
                ['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma'], 'is_default' => true], ['side_id' => $this->side['Wet fry'], 'upcharge' => 50]]],
                ['name' => 'Greens', 'kind' => 'choose_any', 'min' => 1, 'max' => 2, 'choices' => [['side_id' => $this->side['Kale'], 'is_default' => true], ['side_id' => $this->side['Cabbage']], ['side_id' => $this->side['Spinach'], 'upcharge' => 20]]],
                ['name' => 'Sauces', 'kind' => 'free_extra', 'max' => 2, 'choices' => [['side_id' => $this->side['Ketchup']], ['side_id' => $this->side['Mayo']]]],
                ['name' => 'Extras', 'kind' => 'paid_extra', 'max' => 3, 'choices' => [['side_id' => $this->side['Egg'], 'upcharge' => 40]]],
            ],
        ]);
        foreach (\App\Models\Menus\DishSlot::where('dish_id', $this->steak->id)->get() as $s) {
            $this->slot[$s->name] = (int) $s->id;
        }
    }

    private function sel(): DishSelection
    {
        return app(DishSelection::class);
    }

    /** The till's service without what it needs for payments: the lines of a tab need none of it. */
    private function counter(): CounterService
    {
        return (new \ReflectionClass(CounterService::class))->newInstanceWithoutConstructor();
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

    // ------------------------------------------------------------ the price and what comes with it

    public function test_with_no_picks_the_sides_chosen_to_begin_with_come_and_the_price_is_the_sizes(): void
    {
        $r = $this->sel()->resolve($this->steak, $this->jumbo);
        $this->assertSame([['id' => $this->jumbo, 'name' => 'Jumbo'], 650.0, 0.0, 650.0], [$r['serving'], $r['base_price'], $r['upcharge'], $r['unit_price']]);
        $this->assertSame(['Bread', 'Choma', 'Kale'], array_column($r['lines'], 'side'), 'the fixed one, and the ones chosen to begin with');
        $this->assertSame(['fixed', 'choose_one', 'choose_any'], array_column($r['lines'], 'kind'));
    }

    public function test_picks_add_to_the_price_and_extras_count_each_serving(): void
    {
        $r = $this->sel()->resolve($this->steak, $this->jumbo, [
            $this->slot['Protein'] => [$this->side['Wet fry']],
            $this->slot['Greens'] => [$this->side['Cabbage'], $this->side['Spinach']],
            $this->slot['Sauces'] => [$this->side['Ketchup'], ['side_id' => $this->side['Mayo'], 'qty' => 1]],
            $this->slot['Extras'] => [['side_id' => $this->side['Egg'], 'qty' => 2]],
        ]);
        $this->assertEqualsWithDelta(650 + 50 + 20 + 80, $r['unit_price'], 0.001, 'wet fry +50, spinach +20, two eggs +80');
        $this->assertSame([150.0, 800.0], [$r['upcharge'], $r['unit_price']]);
        $this->assertSame(['Bread', 'Wet fry', 'Cabbage', 'Spinach', 'Ketchup', 'Mayo', 'Egg'], array_column($r['lines'], 'side'));
        $egg = collect($r['lines'])->firstWhere('side', 'Egg');
        $this->assertSame([2, 40.0, 80.0], [$egg['qty'], $egg['upcharge'], $egg['amount']]);
    }

    public function test_the_size_changes_the_price_and_how_much_of_each_side_is_made(): void
    {
        $jumbo = collect($this->sel()->resolve($this->steak, $this->jumbo)['sides'])->keyBy('side');
        $kids = $this->sel()->resolve($this->steak, $this->kids);
        $this->assertSame(350.0, $kids['unit_price']);
        $kidsSides = collect($kids['sides'])->keyBy('side');
        $this->assertSame([2.0, 1.0], [$jumbo['Choma']['amount'], $kidsSides['Choma']['amount']], 'a Jumbo takes 2 portions of choma, a Kids 1');
        $this->assertSame([1, 1.0, 'portions'], [$jumbo['Bread']['qty'], $jumbo['Bread']['amount'], $jumbo['Bread']['unit']], 'a side with no amount of its own is 1');
    }

    public function test_the_same_side_in_two_slots_is_added_up_for_the_kitchen(): void
    {
        app(DishMakeup::class)->save($this->steak, ['slots' => [
            ['name' => 'Base', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Egg']]]],
            ['name' => 'Extras', 'kind' => 'paid_extra', 'choices' => [['side_id' => $this->side['Egg'], 'upcharge' => 40]]],
        ]]);
        $extras = (int) \App\Models\Menus\DishSlot::where('name', 'Extras')->value('id');
        $r = $this->sel()->resolve($this->steak, $this->jumbo, [$extras => [['side_id' => $this->side['Egg'], 'qty' => 2]]]);
        $this->assertCount(1, $r['sides']);
        $this->assertSame([3, 3.0], [$r['sides'][0]['qty'], $r['sides'][0]['amount']]);
        $this->assertSame(730.0, $r['unit_price']);
    }

    // ------------------------------------------------------------ the size

    public function test_a_dish_with_sizes_needs_one_of_them_and_a_dish_without_is_sold_at_its_own_price(): void
    {
        $this->fails(fn () => $this->sel()->resolve($this->steak, null), 'Choose a size');
        $other = DB::table('menus_servings')->insertGetId(['name' => 'Medium', 'sort_order' => 3, 'is_active' => true]);
        $this->fails(fn () => $this->sel()->resolve($this->steak, $other), 'not sold in that size');
        $plain = $this->dish('Plain', 120);
        $this->assertSame([120.0, null], [$this->sel()->resolve($plain, null)['unit_price'], $this->sel()->resolve($plain, null)['serving']]);
        $this->fails(fn () => $this->sel()->resolve($plain, $this->jumbo), 'one size');
    }

    // ------------------------------------------------------------ the rules for each kind of slot

    public function test_choose_one_wants_exactly_one_and_never_more(): void
    {
        $protein = $this->slot['Protein'];
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$protein => [$this->side['Choma'], $this->side['Wet fry']]]), 'choose only one');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$protein => []]), 'please choose one');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$protein => [$this->side['Kale']]]), 'not one of the sides');
        app(DishMakeup::class)->save($this->steak, ['slots' => [['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma']], ['side_id' => $this->side['Wet fry']]]]]]);
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo), 'please choose one');   // none to begin with
    }

    public function test_choose_any_keeps_to_its_fewest_and_most_and_a_slot_answered_with_nothing_gets_nothing(): void
    {
        $greens = $this->slot['Greens'];
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$greens => []]), 'choose at least one');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$greens => [$this->side['Kale'], $this->side['Cabbage'], $this->side['Spinach']]]), 'no more than 2');
        $this->assertSame(['Bread', 'Choma', 'Cabbage'], array_column($this->sel()->resolve($this->steak, $this->jumbo, [$greens => [$this->side['Cabbage']]])['lines'], 'side'), 'what is picked replaces what was to begin with');
        $sauces = $this->slot['Sauces'];
        $this->assertNotContains('Ketchup', array_column($this->sel()->resolve($this->steak, $this->jumbo, [$sauces => []])['lines'], 'side'));
    }

    public function test_extras_keep_to_their_most_counting_every_serving(): void
    {
        $extras = $this->slot['Extras'];
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$extras => [['side_id' => $this->side['Egg'], 'qty' => 4]]]), 'no more than 3');
        $this->assertSame(3, collect($this->sel()->resolve($this->steak, $this->jumbo, [$extras => [['side_id' => $this->side['Egg'], 'qty' => 3]]])['lines'])->firstWhere('side', 'Egg')['qty']);
        $sauces = $this->slot['Sauces'];
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$sauces => [['side_id' => $this->side['Ketchup'], 'qty' => 2], $this->side['Mayo']]]), 'no more than 2');
    }

    public function test_the_picks_themselves_are_checked(): void
    {
        $protein = $this->slot['Protein'];
        $greens = $this->slot['Greens'];
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [99999 => [$this->side['Egg']]]), 'not on Steak sandwich');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$greens => [['side_id' => $this->side['Kale'], 'qty' => 2]]]), 'only be chosen once');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$greens => [$this->side['Kale'], $this->side['Kale']]]), 'chosen twice');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$greens => [['side_id' => $this->side['Kale'], 'qty' => 0]]]), 'number of one or more');
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$protein => [0]]), 'needs a side');
        DB::table('menus_sides')->where('id', $this->side['Wet fry'])->update(['is_active' => false]);
        $this->fails(fn () => $this->sel()->resolve($this->steak, $this->jumbo, [$protein => [$this->side['Wet fry']]]), 'not available');
    }

    public function test_picks_for_an_always_included_slot_change_nothing(): void
    {
        $bread = $this->slot['Bread'];
        $r = $this->sel()->resolve($this->steak, $this->jumbo, [$bread => [$this->side['Bread'], $this->side['Bread']]]);
        $this->assertSame(1, count(array_filter($r['lines'], fn ($l) => $l['side'] === 'Bread')));
    }

    // ------------------------------------------------------------ what an order line keeps

    public function test_the_order_line_keeps_the_size_and_the_picks_and_the_sale_carries_the_sides(): void
    {
        $r = $this->sel()->resolve($this->steak, $this->jumbo, [$this->slot['Protein'] => [$this->side['Wet fry']]]);
        $line = $this->sel()->orderLine($r);
        $this->assertSame([$this->jumbo, 'Jumbo'], [$line['serving_id'], $line['serving']]);
        $this->assertSame(['Bread', 'Wet fry', 'Kale'], array_column($line['selection'], 'side'));
        $this->assertSame('side', $r['uses'][0]['mode']);
        $back = DishSelection::sidesIn(json_encode(array_merge($r['uses'], [['mode' => 'remove', 'ingredient_id' => 5], ['mode' => 'add', 'ingredient_id' => 6, 'quantity' => 1]])));
        $this->assertSame(array_column($r['sides'], 'side_id'), array_column($back, 'side_id'), 'read back from the line, the ingredient rows left out');
        $this->assertSame([], DishSelection::sidesIn(null));
        $this->assertSame([], DishSelection::sidesIn([['mode' => 'remove', 'ingredient_id' => 5]]));
    }

    public function test_a_tab_keeps_and_gives_back_the_size_and_picks_of_a_line(): void
    {
        $r = $this->sel()->resolve($this->steak, $this->kids);
        $o = (new MenuOrder())->forceFill(['id' => 7]);
        $svc = $this->counter();
        $svc->addLines($o, [['dish' => $this->steak, 'quantity' => 2, 'base_price' => 350, 'unit_price' => 350, 'options' => [], 'uses' => $r['uses'], 'linked' => [], 'note' => null] + $this->sel()->orderLine($r)], 1);
        $row = MenuOrderLine::first();
        $this->assertSame([$this->kids, 'Kids', ['Bread', 'Choma', 'Kale']], [(int) $row->serving_id, $row->serving, array_column($row->selection, 'side')]);
        $again = $svc->rebuild($o)[0];
        $this->assertSame([$this->kids, 'Kids'], [(int) $again['serving_id'], $again['serving']]);
        $this->assertSame(array_column($r['sides'], 'side_id'), array_column(DishSelection::sidesIn($again['uses']), 'side_id'));
        $svc->addLines($o, [['dish' => $this->steak, 'quantity' => 1, 'base_price' => 500, 'unit_price' => 500, 'options' => [], 'uses' => [], 'linked' => [], 'note' => null]], 1);
        $this->assertNull(MenuOrderLine::orderByDesc('id')->first()->serving_id, 'a line without a make-up is as before');
    }

    public function test_before_script_203_an_order_line_with_picks_says_which_script_and_one_without_still_saves(): void
    {
        Schema::table('menus_order_lines', function ($t) { $t->dropColumn(['serving_id', 'serving', 'selection']); });
        $o = (new MenuOrder())->forceFill(['id' => 7]);
        $svc = $this->counter();
        $r = $this->sel()->resolve($this->steak, $this->jumbo);
        $this->fails(fn () => $svc->addLines($o, [['dish' => $this->steak, 'quantity' => 1, 'base_price' => 650, 'unit_price' => 650, 'options' => [], 'uses' => [], 'linked' => [], 'note' => null] + $this->sel()->orderLine($r)], 1), '203_menus_order_lines_selection');
        $svc->addLines($o, [['dish' => $this->steak, 'quantity' => 1, 'base_price' => 500, 'unit_price' => 500, 'options' => [], 'uses' => [], 'linked' => [], 'note' => null]], 1);
        $this->assertSame(1, MenuOrderLine::count());
        $this->assertNull($svc->rebuild($o)[0]['serving_id']);
    }

    public function test_the_sides_in_a_lines_uses_do_not_disturb_what_the_stock_takes(): void
    {
        $d = $this->dish('Pizza');
        app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 200]]]);
        $r = $this->sel()->resolve($this->steak, $this->jumbo);
        $v = $this->sale([['dish' => $d, 'qty' => 2, 'uses' => array_merge($r['uses'], [['mode' => 'add', 'ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 50, 'unit' => 'base']])]]);
        app(DishStock::class)->apply($v, null);
        $this->assertEqualsWithDelta(2 * 250, 100000 - (float) StockBatch::sum('qty_left'), 0.001, 'the extra flour counts, the side rows are not read as ingredients');
    }

    public function test_a_dish_has_a_makeup_to_follow_when_it_has_slots_or_sizes(): void
    {
        $this->assertTrue(DishSelection::applies($this->steak));
        $plain = $this->dish('Plain', 120);
        $this->assertFalse(DishSelection::applies($plain));
        app(DishMakeup::class)->save($plain, ['servings' => [['serving_id' => $this->jumbo, 'price' => 150]]]);
        $this->assertTrue(DishSelection::applies($plain));
    }
}
