<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Services\Books\BooksException;
use App\Services\Courses\RecipePublisher;
use App\Services\Menus\DishRecipes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus recipes that stand on their own (script 194): a name instead of a dish, the same checks as a dish's recipe, and the dishes' recipes left exactly as they were. */
class MenusRecipeBookTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->pantry('Onions');
        $this->pantry('Tomatoes');
    }

    private function svc(): DishRecipes
    {
        return app(DishRecipes::class);
    }

    private function lines(array $lines = [['Onions', 200], ['Tomatoes', 300]]): array
    {
        return array_map(fn ($l) => ['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', $l[0])->value('id'), 'quantity' => $l[1]], $lines);
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

    public function test_a_recipe_can_stand_on_its_own_with_a_name(): void
    {
        $r = $this->svc()->saveStandalone(['name' => 'Tomato and onion base', 'yield_qty' => 2, 'made_to_order' => false, 'lines' => $this->lines(), 'steps' => [['body' => 'Fry the onions', 'minutes' => 5]]]);
        $this->assertNull($r->dish_id);
        $this->assertSame('Tomato and onion base', $r->title());
        $this->assertSame(2.0, (float) $r->yield_qty);
        $this->assertFalse((bool) $r->made_to_order);
        $this->assertCount(2, $r->lines);
        $this->assertCount(1, $r->steps);
        $this->assertSame([$r->id], DishRecipe::standalone()->pluck('id')->all());
    }

    public function test_it_has_the_same_checks_as_a_dishs_recipe(): void
    {
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => '  ', 'lines' => $this->lines()]), 'Give the recipe a name');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Base', 'lines' => []]), 'Add at least one ingredient');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Base', 'yield_qty' => 0, 'lines' => $this->lines()]), 'more than nothing');
        $dup = $this->lines([['Onions', 1], ['Onions', 2]]);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $dup]), 'listed twice');
        $this->assertSame(0, DishRecipe::count(), 'a refused recipe leaves nothing behind');
    }

    public function test_a_name_is_used_once_whatever_its_case_and_a_recipe_can_keep_its_own(): void
    {
        $a = $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $this->lines()]);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'BASE', 'lines' => $this->lines()]), 'already a recipe called');
        $again = $this->svc()->saveStandalone(['name' => 'Base', 'yield_qty' => 3, 'lines' => $this->lines([['Onions', 1]])], $a->id);
        $this->assertSame($a->id, $again->id, 'saving it again changes it');
        $this->assertSame(3.0, (float) $again->yield_qty);
        $this->assertCount(1, $again->lines, 'the lines are replaced');
        $this->assertSame(1, DishRecipe::count());
    }

    public function test_a_dishs_recipe_and_a_recipe_of_its_own_stay_apart(): void
    {
        $dish = $this->dish('Pancakes', 100, [['Onions', 1]]);
        $own = $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $this->lines()]);
        $this->assertSame('Pancakes', DishRecipe::where('dish_id', $dish->id)->first()->title(), 'a dish recipe takes the dish name');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Pancakes again', 'lines' => $this->lines()], DishRecipe::where('dish_id', $dish->id)->value('id')), 'recipe of Pancakes');
        $this->fails(fn () => $this->svc()->deleteStandalone((int) DishRecipe::where('dish_id', $dish->id)->value('id')), 'recipe of Pancakes');
        $this->svc()->save($dish, ['yield_qty' => 4, 'lines' => $this->lines([['Tomatoes', 1]])]);
        $this->assertSame(4.0, (float) DishRecipe::where('dish_id', $dish->id)->first()->yield_qty, 'writing the dish recipe again still updates that one');
        $this->assertSame(2, DishRecipe::count());
        $this->assertSame(2, $own->fresh()->lines->count(), 'and leaves the other alone');
    }

    public function test_removing_one_takes_its_lines_and_steps_and_a_batch_made_from_it_blocks_it(): void
    {
        $r = $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $this->lines(), 'steps' => [['body' => 'Stir']]]);
        $this->svc()->deleteStandalone($r->id);
        $this->assertSame([0, 0, 0], [DishRecipe::count(), DB::table('menus_recipe_lines')->count(), DB::table('menus_recipe_steps')->count()]);

        $kept = $this->svc()->saveStandalone(['name' => 'Kept', 'lines' => $this->lines()]);
        DB::table('menus_productions')->insert(['number' => 'MB-1', 'dish_id' => 0, 'recipe_id' => $kept->id, 'location_id' => 1, 'portions' => 1, 'status' => 'posted', 'made_on' => '2026-10-01', 'created_at' => now(), 'updated_at' => now()]);
        $this->fails(fn () => $this->svc()->deleteStandalone($kept->id), 'been made in a batch');
        $this->assertSame(1, DishRecipe::count());
    }

    public function test_a_recipe_of_its_own_is_not_offered_to_courses_until_it_has_a_dish(): void
    {
        $r = $this->svc()->saveStandalone(['name' => 'Base', 'visibility' => 'public', 'lines' => $this->lines()]);
        $this->assertSame('Base', app(RecipePublisher::class)->render($r)['title']);
    }

    public function test_the_page_lists_dish_recipes_and_recipes_of_their_own_apart_and_saves_through_the_book(): void
    {
        $dish = $this->dish('Pancakes', 100, [['Onions', 1]]);
        $c = app(\App\Http\Controllers\Admin\MenusRecipesController::class);
        $body = ['name' => 'Base', 'yield_qty' => 2, 'lines' => $this->lines()];
        $res = $c->saveBook(\Illuminate\Http\Request::create('/x', 'POST', $body));
        $this->assertSame(201, $res->getStatusCode());
        $id = $res->getData(true)['recipe']['id'];
        $this->assertSame(200, $c->saveBook(\Illuminate\Http\Request::create('/x', 'PUT', ['yield_qty' => 3] + $body), $id)->getStatusCode());
        $this->assertSame(422, $c->saveBook(\Illuminate\Http\Request::create('/x', 'POST', $body))->getStatusCode(), 'the same name twice is refused');

        $page = $c->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertSame(['Base'], array_column($page['standalone'], 'name'));
        $this->assertSame([null, 3.0], [$page['standalone'][0]['dish_id'], (float) $page['standalone'][0]['yield_qty']]);
        $this->assertSame([$dish->id], array_column(array_filter($page['dishes'], fn ($d) => $d['recipe']), 'id'), 'the dish row shows only its own recipe');

        $this->assertSame(200, $c->destroyBook($id)->getStatusCode());
        $this->assertSame(422, $c->destroyBook((int) DishRecipe::where('dish_id', $dish->id)->value('id'))->getStatusCode());
    }

    public function test_script_194_makes_dish_id_optional_and_adds_the_name(): void
    {
        $sql = file_get_contents(base_path('database/sql/194_menus_recipes_stand_alone.sql'));
        $this->assertMatchesRegularExpression('/ALTER TABLE menus_recipes MODIFY dish_id BIGINT UNSIGNED NULL;/', $sql);
        $this->assertMatchesRegularExpression('/ADD COLUMN name VARCHAR\(120\) NULL/', $sql);
        $this->assertStringContainsString('uq_menus_recipe_name', $sql);
    }

    // ------------------------------------------------------------ 1.2 the yield unit

    public function test_a_recipe_of_its_own_may_count_a_batch_in_a_unit(): void
    {
        $r = $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2.5, 'yield_unit_id' => $this->kg, 'lines' => $this->lines()]);
        $this->assertSame($this->kg, (int) $r->yield_unit_id);
        $this->assertSame('2.5 kg', $r->fresh()->yieldLabel());
        $none = $this->svc()->saveStandalone(['name' => 'Soup', 'yield_qty' => 1, 'lines' => $this->lines()]);
        $this->assertNull($none->yield_unit_id);
        $this->assertSame('1 portion', $none->fresh()->yieldLabel());
        $this->assertSame('4 portions', $this->svc()->saveStandalone(['name' => 'Stew', 'yield_qty' => 4, 'lines' => $this->lines()])->fresh()->yieldLabel());
        $back = $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => null, 'lines' => $this->lines()], $r->id);
        $this->assertNull($back->yield_unit_id, 'it can go back to portions');
    }

    public function test_the_unit_must_be_a_weight_a_volume_or_a_count_that_is_switched_on(): void
    {
        $len = DB::table('units_of_measure')->insertGetId(['code' => 'm', 'name' => 'Metre', 'dimension' => 'length', 'to_base_factor' => 1]);
        $off = DB::table('units_of_measure')->insertGetId(['code' => 'oz', 'name' => 'Ounce', 'dimension' => 'mass', 'to_base_factor' => 28, 'is_active' => false]);
        foreach ([$len, $off, 99999] as $bad) {
            $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Base', 'yield_unit_id' => $bad, 'lines' => $this->lines()]), 'weight, a volume or a number of pieces');
        }
        $this->assertSame(0, DishRecipe::count());
    }

    public function test_a_dishs_recipe_counts_portions_only(): void
    {
        $dish = $this->dish('Pancakes');
        $this->fails(fn () => $this->svc()->save($dish, ['yield_unit_id' => $this->kg, 'lines' => $this->lines()]), 'counts portions');
        $this->assertSame(0, DishRecipe::count());
    }

    public function test_the_stock_maths_scales_by_the_amount_made_in_the_recipes_unit(): void
    {
        $this->pantry('Maize flour', 10000, 0.1);
        $r = $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => $this->lines([['Maize flour', 800]])]);
        $use = app(\App\Services\Menus\IngredientUse::class);
        $this->assertEqualsWithDelta(800.0, $use->needs($r, 2.0)[(int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id')]['qty'], 0.001, 'one batch is 2 kg');
        $this->assertEqualsWithDelta(2000.0, $use->needs($r, 5.0)[(int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id')]['qty'], 0.001, '5 kg is two and a half batches');
        $this->assertEqualsWithDelta(40.0, $use->cost($r, 1)['per_portion'], 0.0001, '800 g at 0.1 a gram is 80 for the batch, so 40 for each kg made');
    }

    public function test_the_page_offers_the_units_and_shows_a_recipes_unit(): void
    {
        $c = app(\App\Http\Controllers\Admin\MenusRecipesController::class);
        $res = $c->saveBook(\Illuminate\Http\Request::create('/x', 'POST', ['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => $this->lines()]));
        $this->assertSame('kg', $res->getData(true)['recipe']['yield_unit']);
        $page = $c->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertSame('2 kg', $page['standalone'][0]['yield_label']);
        $codes = array_column($page['units'], 'code');
        $this->assertContains('kg', $codes);
        $this->assertContains('each', $codes);
    }

    public function test_script_195_adds_the_unit_column_with_a_foreign_key(): void
    {
        $sql = file_get_contents(base_path('database/sql/195_menus_recipe_yield_unit.sql'));
        $this->assertStringContainsString('ADD COLUMN yield_unit_id BIGINT UNSIGNED NULL', $sql);
        $this->assertStringContainsString('fk_menus_recipes_yield_unit', $sql);
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('menus_recipes', 'yield_unit_id'), 'the test world is built from the script');
    }

    // ------------------------------------------------------------ 1.3 time by batch size

    private function ugali(array $times, ?int $id = null): DishRecipe
    {
        return $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => $this->lines(), 'times' => $times], $id);
    }

    public function test_a_recipe_keeps_its_times_smallest_first_and_the_smallest_big_enough_row_decides(): void
    {
        $r = $this->ugali([['up_to' => 2, 'minutes' => 20], ['up_to' => 1, 'minutes' => 15], ['up_to' => 5, 'minutes' => 40]]);
        $this->assertSame([[1.0, 15], [2.0, 20], [5.0, 40]], $r->times->map(fn ($t) => [(float) $t->up_to_qty, $t->minutes])->all());
        $t = app(\App\Services\Menus\RecipeTimes::class);
        $this->assertSame(15, $t->expected($r, 0.5));
        $this->assertSame(15, $t->expected($r, 1), 'up to 1 kg includes 1 kg');
        $this->assertSame(20, $t->expected($r, 1.5));
        $this->assertSame(40, $t->expected($r, 5));
        $this->assertSame(43, $t->expected($r, 5.5), 'bigger than the biggest row: grown the way it grows between the two biggest rows (20 min for 3 kg more)');
        $est = $t->estimate($r, 6);
        $this->assertSame([47, true, 'worked out from 2 kg (20 min) and 5 kg (40 min)'], [$est['minutes'], $est['estimated'], $est['basis']]);
        $this->assertFalse($t->estimate($r, 3)['estimated'], 'a size a row covers is not an estimate');
        $one = $this->ugali([['up_to' => 2, 'minutes' => 20]], $r->id);   // the same recipe with a single row
        $this->assertSame(50, $t->expected($one, 5), 'a single row is scaled in proportion: 20 min for 2 kg is 50 for 5 kg');
        $this->assertSame(20, $t->expected($one, 2));
    }

    public function test_an_amount_written_in_another_unit_is_converted(): void
    {
        $r = $this->ugali([['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20]]);
        $g = \App\Models\UnitOfMeasure::find($this->g);
        $t = app(\App\Services\Menus\RecipeTimes::class);
        $this->assertSame(15, $t->expected($r, 800, $g), '800 g is under 1 kg');
        $this->assertSame(20, $t->expected($r, 1500, $g));
        $this->fails(fn () => $t->expected($r, 3, \App\Models\UnitOfMeasure::find($this->each)), 'measures the same');
    }

    public function test_saving_again_replaces_the_times_and_leaving_them_out_keeps_them(): void
    {
        $r = $this->ugali([['up_to' => 1, 'minutes' => 15]]);
        $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'lines' => $this->lines()], $r->id);
        $this->assertSame(1, $r->times()->count(), 'a save with no times in it leaves them alone');
        $again = $this->ugali([['up_to' => 3, 'minutes' => 30]], $r->id);
        $this->assertSame([[3.0, 30]], $again->times->map(fn ($t) => [(float) $t->up_to_qty, $t->minutes])->all(), 'a save with times replaces them');
        $this->ugali([], $r->id);
        $this->assertSame(0, $r->times()->count(), 'an empty list clears them');
    }

    public function test_the_rows_are_checked(): void
    {
        $this->fails(fn () => $this->ugali([['up_to' => 0, 'minutes' => 10]]), 'how big a batch');
        $this->fails(fn () => $this->ugali([['up_to' => 1, 'minutes' => 0]]), 'between 1 and 6000');
        $this->fails(fn () => $this->ugali([['up_to' => 1, 'minutes' => 10], ['up_to' => 1.0, 'minutes' => 12]]), 'same batch size');
        $this->fails(fn () => $this->ugali(array_map(fn ($i) => ['up_to' => $i, 'minutes' => 5], range(1, 13))), '12 rows or fewer');
        $this->assertSame(0, DishRecipe::count());
        $r = $this->ugali([['up_to' => '', 'minutes' => ''], ['up_to' => 1, 'minutes' => 10]]);
        $this->assertSame(1, $r->times->count(), 'an empty row is left out');
    }

    public function test_times_go_with_the_recipe_and_a_dish_recipe_may_have_them_too(): void
    {
        $r = $this->ugali([['up_to' => 1, 'minutes' => 15]]);
        $this->svc()->deleteStandalone($r->id);
        $this->assertSame(0, DB::table('menus_recipe_times')->count());
        $dish = $this->dish('Cake');
        $d = $this->svc()->save($dish, ['yield_qty' => 12, 'made_to_order' => false, 'lines' => $this->lines(), 'times' => [['up_to' => 12, 'minutes' => 60], ['up_to' => 24, 'minutes' => 90]]]);
        $this->assertSame(90, app(\App\Services\Menus\RecipeTimes::class)->expected($d, 20));
        $this->svc()->delete($dish);
        $this->assertSame(0, DB::table('menus_recipe_times')->count());
    }

    public function test_the_page_returns_the_times(): void
    {
        $c = app(\App\Http\Controllers\Admin\MenusRecipesController::class);
        $body = ['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => $this->lines(), 'times' => [['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20]]];
        $this->assertSame(201, $c->saveBook(\Illuminate\Http\Request::create('/x', 'POST', $body))->getStatusCode());
        $page = $c->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertTrue($page['times_installed']);
        $this->assertSame([['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20]], array_map(fn ($t) => ['up_to' => (int) $t['up_to'], 'minutes' => $t['minutes']], $page['standalone'][0]['times']));
    }

    // ------------------------------------------------------------ before the scripts are run

    public function test_dish_recipes_keep_saving_and_the_page_loads_before_script_194_is_run(): void
    {
        \Illuminate\Support\Facades\Schema::drop('menus_recipes');
        $this->runSqlScripts('183_menus_recipes_own.sql');
        $dish = $this->dish('Pancakes');
        $this->svc()->save($dish, ['yield_qty' => 4, 'lines' => $this->lines()]);
        $this->assertSame(4.0, (float) DishRecipe::where('dish_id', $dish->id)->first()->yield_qty);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $this->lines()]), '194_menus_recipes_stand_alone');
        $page = app(\App\Http\Controllers\Admin\MenusRecipesController::class)->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertSame([[], false, false], [$page['standalone'], $page['own_installed'], $page['units_installed']]);
        $this->assertCount(1, array_filter($page['dishes'], fn ($d) => $d['recipe']), 'the dish recipe is still listed');
    }

    public function test_dish_recipes_keep_saving_before_script_195_is_run_and_a_unit_says_which_script(): void
    {
        \Illuminate\Support\Facades\Schema::table('menus_recipes', fn ($t) => $t->dropColumn('yield_unit_id'));
        $dish = $this->dish('Pancakes');
        $this->svc()->save($dish, ['yield_qty' => 3, 'lines' => $this->lines()]);
        $this->assertSame(3.0, (float) DishRecipe::where('dish_id', $dish->id)->first()->yield_qty);
        $this->svc()->saveStandalone(['name' => 'Base', 'lines' => $this->lines()]);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Ugali', 'yield_unit_id' => $this->kg, 'lines' => $this->lines()]), '195_menus_recipe_yield_unit');
        $page = app(\App\Http\Controllers\Admin\MenusRecipesController::class)->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertSame([true, false], [$page['own_installed'], $page['units_installed']]);
        $this->assertSame(['Base'], array_column($page['standalone'], 'name'));
    }

    // ------------------------------------------------------------ 1.4 recipes inside recipes

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function base(array $lines = null, float $yield = 2, string $name = 'Tomato base'): DishRecipe
    {
        return $this->svc()->saveStandalone(['name' => $name, 'yield_qty' => $yield, 'yield_unit_id' => $this->kg, 'lines' => $lines ?? [['ingredient_id' => $this->ing('Onions'), 'quantity' => 400], ['ingredient_id' => $this->ing('Tomatoes'), 'quantity' => 600]]]);
    }

    private function stew(DishRecipe $base, float $baseQty = 1, float $waste = 0, ?int $id = null): DishRecipe
    {
        $this->pantry('Beef');

        return $this->svc()->saveStandalone(['name' => 'Stew', 'yield_qty' => 4, 'lines' => [['recipe_id' => $base->id, 'quantity' => $baseQty, 'waste_pct' => $waste], ['ingredient_id' => $this->ing('Beef'), 'quantity' => 800]]], $id);
    }

    public function test_a_line_can_be_another_recipe_and_what_it_takes_is_worked_out_through_it(): void
    {
        $stew = $this->stew($this->base());
        $this->assertSame([null, $this->ing('Beef')], $stew->lines->pluck('ingredient_id')->map(fn ($i) => $i ? (int) $i : null)->all());
        $this->assertSame('base', $stew->lines[0]->unit);
        $use = app(\App\Services\Menus\IngredientUse::class);
        $need = fn ($recipe, $n) => array_map(fn ($r) => round($r['qty'], 3), $use->needs($recipe, $n));
        // 4 portions of stew take 1 kg of the base (a 2 kg batch is 400 g onions + 600 g tomatoes), so half a batch: 200 and 300
        $this->assertSame([$this->ing('Onions') => 200.0, $this->ing('Tomatoes') => 300.0, $this->ing('Beef') => 800.0], $need($stew, 4));
        $this->assertSame([$this->ing('Onions') => 100.0, $this->ing('Tomatoes') => 150.0, $this->ing('Beef') => 400.0], $need($stew, 2), 'two portions take half of everything');
    }

    public function test_waste_on_a_recipe_line_takes_more_of_it(): void
    {
        $stew = $this->stew($this->base(), 1, 20);
        $need = app(\App\Services\Menus\IngredientUse::class)->needs($stew, 4);
        $this->assertEqualsWithDelta(250.0, $need[$this->ing('Onions')]['qty'], 0.001, '1 kg of base with 20% lost is 1.25 kg: onions 250');
    }

    public function test_recipes_nest_and_an_ingredient_in_two_places_is_added_up(): void
    {
        $base = $this->base();
        $sauce = $this->svc()->saveStandalone(['name' => 'Sauce', 'yield_qty' => 1, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Onions'), 'quantity' => 100]]]);
        $stew = $this->svc()->saveStandalone(['name' => 'Stew', 'yield_qty' => 1, 'lines' => [['recipe_id' => $sauce->id, 'quantity' => 2]]]);
        $need = app(\App\Services\Menus\IngredientUse::class)->needs($stew, 1);
        $this->assertEqualsWithDelta(2 * (200 + 100), $need[$this->ing('Onions')]['qty'], 0.001);
        $this->assertEqualsWithDelta(2 * 300, $need[$this->ing('Tomatoes')]['qty'], 0.001);
    }

    public function test_a_circle_is_refused_whichever_way_round_it_is_closed(): void
    {
        $a = $this->base(null, 2, 'A');
        $b = $this->svc()->saveStandalone(['name' => 'B', 'lines' => [['recipe_id' => $a->id, 'quantity' => 1]]]);
        $c = $this->svc()->saveStandalone(['name' => 'C', 'lines' => [['recipe_id' => $b->id, 'quantity' => 1]]]);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'A', 'lines' => [['recipe_id' => $a->id, 'quantity' => 1]]], $a->id), 'circle');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'A', 'lines' => [['recipe_id' => $c->id, 'quantity' => 1]]], $a->id), 'already uses A');
        $this->assertCount(2, $a->fresh()->lines, 'the refused change left it alone');
    }

    public function test_only_a_switched_on_recipe_of_its_own_can_go_inside_another_and_only_once(): void
    {
        $dish = $this->dish('Pancakes', 100, [['Onions', 1]]);
        $dishRecipe = DishRecipe::where('dish_id', $dish->id)->first();
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'X', 'lines' => [['recipe_id' => $dishRecipe->id, 'quantity' => 1]]]), "dish's recipe");
        $off = $this->svc()->saveStandalone(['name' => 'Off', 'is_active' => false, 'lines' => $this->lines()]);
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'X', 'lines' => [['recipe_id' => $off->id, 'quantity' => 1]]]), 'switched off');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'X', 'lines' => [['recipe_id' => 99999, 'quantity' => 1]]]), 'choose a recipe');
        $base = $this->base();
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'X', 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['recipe_id' => $base->id, 'quantity' => 2]]]), 'listed twice');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'X', 'lines' => [['recipe_id' => $base->id, 'quantity' => 1, 'waste_pct' => 95]]]), 'between 0 and 90');
        $this->assertSame(0, DishRecipe::where('name', 'X')->count());
    }

    public function test_a_dishs_recipe_may_use_a_recipe_of_its_own(): void
    {
        $base = $this->base();
        $dish = $this->dish('Stew dish');
        $r = $this->svc()->save($dish, ['yield_qty' => 4, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Onions'), 'quantity' => 50]]]);
        $this->assertSame($base->id, (int) $r->lines[0]->sub_recipe_id);
        $this->assertEqualsWithDelta(250.0, app(\App\Services\Menus\IngredientUse::class)->needs($r, 4)[$this->ing('Onions')]['qty'], 0.001);
    }

    public function test_nesting_is_held_to_four_levels(): void
    {
        $prev = $this->base(null, 2, 'L0');
        foreach ([1, 2, 3, 4] as $i) {
            $prev = $this->svc()->saveStandalone(['name' => "L{$i}", 'lines' => [['recipe_id' => $prev->id, 'quantity' => 1]]]);
        }
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'L5', 'lines' => [['recipe_id' => $prev->id, 'quantity' => 1]]]), '4 levels');
    }

    public function test_a_recipe_that_is_used_can_not_be_removed_or_switched_off(): void
    {
        $base = $this->base();
        $this->stew($base);
        $this->fails(fn () => $this->svc()->deleteStandalone($base->id), 'used in Stew');
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Tomato base', 'is_active' => false, 'lines' => $this->lines()], $base->id), 'switching it off');
        $stew = DishRecipe::where('name', 'Stew')->first();
        $this->svc()->deleteStandalone($stew->id);
        $this->svc()->deleteStandalone($base->id);
        $this->assertSame(0, DishRecipe::count());
    }

    public function test_a_switched_off_recipe_stops_what_uses_it_being_made_with_a_clear_message(): void
    {
        $base = $this->base();
        $stew = $this->stew($base);
        DishRecipe::whereKey($base->id)->update(['is_active' => false]);
        $this->fails(fn () => app(\App\Services\Menus\IngredientUse::class)->needs($stew->fresh(), 4), 'switched off');
    }

    public function test_a_circle_in_old_data_stops_with_a_message_instead_of_running_forever(): void
    {
        $a = $this->base(null, 2, 'A');
        $b = $this->svc()->saveStandalone(['name' => 'B', 'lines' => [['recipe_id' => $a->id, 'quantity' => 1]]]);
        DB::table('menus_recipe_lines')->insert(['recipe_id' => $a->id, 'ingredient_id' => null, 'sub_recipe_id' => $b->id, 'quantity' => 1, 'unit' => 'base', 'waste_pct' => 0, 'position' => 9]);
        $this->fails(fn () => app(\App\Services\Menus\IngredientUse::class)->needs($a->fresh(), 1), 'round in a circle');
    }

    public function test_what_a_dish_contains_includes_the_ingredients_inside_its_recipes(): void
    {
        $this->makeIngredient('Flour', $this->g, null, [['name' => 'Flour']], 'preferred', ['allergens' => ['wheat']]);
        $dough = $this->svc()->saveStandalone(['name' => 'Dough', 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 500]]]);
        $dish = $this->dish('Bread roll');
        $this->svc()->save($dish, ['yield_qty' => 1, 'lines' => [['recipe_id' => $dough->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Onions'), 'quantity' => 5]]]);
        $this->assertSame(['wheat'], app(\App\Services\Menus\DishInfo::class)->profile($dish->fresh())['allergens']);
    }

    public function test_a_course_copy_names_the_recipes_it_uses(): void
    {
        $stew = $this->stew($this->base(), 1);
        $stew->update(['visibility' => 'public']);
        $body = app(RecipePublisher::class)->render($stew->fresh())['body'];
        $this->assertStringContainsString('- 1 Kilogram Tomato base', $body);
        $this->assertStringContainsString('800 Gram Beef', $body);
    }

    public function test_the_page_lists_recipe_lines_and_offers_recipes_to_use(): void
    {
        $base = $this->base();
        $c = app(\App\Http\Controllers\Admin\MenusRecipesController::class);
        $body = ['name' => 'Stew', 'yield_qty' => 4, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Onions'), 'quantity' => 5]]];
        $this->assertSame(201, $c->saveBook(\Illuminate\Http\Request::create('/x', 'POST', $body))->getStatusCode());
        $page = $c->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $stew = collect($page['standalone'])->firstWhere('name', 'Stew');
        $this->assertSame([$base->id, null], array_column($stew['lines'], 'recipe_id'));
        $this->assertSame(['Tomato base', 'Onions'], array_column($stew['lines'], 'name'));
        $this->assertSame('kg', $stew['lines'][0]['base_unit']);
        $this->assertSame(['Stew', 'Tomato base'], array_column($page['recipes'], 'name'), 'both can be used inside another');
        $this->assertTrue($page['sub_installed']);
    }

    public function test_before_script_197_a_recipe_line_says_which_script_and_ingredient_lines_still_save(): void
    {
        $base = $this->base();
        DB::statement('DROP TABLE menus_recipe_lines');
        Schema::create('menus_recipe_lines', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('ingredient_id'); $t->decimal('quantity', 18, 4); $t->string('unit', 4)->default('base'); $t->decimal('waste_pct', 5, 2)->default(0); $t->unsignedSmallInteger('position')->default(1); $t->timestamps(); });
        $this->fails(fn () => $this->svc()->saveStandalone(['name' => 'Stew', 'lines' => [['recipe_id' => $base->id, 'quantity' => 1]]]), '197_menus_recipes_in_recipes');
        $ok = $this->svc()->saveStandalone(['name' => 'Plain', 'lines' => $this->lines()]);
        $this->assertCount(2, $ok->lines);
        $page = app(\App\Http\Controllers\Admin\MenusRecipesController::class)->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertFalse($page['sub_installed']);
        $this->assertSame([], $page['recipes']);
    }

    public function test_script_197_text(): void
    {
        $sql = file_get_contents(base_path('database/sql/197_menus_recipes_in_recipes.sql'));
        $this->assertStringContainsString('ALTER TABLE menus_recipe_lines MODIFY ingredient_id BIGINT UNSIGNED NULL;', $sql);
        $this->assertStringContainsString('ADD COLUMN sub_recipe_id BIGINT UNSIGNED NULL', $sql);
    }
}
