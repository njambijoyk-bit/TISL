<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusMenuController;
use App\Http\Controllers\Api\MenusPublicController;
use App\Models\Menus\Dish;
use App\Models\Menus\Menu;
use App\Models\Menus\Option;
use App\Models\Menus\OptionGroup;
use App\Models\Menus\OptionUse;
use App\Services\Books\BooksException;
use App\Services\Location\LocationContext;
use App\Services\Menus\DishOptions;
use App\Services\Menus\DishPricing;
use App\Services\Menus\MenuSchedule;
use App\Services\Menus\MenuService;
use App\Services\Menus\PublicMenu;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 2: menus and sections, serving times, the choices on a dish and what they mean, and the menu a customer reads. */
class MenusMenusTest extends TestCase
{
    use Concerns\CreatesDishTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createDishTables();
        Schema::create('menus_menus', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('description', 500)->nullable(); $t->json('days')->nullable(); $t->time('starts_at')->nullable(); $t->time('ends_at')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_sections', function ($t) { $t->id(); $t->unsignedBigInteger('menu_id'); $t->string('name'); $t->string('description', 300)->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->unique(['section_id', 'dish_id']); });
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
    }

    private function menus(): MenuService
    {
        return app(MenuService::class);
    }

    private function at(string $day, string $time): Carbon
    {
        return Carbon::parse("{$day} {$time}", 'Africa/Nairobi');   // 2026-10-12 is a Monday
    }

    private function menu(array $o = []): Menu
    {
        return Menu::create($o + ['name' => 'Lunch', 'slug' => 'lunch'.random_int(1, 99999), 'is_active' => true]);
    }

    // ------------------------------------------------------------ serving times

    public function test_a_menu_with_no_days_or_hours_is_served_all_day_every_day(): void
    {
        $m = $this->menu();
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-12', '03:00')));
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-17', '23:59')));
        $m->update(['is_active' => false]);
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-12', '12:00')), 'a menu that is switched off is not being served');
    }

    public function test_days_and_hours_are_both_respected_and_the_end_is_not_included(): void
    {
        $m = $this->menu(['days' => [1, 2, 3, 4, 5], 'starts_at' => '06:00:00', 'ends_at' => '11:00:00']);
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-12', '06:00')), 'Monday at six');
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-12', '10:59')));
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-12', '11:00')), 'the end is when it stops');
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-12', '05:59')));
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-17', '08:00')), 'Saturday is not a weekday');
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-18', '08:00')), 'nor is Sunday');
    }

    public function test_a_menu_that_runs_past_midnight_belongs_to_the_day_it_started_on(): void
    {
        $m = $this->menu(['days' => [5], 'starts_at' => '22:00:00', 'ends_at' => '02:00:00']);   // Friday night
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-16', '22:00')), 'Friday 22:00');
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-17', '01:30')), 'Saturday 01:30 is still Friday night');
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-17', '02:00')));
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-17', '22:30')), 'Saturday night is not Friday');
        $this->assertFalse(MenuSchedule::serving($m, $this->at('2026-10-16', '01:30')), 'Friday 01:30 is Thursday night, which is not served');
    }

    public function test_the_same_start_and_end_means_all_day(): void
    {
        $m = $this->menu(['starts_at' => '00:00:00', 'ends_at' => '00:00:00']);
        $this->assertTrue(MenuSchedule::serving($m, $this->at('2026-10-12', '13:00')));
        $this->assertSame('Every day', MenuSchedule::words($m));
    }

    public function test_the_hours_are_said_in_words(): void
    {
        $this->assertSame('Every day', MenuSchedule::words($this->menu()));
        $this->assertSame('Mon–Fri, 06:00–11:00', MenuSchedule::words($this->menu(['days' => [1, 2, 3, 4, 5], 'starts_at' => '06:00:00', 'ends_at' => '11:00:00'])));
        $this->assertSame('Sun, Sat', MenuSchedule::words($this->menu(['days' => [6, 0]])));
        $this->assertSame('Mon, Wed', MenuSchedule::words($this->menu(['days' => [1, 3]])));
        $this->assertSame('Every day, 18:00–23:30', MenuSchedule::words($this->menu(['starts_at' => '18:00:00', 'ends_at' => '23:30:00'])));
    }

