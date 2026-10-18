<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\DishServing;
use App\Models\Menus\DishSlot;
use App\Models\Menus\DishSlotChoice;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishService;
use App\Services\Menus\Sides;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus dish make-up (script 202): slots filled with sides, the sizes a dish is sold in and their prices, and who it is for. */
class MenusDishMakeupTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $jumbo;
    private int $kids;
    private int $adults;
    /** @var array<string, int> side name => id */
    private array $side = [];
    private Dish $steak;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        // what deleting a dish also touches: its choices and the menus it is on
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('ingredient_id')->nullable(); $t->string('unit', 4)->default('base'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->unique(['section_id', 'dish_id']); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql');
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 2, 'is_active' => true]);
        $this->adults = DB::table('menus_audiences')->insertGetId(['name' => 'Adults', 'sort_order' => 1, 'is_active' => true]);
        $this->pantry('Flour', 100000, 0.1);
        foreach (['Bread', 'Choma', 'Wet fry', 'Ketchup', 'Mayo', 'Egg'] as $name) {
            $r = app(DishRecipes::class)->saveStandalone(['name' => $name, 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 10]]]);
            $this->side[$name] = app(Sides::class)->save(['name' => $name, 'recipe_id' => $r->id])->id;
        }
        $this->steak = $this->dish('Steak sandwich', 500);
    }

    private function makeup(): DishMakeup
    {
        return app(DishMakeup::class);
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

    private function full(): array
    {
        return [
            'servings' => [['serving_id' => $this->jumbo, 'price' => 650], ['serving_id' => $this->kids, 'price' => 350]],
            'audience_ids' => [$this->adults],
            'slots' => [
                ['name' => 'Bread', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread'], 'upcharge' => 99, 'is_default' => false]]],
                ['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma'], 'is_default' => true], ['side_id' => $this->side['Wet fry'], 'upcharge' => 50]]],
                ['name' => 'Sauces', 'kind' => 'free_extra', 'max' => 2, 'choices' => [['side_id' => $this->side['Ketchup'], 'upcharge' => 10], ['side_id' => $this->side['Mayo']]]],
                ['name' => 'Extras', 'kind' => 'paid_extra', 'choices' => [['side_id' => $this->side['Egg'], 'upcharge' => 40]]],
            ],
        ];
    }

    public function test_a_dish_keeps_its_sizes_its_audience_and_its_slots_filled_with_sides(): void
    {
        $m = $this->makeup()->save($this->steak, $this->full());
        $this->assertSame([[$this->jumbo, 'Jumbo', 650.0], [$this->kids, 'Kids', 350.0]], array_map(fn ($s) => [$s['serving_id'], $s['serving'], $s['price']], $m['servings']));
        $this->assertSame([$this->adults], $m['audience_ids']);
        $this->assertSame(['Bread', 'Protein', 'Sauces', 'Extras'], array_column($m['slots'], 'name'));
        $this->assertSame(['fixed', 'choose_one', 'free_extra', 'paid_extra'], array_column($m['slots'], 'kind'));
        $this->assertSame(['Always included', 'Choose one', 'Free extra', 'Paid extra'], array_column($m['slots'], 'kind_label'));
        $bread = $m['slots'][0]['choices'][0];
        $this->assertSame([0.0, true], [$bread['upcharge'], $bread['is_default']], 'an always-included side is part of the dish: no price of its own');
        $protein = $m['slots'][1];
        $this->assertSame([1, 1], [$protein['min'], $protein['max']]);
        $this->assertSame([['Choma', 0.0, true], ['Wet fry', 50.0, false]], array_map(fn ($c) => [$c['side'], $c['upcharge'], $c['is_default']], $protein['choices']));
        $this->assertSame([0, 2, 0.0, 0.0], [$m['slots'][2]['min'], $m['slots'][2]['max'], $m['slots'][2]['choices'][0]['upcharge'], $m['slots'][2]['choices'][1]['upcharge']], 'a free extra costs nothing, up to 2');
        $this->assertSame(40.0, $m['slots'][3]['choices'][0]['upcharge']);
        $this->assertSame(500.0, $m['price'], 'the dish keeps its own price too');
    }

    public function test_saving_again_replaces_what_was_sent_and_keeps_what_was_left_out(): void
    {
        $this->makeup()->save($this->steak, $this->full());
        $m = $this->makeup()->save($this->steak, ['slots' => [['name' => 'Only', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]]]]);
        $this->assertSame(['Only'], array_column($m['slots'], 'name'));
        $this->assertCount(2, $m['servings'], 'the sizes were not in this save');
        $this->assertSame([$this->adults], $m['audience_ids']);
        $this->assertSame([1, 1], [DishSlot::count(), DishSlotChoice::count()], 'the old slots and choices are gone');
        $m = $this->makeup()->save($this->steak, ['servings' => [], 'audience_ids' => [], 'slots' => []]);
        $this->assertSame([[], [], []], [$m['servings'], $m['audience_ids'], $m['slots']]);
    }

    public function test_a_size_with_no_price_is_not_sold_and_the_sizes_are_checked(): void
    {
        $m = $this->makeup()->save($this->steak, ['servings' => [['serving_id' => $this->jumbo, 'price' => ''], ['serving_id' => $this->kids, 'price' => 0]]]);
        $this->assertSame([[$this->kids, 0.0]], array_map(fn ($s) => [$s['serving_id'], $s['price']], $m['servings']));
        $off = DB::table('menus_servings')->insertGetId(['name' => 'Old', 'sort_order' => 3, 'is_active' => false]);
        $this->fails(fn () => $this->makeup()->save($this->steak, ['servings' => [['serving_id' => 999, 'price' => 5]]]), 'servings on your list');
        $this->fails(fn () => $this->makeup()->save($this->steak, ['servings' => [['serving_id' => $off, 'price' => 5]]]), 'servings on your list');
        $this->fails(fn () => $this->makeup()->save($this->steak, ['servings' => [['serving_id' => $this->jumbo, 'price' => -1]]]), 'less than nothing');
        $this->fails(fn () => $this->makeup()->save($this->steak, ['servings' => [['serving_id' => $this->jumbo, 'price' => 5], ['serving_id' => $this->jumbo, 'price' => 6]]]), 'listed twice');
        $this->fails(fn () => $this->makeup()->save($this->steak, ['audience_ids' => [999]]), 'audiences from your list');
        $this->assertSame(1, DishServing::count(), 'refused saves changed nothing');
    }

    public function test_the_slots_are_checked_by_how_they_are_filled(): void
    {
        $slot = fn (array $over) => ['slots' => [$over + ['name' => 'S', 'kind' => 'choose_any', 'choices' => [['side_id' => $this->side['Bread']], ['side_id' => $this->side['Choma']]]]]];
        $b = $this->side['Bread'];
        $c = $this->side['Choma'];
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['name' => ' '])), 'give it a name');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['kind' => 'sometimes'])), 'choose how it is filled');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['choices' => []])), 'add at least one side');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['kind' => 'choose_one', 'choices' => [['side_id' => $b]]])), 'at least two sides');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['kind' => 'choose_one', 'choices' => [['side_id' => $b, 'is_default' => true], ['side_id' => $c, 'is_default' => true]]])), 'only one side');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['kind' => 'paid_extra', 'choices' => [['side_id' => $b, 'upcharge' => 0]]])), 'needs a price');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['choices' => [['side_id' => $b], ['side_id' => $b]]])), 'listed twice');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['choices' => [['side_id' => 99999]]])), 'choose a side for every row');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['choices' => [['side_id' => $b, 'upcharge' => -5]]])), 'less than nothing');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['min' => 3, 'max' => 2])), 'fewest to choose');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['min' => 3])), 'fewest to choose');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['max' => 0])), 'at least 1');
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot(['max' => 1, 'choices' => [['side_id' => $b, 'is_default' => true], ['side_id' => $c, 'is_default' => true]]])), 'more sides are chosen');
        Side::whereKey($b)->update(['is_active' => false]);
        $this->fails(fn () => $this->makeup()->save($this->steak, $slot([])), 'switched off');
        $this->assertSame(0, DishSlot::count(), 'refused saves left nothing behind');
        $many = ['slots' => array_fill(0, 13, ['name' => 'S', 'kind' => 'fixed', 'choices' => [['side_id' => $c]]])];
        $this->fails(fn () => $this->makeup()->save($this->steak, $many), 'at most');
    }

    public function test_an_extras_most_counts_servings_so_it_is_not_held_to_the_number_of_sides(): void
    {
        $m = $this->makeup()->save($this->steak, ['slots' => [['name' => 'Extras', 'kind' => 'paid_extra', 'max' => 3, 'choices' => [['side_id' => $this->side['Egg'], 'upcharge' => 40]]]]]);
        $this->assertSame(3, $m['slots'][0]['max'], 'three eggs may be taken though there is one side');
    }

    public function test_a_choose_any_slot_keeps_its_limits_and_a_larger_most_is_held_to_the_sides_there_are(): void
    {
        $m = $this->makeup()->save($this->steak, ['slots' => [['name' => 'Greens', 'kind' => 'choose_any', 'min' => 1, 'max' => 9, 'choices' => [['side_id' => $this->side['Bread'], 'upcharge' => 20], ['side_id' => $this->side['Choma'], 'is_default' => true]]]]]);
        $this->assertSame([1, 2], [$m['slots'][0]['min'], $m['slots'][0]['max']]);
        $this->assertSame([20.0, 0.0], array_column($m['slots'][0]['choices'], 'upcharge'));
        $open = $this->makeup()->save($this->steak, ['slots' => [['name' => 'Greens', 'kind' => 'choose_any', 'choices' => [['side_id' => $this->side['Bread']]]]]]);
        $this->assertSame([0, null], [$open['slots'][0]['min'], $open['slots'][0]['max']], 'no limit');
    }

    public function test_a_side_in_a_dishs_makeup_can_not_be_removed_or_switched_off_until_it_is_taken_out(): void
    {
        $this->makeup()->save($this->steak, $this->full());
        $egg = $this->side['Egg'];
        $this->fails(fn () => app(Sides::class)->delete($egg), 'make-up of Steak sandwich');
        $this->fails(fn () => app(Sides::class)->save(['name' => 'Egg', 'recipe_id' => Side::find($egg)->recipe_id, 'is_active' => false], $egg), 'before switching it off');
        $this->assertSame(['Steak sandwich'], DishMakeup::dishesUsingSide($egg));
        $this->makeup()->save($this->steak, ['slots' => []]);
        app(Sides::class)->delete($egg);
        $this->assertNull(Side::find($egg));
    }

    public function test_deleting_a_dish_takes_all_of_its_makeup_with_it(): void
    {
        $this->makeup()->save($this->steak, $this->full());
        $other = $this->dish('Other', 100);
        $this->makeup()->save($other, ['servings' => [['serving_id' => $this->jumbo, 'price' => 90]], 'slots' => [['name' => 'X', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]]]]);
        app(DishService::class)->delete($this->steak);
        $this->assertSame([1, 1, 1, 0], [DishSlot::count(), DishSlotChoice::count(), DishServing::count(), DB::table('menus_dish_audiences')->count()], 'only the other dish\'s make-up is left');
    }

    public function test_the_page_gives_the_dishs_makeup_with_what_it_can_be_made_of_and_saves_it_in_the_order_sent(): void
    {
        $c = app(\App\Http\Controllers\Admin\MenusDishMakeupController::class);
        $page = $c->show($this->steak->id)->getData(true);
        $this->assertTrue($page['ready']);
        $this->assertSame(['Steak sandwich', 500.0], [$page['name'], (float) $page['price']]);
        $this->assertSame(['Bread', 'Choma', 'Wet fry', 'Ketchup', 'Mayo', 'Egg'], array_column($page['sides'], 'name'));
        $this->assertSame(['Jumbo', 'Kids'], array_column($page['serving_list'], 'name'));
        $this->assertSame(['Adults'], array_column($page['audience_list'], 'name'));
        $this->assertSame(['fixed', 'choose_one', 'choose_any', 'free_extra', 'paid_extra'], array_keys($page['kinds']));
        $res = $c->update(Request::create('/x', 'PUT', $this->full()), $this->steak->id);
        $this->assertSame(200, $res->getStatusCode());
        $slots = $res->getData(true)['makeup']['slots'];
        $this->assertSame(['Bread', 'Protein', 'Sauces', 'Extras'], array_column($slots, 'name'));
        $this->assertSame(['Choma', 'Wet fry'], array_column($slots[1]['choices'], 'side'), 'a row with no price still comes in the order it was sent');
        $bad = $this->full();
        $bad['slots'][0]['name'] = '';
        $this->assertSame(422, $c->update(Request::create('/x', 'PUT', $bad), $this->steak->id)->getStatusCode());
        $this->assertSame('Bread', $c->show($this->steak->id)->getData(true)['slots'][0]['name'], 'the refused save changed nothing');
    }

    public function test_before_script_202_the_page_says_it_is_not_ready(): void
    {
        foreach (['menus_dish_slots', 'menus_dish_slot_choices', 'menus_dish_servings', 'menus_dish_audiences'] as $t) {
            Schema::drop($t);
        }
        $c = app(\App\Http\Controllers\Admin\MenusDishMakeupController::class);
        $this->assertFalse($c->show($this->steak->id)->getData(true)['ready']);
        $this->fails(fn () => $this->makeup()->save($this->steak, ['slots' => []]), '202_menus_dish_makeup');
        app(DishService::class)->delete($this->steak);   // nothing to clean up, so the dish can go
        $this->assertSame(0, Dish::count());
    }
}
