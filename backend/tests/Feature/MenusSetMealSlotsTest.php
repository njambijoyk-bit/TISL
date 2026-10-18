<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishSlot;
use App\Models\Menus\OptionGroup;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishOptions;
use App\Services\Menus\DishPricing;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\DishSlotsFromSides;
use App\Services\Menus\PublicMenu;
use App\Services\Menus\SidesFromDishes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus build step 3.5 (script 204): a dish with a side gets a slot of its own, and "Choose a side" set meals become slots; the old groups are kept, marked as replaced. */
class MenusSetMealSlotsTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('ingredient_id')->nullable(); $t->string('unit', 4)->default('base'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '201_menus_sides_from_dishes.sql', '202_menus_dish_makeup.sql', '204_menus_option_groups_slot.sql');
        $this->pantry('Flour', 100000, 0.1);
    }

    private function withRecipe(string $name, float $price, bool $toOrder = true): Dish
    {
        $d = $this->dish($name, $price);
        app(DishRecipes::class)->save($d, ['made_to_order' => $toOrder, 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 100]]]);

        return $d;
    }

    private function optionGroups(Dish $d, array $groups): void
    {
        app(DishOptions::class)->save($d, $groups);
    }

    private function conv(): DishSlotsFromSides
    {
        return app(DishSlotsFromSides::class);
    }

    /** A burger combo whose "Choose a side" is fries or a salad (+30), with fries and a salad as dishes of their own. */
    private function combo(): array
    {
        $combo = $this->withRecipe('Burger combo', 500);
        $fries = $this->withRecipe('Fries', 100);
        $salad = $this->withRecipe('Salad', 80);
        app(SidesFromDishes::class)->run();
        $this->optionGroups($combo, [['name' => 'Choose a side', 'kind' => 'single', 'min_choices' => 1, 'options' => [
            ['name' => 'Fries', 'price_delta' => 0, 'is_default' => true, 'linked_dish_id' => $fries->id], ['name' => 'Salad', 'price_delta' => 30, 'linked_dish_id' => $salad->id]]]]);

        return [$combo, $fries, $salad];
    }

    public function test_a_dish_with_a_side_gets_a_slot_of_its_own_and_a_set_meal_becomes_a_choose_one_slot(): void
    {
        [$combo, $fries, $salad] = $this->combo();
        $r = $this->conv()->run();
        $this->assertSame([3, 1, 0], [$r['own'], $r['groups'], $r['skipped']]);
        $slots = DishSlot::with('choices.side')->where('dish_id', $combo->id)->orderBy('sort_order')->get();
        $this->assertSame(['Burger combo', 'Choose a side'], $slots->pluck('name')->all(), 'its own side first');
        $this->assertSame(['fixed', 'choose_one'], $slots->pluck('kind')->all());
        $this->assertSame(['Burger combo'], $slots[0]->choices->map(fn ($c) => $c->side->name)->all());
        $this->assertSame([['Fries', 0.0, true], ['Salad', 30.0, false]], $slots[1]->choices->map(fn ($c) => [$c->side->name, (float) $c->upcharge, (bool) $c->is_default])->all());
        $this->assertSame([1, 1], [(int) $slots[1]->min_choices, (int) $slots[1]->max_choices]);
        $this->assertSame(1, DishSlot::where('dish_id', $fries->id)->count(), 'fries and the salad get their own side too');
        $this->assertNotNull(OptionGroup::first()->slot_id, 'the old group is marked as replaced, not removed');
        $this->assertSame(1, OptionGroup::count());
    }

    public function test_the_price_is_as_it_was_and_the_old_group_is_no_longer_offered(): void
    {
        [$combo] = $this->combo();
        $old = OptionGroup::first()->options->pluck('id')->all();
        $before = app(DishPricing::class)->resolve($combo, [$old[1]]);
        $this->assertSame(30.0, $before['price_delta']);
        $this->conv()->run();
        $sel = app(DishSelection::class);
        $this->assertSame(500.0, $sel->resolve($combo, null)['unit_price'], 'with the default side');
        $salad = collect($sel->resolve($combo, null, [(int) DishSlot::where('name', 'Choose a side')->value('id') => [Side::where('name', 'Salad')->value('id')]])['lines'])->firstWhere('side', 'Salad');
        $this->assertSame(30.0, $salad['upcharge']);
        $this->assertSame(530.0, $sel->resolve($combo, null, [(int) DishSlot::where('name', 'Choose a side')->value('id') => [Side::where('name', 'Salad')->value('id')]])['unit_price']);
        $none = app(DishPricing::class)->resolve($combo, []);
        $this->assertSame([0.0, []], [$none['price_delta'], $none['linked_dishes']], 'the replaced group asks nothing and links no dish');
        $this->assertSame([], (new \ReflectionMethod(PublicMenu::class, 'options'))->invoke(app(PublicMenu::class), $combo), 'not offered twice');
    }

    public function test_doing_it_again_does_nothing_and_a_group_made_possible_later_is_picked_up(): void
    {
        [$combo, $fries] = $this->combo();
        $this->conv()->run();
        $again = $this->conv()->run();
        $this->assertSame([0, 0, 0], [$again['own'], $again['groups'], $again['skipped']]);
        $this->assertSame(1, DishSlot::where('name', 'Choose a side')->count());
        $drinks = $this->withRecipe('Soda dish', 50);
        $this->optionGroups($combo, array_merge(app(DishOptions::class)->forDish($combo), [['name' => 'Add a drink', 'kind' => 'single', 'min_choices' => 0, 'options' => [['name' => 'Soda', 'price_delta' => 60, 'linked_dish_id' => $drinks->id]]]]));
        $skip = $this->conv()->run();
        $this->assertSame([0, 1], [$skip['groups'], $skip['skipped']], 'no side for the soda dish yet: left as it is');
        app(SidesFromDishes::class)->run();
        $later = $this->conv()->run();
        $this->assertSame([1, 0], [$later['groups'], $later['skipped']]);
        $slot = DishSlot::where('dish_id', $combo->id)->where('name', 'Add a drink')->first();
        $this->assertSame(['choose_any', 0, 1], [$slot->kind, (int) $slot->min_choices, (int) $slot->max_choices], 'an optional pick-one becomes choose any, at most one');
    }

    public function test_groups_that_can_not_be_slots_are_left_with_the_reason(): void
    {
        $combo = $this->withRecipe('Combo', 500);
        $a = $this->withRecipe('A', 10);
        $b = $this->withRecipe('B', 10);
        $nothing = $this->dish('No recipe', 10);
        app(SidesFromDishes::class)->run();
        $this->optionGroups($combo, [
            ['name' => 'Mixed', 'kind' => 'single', 'min_choices' => 1, 'options' => [['name' => 'A', 'linked_dish_id' => $a->id], ['name' => 'Plain', 'price_delta' => 0]]],
            ['name' => 'Discount', 'kind' => 'single', 'min_choices' => 1, 'options' => [['name' => 'A', 'price_delta' => -10, 'linked_dish_id' => $a->id], ['name' => 'B', 'linked_dish_id' => $b->id]]],
            ['name' => 'One only', 'kind' => 'single', 'min_choices' => 1, 'options' => [['name' => 'A', 'linked_dish_id' => $a->id]]],
            ['name' => 'No side', 'kind' => 'single', 'min_choices' => 1, 'options' => [['name' => 'Nothing', 'linked_dish_id' => $nothing->id], ['name' => 'B', 'linked_dish_id' => $b->id]]],
        ]);
        $p = $this->conv()->preview();
        $why = collect($p['skipped'])->pluck('why', 'group');
        $this->assertStringContainsString('takes money off', $why['Discount']);
        $this->assertStringContainsString('only one choice', $why['One only']);
        $this->assertStringContainsString('No recipe has no side yet', $why['No side']);
        $this->assertArrayNotHasKey('Mixed', $why->all(), 'a group of plain choices is not a set meal: it is simply left alone');
        $r = $this->conv()->run();
        $this->assertSame([0, 3], [$r['groups'], $r['skipped']]);
        $this->assertSame(4, OptionGroup::whereNull('slot_id')->count(), 'every group is still offered');
    }

    public function test_a_dish_with_a_make_up_of_its_own_is_not_given_one_and_a_set_meal_on_it_waits(): void
    {
        [$combo] = $this->combo();
        $other = $this->withRecipe('Plate', 200);
        app(SidesFromDishes::class)->run();
        app(DishMakeup::class)->save($combo, ['slots' => [['name' => 'Mine', 'kind' => 'fixed', 'choices' => [['side_id' => Side::where('name', 'Fries')->value('id')]]]]]);
        $r = $this->conv()->run();
        $this->assertSame(['Mine'], DishSlot::where('dish_id', $combo->id)->pluck('name')->all(), 'untouched');
        $this->assertSame(1, $r['skipped']);
        $this->assertStringContainsString('change it by hand', $this->conv()->preview()['skipped'][0]['why']);
        $this->assertSame(1, DishSlot::where('dish_id', $other->id)->count());
    }

    public function test_the_preview_warns_about_stock_on_the_old_shelf_of_a_dish_made_ahead(): void
    {
        $cake = $this->withRecipe('Cake', 300, false);
        app(SidesFromDishes::class)->run();
        DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 5, 'qty_left' => 4, 'status' => 'ok']);
        $p = $this->conv()->preview();
        $this->assertCount(1, $p['own']);
        $this->assertStringContainsString('Cake is made ahead and 4 portions are on the old dish shelf', $p['warnings'][0]);
    }

    public function test_the_preview_changes_nothing_and_says_it_is_not_ready_before_script_204(): void
    {
        $this->combo();
        $p = $this->conv()->preview();
        $this->assertSame([true, 3, 1], [$p['ready'], count($p['own']), count($p['groups'])]);
        $this->assertSame(['Fries', 'Salad'], $p['groups'][0]['sides']);
        $this->assertSame([0, 0], [DishSlot::count(), OptionGroup::whereNotNull('slot_id')->count()]);
        Schema::table('menus_option_groups', fn ($t) => $t->dropColumn('slot_id'));
        $this->assertFalse($this->conv()->preview()['ready']);
        try {
            $this->conv()->run();
            $this->fail('expected the script message');
        } catch (BooksException $e) {
            $this->assertStringContainsString('204_menus_option_groups_slot', $e->getMessage());
        }
        $this->assertSame(1, OptionGroup::count(), 'the groups still work without the column');
        app(DishPricing::class)->resolve(Dish::where('name', 'Burger combo')->first(), []);
    }

    public function test_the_page_previews_and_builds(): void
    {
        $this->combo();
        $c = app(\App\Http\Controllers\Admin\MenusDishMakeupController::class);
        $this->assertSame([3, 1], [count($c->buildPreview()->getData(true)['own']), count($c->buildPreview()->getData(true)['groups'])]);
        $msg = $c->buildRun()->getData(true)['message'];
        $this->assertStringContainsString('3 dishes given a slot of their own side', $msg);
        $this->assertStringContainsString('1 set-meal group turned into slots', $msg);
        $this->assertStringContainsString('Nothing to do', $c->buildRun()->getData(true)['message']);
    }
}