    // ------------------------------------------------------------ making menus

    public function test_a_menu_is_made_with_its_sections_and_dishes_in_the_order_given(): void
    {
        $a = $this->make('Chapati');
        $b = $this->make('Tea');
        $c = $this->make('Pilau');
        $m = $this->menus()->save(['name' => 'Breakfast', 'description' => ' Until eleven ', 'days' => [3, 1, 2, 2], 'starts_at' => '6:30', 'ends_at' => '11:00', 'sections' => [
            ['name' => 'Hot drinks', 'dishes' => [$b->id]], ['name' => 'Mains', 'description' => 'Fresh', 'dishes' => [$c->id, $a->id]], ['name' => 'Empty for now']]]);
        $this->assertSame(['breakfast', 'Until eleven', [1, 2, 3], '06:30:00', '11:00:00'], [$m->slug, $m->description, $m->days, $m->starts_at, $m->ends_at]);
        $m = Menu::with('sections.dishes')->find($m->id);
        $this->assertSame(['Hot drinks', 'Mains', 'Empty for now'], $m->sections->pluck('name')->all());
        $this->assertSame([$c->id, $a->id], $m->sections[1]->dishes->pluck('id')->all());
        $this->assertSame([$b->id], $m->sections[0]->dishes->pluck('id')->all());
    }

    public function test_every_day_is_stored_as_no_restriction_and_a_dish_can_be_in_several_menus(): void
    {
        $d = $this->make();
        $a = $this->menus()->save(['name' => 'A', 'days' => [0, 1, 2, 3, 4, 5, 6], 'sections' => [['name' => 'S', 'dishes' => [$d->id]]]]);
        $this->menus()->save(['name' => 'B', 'sections' => [['name' => 'S', 'dishes' => [$d->id]]]]);
        $this->assertNull($a->days);
        $this->assertSame(2, DB::table('menus_section_dishes')->where('dish_id', $d->id)->count());
    }

    public function test_two_menus_with_the_same_name_get_different_addresses(): void
    {
        $this->assertSame(['lunch', 'lunch-2'], [$this->menus()->save(['name' => 'Lunch'])->slug, $this->menus()->save(['name' => 'Lunch'])->slug]);
    }

    public function test_saving_again_replaces_the_sections_but_a_save_that_names_none_leaves_them(): void
    {
        $d = $this->make();
        $m = $this->menus()->save(['name' => 'Dinner', 'sections' => [['name' => 'Mains', 'dishes' => [$d->id]]]]);
        $this->menus()->save(['name' => 'Dinner', 'is_active' => false], $m->id);
        $this->assertSame(1, Menu::find($m->id)->sections()->count(), 'nothing said about sections: they stay');
        $this->assertFalse(Menu::find($m->id)->is_active);
        $this->menus()->save(['name' => 'Dinner', 'sections' => [['name' => 'Starters'], ['name' => 'Desserts']]], $m->id);
        $this->assertSame(['Starters', 'Desserts'], Menu::find($m->id)->sections->pluck('name')->all());
        $this->assertSame(0, DB::table('menus_section_dishes')->count(), 'the old rows are gone');
    }

