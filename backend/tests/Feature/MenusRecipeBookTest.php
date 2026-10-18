<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Services\Books\BooksException;
use App\Services\Courses\RecipePublisher;
use App\Services\Menus\DishRecipes;
use Illuminate\Support\Facades\DB;
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
}