    public function test_bad_menus_are_refused_with_a_reason(): void
    {
        $d = $this->make();
        $cases = [
            [['name' => ' '], 'Give the menu a name'],
            [['name' => 'X', 'starts_at' => '06:00'], 'both the time it starts and the time it ends'],
            [['name' => 'X', 'starts_at' => '25:00', 'ends_at' => '26:00'], 'written like 06:30'],
            [['name' => 'X', 'starts_at' => '6pm', 'ends_at' => '9pm'], 'written like 06:30'],
            [['name' => 'X', 'days' => [1, 8]], 'must be 0 (Sunday) to 6'],
            [['name' => 'X', 'sections' => [['name' => '']]], 'section needs a name'],
            [['name' => 'X', 'sections' => [['name' => 'S', 'dishes' => [$d->id, $d->id]]]], 'listed twice in S'],
            [['name' => 'X', 'sections' => [['name' => 'S', 'dishes' => [9999]]]], 'does not exist any more'],
        ];
        foreach ($cases as [$in, $why]) {
            try {
                $this->menus()->save($in);
                $this->fail("should be refused: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->assertSame(0, Menu::count(), 'a refused menu leaves nothing behind');
    }

    public function test_deleting_a_menu_takes_its_sections_but_not_its_dishes(): void
    {
        $d = $this->make();
        $m = $this->menus()->save(['name' => 'Old', 'sections' => [['name' => 'S', 'dishes' => [$d->id]]]]);
        $this->menus()->delete($m);
        $this->assertSame([0, 0, 0, 1], [Menu::count(), DB::table('menus_sections')->count(), DB::table('menus_section_dishes')->count(), Dish::count()]);
    }

    // ------------------------------------------------------------ choices on a dish

    private function side(string $name, float $price = 0, array $o = []): array
    {
        return ['name' => $name, 'price_delta' => $price] + $o;
    }

    private function opts(): DishOptions
    {
        return app(DishOptions::class);
    }

    public function test_groups_and_choices_are_saved_in_order_and_come_back_as_the_screen_edits_them(): void
    {
        $d = $this->make('Burger');
        $this->opts()->save($d, [
            ['name' => 'Size', 'kind' => 'single', 'min_choices' => 1, 'options' => [$this->side('Regular', 0, ['is_default' => true]), $this->side('Large', 100)]],
            ['name' => 'Extras', 'kind' => 'multiple', 'max_choices' => 2, 'options' => [$this->side('Extra cheese', 50), $this->side('Bacon', 80)]],
        ]);
        $g = $this->opts()->forDish($d);
        $this->assertSame(['Size', 'Extras'], array_column($g, 'name'));
        $this->assertSame([['single', 1, 1], ['multiple', 0, 2]], array_map(fn ($x) => [$x['kind'], $x['min_choices'], $x['max_choices']], $g), 'a pick-one group allows one');
        $this->assertSame(['Regular', 'Large'], array_column($g[0]['options'], 'name'));
        $this->assertSame([true, false], array_column($g[0]['options'], 'is_default'));
        $this->assertSame([50.0, 80.0], array_column($g[1]['options'], 'price_delta'));
    }

    public function test_saving_again_keeps_the_ids_of_what_stays_and_removes_what_is_left_out(): void
    {
        $d = $this->make();
        $this->opts()->save($d, [['name' => 'Size', 'options' => [$this->side('Regular'), $this->side('Large', 100)]], ['name' => 'Extras', 'kind' => 'multiple', 'options' => [$this->side('Cheese', 50, ['uses' => [['mode' => 'add', 'variant_id' => $this->item('Cheese', '1 kg'), 'quantity' => 1]]])]]]);
        $before = $this->opts()->forDish($d);
        $keep = $before[0];
        $this->opts()->save($d, [['id' => $keep['id'], 'name' => 'Portion', 'options' => [['id' => $keep['options'][1]['id'], 'name' => 'Large', 'price_delta' => 120]]]]);
        $after = $this->opts()->forDish($d);
        $this->assertCount(1, $after);
        $this->assertSame([$keep['id'], 'Portion'], [$after[0]['id'], $after[0]['name']], 'the group keeps its id');
        $this->assertSame([$keep['options'][1]['id'], 120.0], [$after[0]['options'][0]['id'], $after[0]['options'][0]['price_delta']], 'and so does the choice that stayed');
        $this->assertSame([1, 1, 0], [OptionGroup::count(), Option::count(), OptionUse::count()], 'the left-out group, choices and their uses are gone');
    }

    public function test_the_charge_for_a_removal_only_means_something_on_a_choice_that_only_removes(): void
    {
        $d = $this->make();
        $this->opts()->save($d, [['name' => 'G', 'kind' => 'multiple', 'options' => [$this->side('Extra', 20, ['charge_removal' => true, 'uses' => [['mode' => 'add', 'variant_id' => $this->item('Cheese', '1 kg'), 'quantity' => 1]]])]]]);
        $this->assertFalse($this->opts()->forDish($d)[0]['options'][0]['charge_removal']);
    }

    public function test_changing_what_a_choice_uses_replaces_it(): void
    {
        $d = $this->make();
        $cheese = $this->item('Cheese', '1 kg');
        $this->opts()->save($d, [['name' => 'G', 'kind' => 'multiple', 'options' => [$this->side('Extra', 20, ['uses' => [['mode' => 'add', 'variant_id' => $cheese, 'quantity' => 1]]])]]]);
        $o = $this->opts()->forDish($d)[0];
        $this->opts()->save($d, [['id' => $o['id'], 'name' => 'G', 'kind' => 'multiple', 'options' => [['id' => $o['options'][0]['id'], 'name' => 'Extra', 'price_delta' => 20, 'uses' => [['mode' => 'add', 'variant_id' => $cheese, 'quantity' => 2]]]]]]);
        $uses = OptionUse::all();
        $this->assertSame([1, 2.0], [$uses->count(), (float) $uses[0]->quantity]);
        $this->opts()->save($d, [['id' => $o['id'], 'name' => 'G', 'kind' => 'multiple', 'options' => [['id' => $o['options'][0]['id'], 'name' => 'Extra', 'price_delta' => 20]]]]);
        $this->assertSame(0, OptionUse::count());
    }

    public function test_a_choice_id_from_another_group_is_not_taken_over(): void
    {
        $a = $this->make('A');
        $this->opts()->save($a, [['name' => 'One', 'options' => [$this->side('Mine')]], ['name' => 'Two', 'options' => [$this->side('Other')]]]);
        $g = $this->opts()->forDish($a);
        $this->opts()->save($a, [['id' => $g[0]['id'], 'name' => 'One', 'options' => [['id' => $g[1]['options'][0]['id'], 'name' => 'Stolen']]], ['id' => $g[1]['id'], 'name' => 'Two', 'options' => [['id' => $g[1]['options'][0]['id'], 'name' => 'Other']]]]);
        $after = $this->opts()->forDish($a);
        $this->assertSame(['Stolen'], array_column($after[0]['options'], 'name'));
        $this->assertSame(['Other'], array_column($after[1]['options'], 'name'), 'the other group kept its own choice');
    }

    public function test_an_id_from_another_dish_is_not_taken_over(): void
    {
        $a = $this->make('A');
        $b = $this->make('B');
        $this->opts()->save($a, [['name' => 'Size', 'options' => [$this->side('Regular')]]]);
        $foreign = $this->opts()->forDish($a)[0];
        $this->opts()->save($b, [['id' => $foreign['id'], 'name' => 'Mine', 'options' => [['id' => $foreign['options'][0]['id'], 'name' => 'Mine']]]]);
        $this->assertSame('Size', $this->opts()->forDish($a)[0]['name'], 'dish A is untouched');
        $this->assertSame('Mine', $this->opts()->forDish($b)[0]['name']);
        $this->assertSame(2, OptionGroup::count());
    }

    public function test_bad_groups_and_choices_are_refused_with_a_reason(): void
    {
        $d = $this->make();
        $other = $this->make('Fries');
        $cases = [
            [[['name' => ' ', 'options' => [$this->side('A')]]], 'needs a name'],
            [[['name' => 'G', 'kind' => 'lots', 'options' => [$this->side('A')]]], 'one or several'],
            [[['name' => 'G', 'options' => []]], 'has no choices'],
            [[['name' => 'G', 'options' => [$this->side('')]]], 'every choice needs a name'],
            [[['name' => 'G', 'min_choices' => 2, 'options' => [$this->side('A'), $this->side('B')]]], 'at least one can not be more than one'],
            [[['name' => 'G', 'kind' => 'multiple', 'min_choices' => 3, 'options' => [$this->side('A'), $this->side('B')]]], 'asks for 3 but only has 2'],
            [[['name' => 'G', 'kind' => 'multiple', 'min_choices' => 2, 'max_choices' => 1, 'options' => [$this->side('A'), $this->side('B')]]], 'least can not be more than the most'],
            [[['name' => 'G', 'kind' => 'multiple', 'max_choices' => 0, 'options' => [$this->side('A')]]], 'at least 1'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['is_default' => true]), $this->side('B', 0, ['is_default' => true])]]], 'more choices ticked as the usual one'],
            [[['name' => 'G', 'options' => [$this->side('A'), $this->side('a')]]], 'lists the same choice twice'],
            [[['name' => 'G', 'options' => [$this->side('A', 99999999)]]], 'too large'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['linked_dish_id' => $d->id])]]], 'can not be a choice on itself'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['linked_dish_id' => 9999])]]], 'that dish does not exist'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'swap', 'variant_id' => 1]]])]]], 'uses more of something or leaves something out'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'add', 'quantity' => 1]]])]]], 'name one ingredient or one stock item'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'add', 'variant_id' => $other->variant_id, 'family_id' => 1, 'quantity' => 1]]])]]], 'name one ingredient or one stock item'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'add', 'family_id' => 9999, 'quantity' => 1]]])]]], 'ingredient does not exist'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'add', 'variant_id' => 9999, 'quantity' => 1]]])]]], 'stock item does not exist'],
            [[['name' => 'G', 'options' => [$this->side('A', 0, ['uses' => [['mode' => 'add', 'variant_id' => $other->variant_id]]])]]], 'say how much more'],
        ];
        foreach ($cases as $n => [$groups, $why]) {
            try {
                $this->opts()->save($d, $groups);
                $this->fail("case {$n} should be refused: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage(), "case {$n}");
            }
        }
        $this->assertSame(0, OptionGroup::count(), 'a refused save leaves nothing behind');
    }

    public function test_leaving_something_out_must_be_something_the_recipe_uses_and_is_free_unless_charged_for(): void
    {
        $d = $this->make('Burger');
        $onion = $this->family('Onion', [], [[$this->item('Onions', '1 kg'), 1000]]);
        $bun = $this->item('Bun', 'each');
        $this->recipe($d, [['family_id' => $onion, 'quantity' => 30], ['variant_id' => $bun, 'quantity' => 1]]);
        $strangerFamily = $this->family('Mayo', [], [[$this->item('Mayo', '1 kg'), 1000]]);
        try {
            $this->opts()->save($d, [['name' => 'Take out', 'kind' => 'multiple', 'options' => [$this->side('No mayo', 0, ['uses' => [['mode' => 'remove', 'family_id' => $strangerFamily]]])]]]);
            $this->fail('the recipe has no mayo');
        } catch (BooksException $e) {
            $this->assertStringContainsString('the recipe does not use that', $e->getMessage());
        }
        $this->opts()->save($d, [['name' => 'Take out', 'kind' => 'multiple', 'options' => [
            $this->side('No onion', 25, ['uses' => [['mode' => 'remove', 'family_id' => $onion]]]),                      // someone typed a price: a removal is free
            $this->side('No bun', 30, ['charge_removal' => true, 'uses' => [['mode' => 'remove', 'variant_id' => $bun]]]),   // this one is deliberately charged
            $this->side('Extra onion', 10, ['uses' => [['mode' => 'add', 'family_id' => $onion, 'quantity' => 30]]]),      // an add-on carries its price
            $this->side('No onion, extra cheese', 40, ['uses' => [['mode' => 'remove', 'family_id' => $onion], ['mode' => 'add', 'variant_id' => $this->item('Cheese', '1 kg'), 'quantity' => 1]]]),
        ]]]);
        $o = $this->opts()->forDish($d)[0]['options'];
        $this->assertSame([0.0, 30.0, 10.0, 40.0], array_column($o, 'price_delta'));
        $this->assertSame([false, true, false, false], array_column($o, 'charge_removal'));
    }

    public function test_an_extra_in_a_unit_that_does_not_fit_is_refused(): void
    {
        $d = $this->make();
        $fam = $this->family('Oil', [], [[$this->item('Oil', '1 l'), 1000]]);   // measured in grams in these tests
        $this->expectExceptionMessage('can not be turned into it');
        $this->opts()->save($d, [['name' => 'Extras', 'kind' => 'multiple', 'options' => [$this->side('Extra oil', 10, ['uses' => [['mode' => 'add', 'family_id' => $fam, 'quantity' => 5, 'unit_id' => $this->ml]]])]]]);
    }

    // ------------------------------------------------------------ what the choices mean

    private function burger(): Dish
    {
        $d = $this->make('Burger', 400);
        $cheese = $this->family('Cheese', [], [[$this->item('Cheese', '1 kg'), 1000]]);
        $fries = $this->make('Fries', 150);
        $this->recipe($d, [['family_id' => $cheese, 'quantity' => 20]]);
        $this->opts()->save($d, [
            ['name' => 'Size', 'kind' => 'single', 'min_choices' => 1, 'options' => [$this->side('Regular', 0, ['is_default' => true]), $this->side('Large', 100)]],
            ['name' => 'Extras', 'kind' => 'multiple', 'max_choices' => 2, 'options' => [
                $this->side('Extra cheese', 50, ['uses' => [['mode' => 'add', 'family_id' => $cheese, 'quantity' => 20]]]), $this->side('Bacon', 80), $this->side('Pickles', 10)]],
            ['name' => 'Side', 'kind' => 'single', 'options' => [$this->side('Fries', 120, ['linked_dish_id' => $fries->id]), $this->side('Salad', 100, ['is_active' => false])]],
        ]);

        return $d;
    }

    private function optionId(Dish $d, string $name): int
    {
        foreach ($this->opts()->forDish($d) as $g) {
            foreach ($g['options'] as $o) {
                if ($o['name'] === $name) {
                    return $o['id'];
                }
            }
        }
        $this->fail("no option {$name}");
    }

    private function price(Dish $d, array $names): array
    {
        return app(DishPricing::class)->resolve($d, array_map(fn ($n) => $this->optionId($d, $n), $names));
    }

    public function test_the_usual_choice_applies_when_nothing_is_picked_in_a_group(): void
    {
        $d = $this->burger();
        $r = $this->price($d, []);
        $this->assertSame(0.0, $r['price_delta']);
        $this->assertSame(['Regular'], array_column($r['options'], 'name'));
    }

    public function test_choices_add_up_and_carry_what_they_change_in_the_kitchen(): void
    {
        $d = $this->burger();
        $r = $this->price($d, ['Large', 'Extra cheese', 'Bacon', 'Fries']);
        $this->assertSame(100 + 50 + 80 + 120.0, $r['price_delta']);
        $this->assertSame(['Large', 'Extra cheese', 'Bacon', 'Fries'], array_column($r['options'], 'name'));
        $this->assertSame(['Size', 'Extras', 'Extras', 'Side'], array_column($r['options'], 'group'));
        $this->assertSame([['mode' => 'add', 'quantity' => 20.0]], array_map(fn ($u) => ['mode' => $u['mode'], 'quantity' => $u['quantity']], $r['uses']));
        $this->assertSame([Dish::where('name', 'Fries')->value('id')], $r['linked_dishes'], 'a set-meal side is another dish');
    }

    public function test_a_required_group_must_be_answered_and_too_many_is_refused(): void
    {
        $d = $this->burger();
        $d2 = $this->make('Plain');
        $this->opts()->save($d2, [['name' => 'Sauce', 'min_choices' => 1, 'options' => [$this->side('Ketchup'), $this->side('Mayo')]]]);
        $cases = [
            [$d2, [], 'Sauce: please choose one'],
            [$d, ['Regular', 'Large'], 'Size: choose only one'],
            [$d, ['Extra cheese', 'Bacon', 'Pickles'], 'Extras: choose no more than 2'],
        ];
        foreach ($cases as [$dish, $names, $why]) {
            try {
                app(DishPricing::class)->resolve($dish, array_map(fn ($n) => $this->optionId($dish, $n), $names));
                $this->fail($why);
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
    }

    public function test_a_group_that_asks_for_several_says_how_many(): void
    {
        $d = $this->make();
        $this->opts()->save($d, [['name' => 'Toppings', 'kind' => 'multiple', 'min_choices' => 2, 'options' => [$this->side('A'), $this->side('B'), $this->side('C')]]]);
        $this->expectExceptionMessage('Toppings: choose at least 2');
        app(DishPricing::class)->resolve($d, [$this->optionId($d, 'A')]);
    }

    public function test_a_choice_from_another_dish_or_one_that_is_switched_off_is_not_accepted(): void
    {
        $d = $this->burger();
        $other = $this->make('Cake');
        $this->opts()->save($other, [['name' => 'Candles', 'options' => [$this->side('Yes')]]]);
        foreach ([[$this->optionId($other, 'Yes')], [$this->optionId($d, 'Salad')]] as $ids) {
            try {
                app(DishPricing::class)->resolve($d, $ids);
                $this->fail('should be refused');
            } catch (BooksException $e) {
                $this->assertStringContainsString('is not on Burger', $e->getMessage());
            }
        }
    }

    public function test_the_same_choice_sent_twice_counts_once(): void
    {
        $d = $this->burger();
        $id = $this->optionId($d, 'Bacon');
        $this->assertSame(80.0, app(DishPricing::class)->resolve($d, [$id, $id])['price_delta']);
    }

    // ------------------------------------------------------------ the menu a customer reads

    private function card(): array
    {
        $chapati = $this->make('Chapati', 50, ['description' => 'Soft']);
        $flour = $this->family('Flour', ['allergens' => ['wheat'], 'tags' => ['gluten']], [[$exe = $this->item('Exe', '2 kg'), 2000]]);
        $this->stock($exe, 5);
        $this->recipe($chapati, [['family_id' => $flour, 'quantity' => 100]]);
        $off = $this->make('Retired', 10, ['is_active' => false]);
        $gone = $this->make('Sold out', 20);
        $this->dishes()->soldOutToday($gone, true);
        $this->opts()->save($chapati, [['name' => 'Side', 'options' => [$this->side('Stew', 100, ['linked_dish_id' => $gone->id]), $this->side('Hidden', 5, ['is_active' => false])]]]);
        $this->menus()->save(['name' => 'Breakfast', 'days' => [1, 2, 3, 4, 5], 'starts_at' => '06:00', 'ends_at' => '11:00', 'sort_order' => 1, 'sections' => [['name' => 'Mains', 'dishes' => [$chapati->id, $off->id, $gone->id]], ['name' => 'Empty after filtering', 'dishes' => [$off->id]]]]);
        $this->menus()->save(['name' => 'Closed', 'is_active' => false, 'sections' => [['name' => 'X', 'dishes' => [$chapati->id]]]]);
        $this->menus()->save(['name' => 'Nothing in it', 'sections' => [['name' => 'Y']]]);

        return [$chapati, $gone, $off];
    }

    public function test_the_public_menu_shows_active_menus_with_their_sections_and_dishes_and_what_is_being_served(): void
    {
        [$chapati, $gone] = $this->card();
        $out = app(PublicMenu::class)->build($this->at('2026-10-12', '08:00'), self::BRANCH);
        $this->assertSame(['Breakfast'], array_column($out['menus'], 'name'), 'a switched-off menu and one with nothing in it are not shown');
        $m = $out['menus'][0];
        $this->assertSame(['Mon–Fri, 06:00–11:00', true], [$m['serves'], $m['serving_now']]);
        $this->assertSame(['Mains'], array_column($m['sections'], 'name'), 'a section left with no dish is not shown');
        $this->assertSame(['Chapati', 'Sold out'], array_column($m['sections'][0]['dishes'], 'name'), 'a dish that is switched off is not on the menu');
        $this->assertFalse(app(PublicMenu::class)->build($this->at('2026-10-12', '14:00'), self::BRANCH)['menus'][0]['serving_now']);
        $this->assertFalse(app(PublicMenu::class)->build($this->at('2026-10-17', '08:00'), self::BRANCH)['menus'][0]['serving_now']);
        $this->assertArrayHasKey('wheat', $out['allergens']);
        $this->assertSame(MenusSettingsNote::text(), $out['note']);
    }

    public function test_each_dish_carries_its_allergens_diets_price_availability_and_visible_choices(): void
    {
        $this->card();
        $d = app(PublicMenu::class)->build($this->at('2026-10-12', '08:00'), self::BRANCH)['menus'][0]['sections'][0]['dishes'];
        [$chapati, $soldOut] = $d;
        $this->assertSame([['wheat'], true, true, 50.0, true, false], [$chapati['allergens'], $chapati['info_complete'], in_array('vegetarian', $chapati['diets'], true), $chapati['price'], $chapati['available'], $chapati['sold_out_today']]);
        $this->assertNotContains('gluten_free', $chapati['diets']);
        $this->assertNull($chapati['price_incl'], 'no tax can be worked out in this test database, so only the price before tax is given');
        $this->assertSame([false, true], [$soldOut['available'], $soldOut['sold_out_today']]);
        $this->assertSame(['Stew'], array_column($chapati['options'][0]['options'], 'name'), 'a switched-off choice is not offered');
        $this->assertSame('Sold out', $chapati['options'][0]['options'][0]['dish']);
        $this->assertSame(['id', 'name', 'kind', 'min_choices', 'max_choices', 'options'], array_keys($chapati['options'][0]), 'the choices are described for display');
    }

    public function test_the_public_menu_never_shows_what_the_kitchen_uses_or_what_things_cost_to_make(): void
    {
        $this->card();
        $json = json_encode(app(PublicMenu::class)->build($this->at('2026-10-12', '08:00'), self::BRANCH));
        foreach (['cost', 'margin', 'unit_cost', 'family_id', 'variant_id', 'uses', 'recipe', 'supplier', 'sales_ledger'] as $secret) {
            $this->assertStringNotContainsString("\"{$secret}", $json, $secret);
        }
    }

    public function test_the_public_endpoint_answers_for_the_branch_the_customer_is_in(): void
    {
        $this->card();
        $ctx = app(LocationContext::class);
        $ctx->setById(self::BRANCH);
        $res = app(MenusPublicController::class)->index(app(PublicMenu::class), $ctx)->getData(true);
        $this->assertSame('Breakfast', $res['menus'][0]['name']);
        $this->assertArrayHasKey('now', $res);
    }

    // ------------------------------------------------------------ the screens' API

    public function test_the_admin_list_and_save_endpoints_speak_plainly(): void
    {
        $d = $this->make('Tea');
        $c = app(MenusMenuController::class);
        $ok = $c->save(Request::create('/x', 'POST', ['name' => 'Breakfast', 'days' => [1, 2], 'starts_at' => '06:00', 'ends_at' => '11:00', 'sections' => [['name' => 'Drinks', 'dishes' => [$d->id]]]]));
        $this->assertSame(201, $ok->status());
        $bad = $c->save(Request::create('/x', 'POST', ['name' => 'Bad', 'starts_at' => '06:00']));
        $this->assertSame(422, $bad->status());
        $this->assertStringContainsString('both the time', $bad->getData(true)['message']);
        $list = $c->index()->getData(true);
        $m = $list['menus'][0];
        $this->assertSame(['Mon, Tue, 06:00–11:00', '06:00', [1, 2], 'Drinks', 'Tea'], [$m['serves'], $m['starts_at'], $m['days'], $m['sections'][0]['name'], $m['sections'][0]['dishes'][0]['name']]);
        $this->assertSame('Tea', $list['dishes'][0]['name']);
        $this->assertSame(200, $c->destroy($m['id'])->status());
        $this->assertSame(0, Menu::count());
    }

    public function test_the_choices_endpoints_list_what_the_screen_needs_and_save_what_it_sends(): void
    {
        $d = $this->make('Burger');
        $cheese = $this->family('Cheese', [], [[$this->item('Cheese', '1 kg'), 1000]]);
        $this->recipe($d, [['family_id' => $cheese, 'quantity' => 20]]);
        $c = app(MenusMenuController::class);
        $res = $c->saveOptions(Request::create('/x', 'PUT', ['groups' => [['name' => 'Extras', 'kind' => 'multiple', 'options' => [['name' => 'Extra cheese', 'price_delta' => 50, 'uses' => [['mode' => 'add', 'family_id' => $cheese, 'quantity' => 20]]]]]]]), $d->id);
        $this->assertSame(200, $res->status());
        $bad = $c->saveOptions(Request::create('/x', 'PUT', ['groups' => [['name' => 'Extras', 'options' => [['name' => 'Gone', 'uses' => [['mode' => 'remove', 'family_id' => 9999]]]]]]]), $d->id);
        $this->assertSame(422, $bad->status());
        $o = $c->options($d->id)->getData(true);
        $this->assertSame(['Burger', true, 'Extras', 'Cheese'], [$o['dish']['name'], $o['dish']['has_recipe'], $o['groups'][0]['name'], $o['families'][0]['name']]);
        $this->assertSame('Cheese', $o['recipe_lines'][0]['name']);
        $this->assertNotEmpty($o['units']);
    }
}

/** (the allergen note the Menus settings give when nothing was saved) */
final class MenusSettingsNote
{
    public static function text(): string
    {
        return \App\Services\Menus\MenusSettings::DEFAULTS['allergen_note'];
    }
}
