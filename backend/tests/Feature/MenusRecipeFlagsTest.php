<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishRecipeLine;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\SidesFromDishes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus modifiers, build step 4.1 (script 205): a recipe line may say it can be left out or have extra, but only an ingredient line of a recipe made to order. */
class MenusRecipeFlagsTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '201_menus_sides_from_dishes.sql');
        $this->pantry('Flour', 1000, 0.1);
        $this->pantry('Cheese', 1000, 0.5);
        $this->pantry('Onion', 1000, 0.2);
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

    private function lines(array $flags = []): array
    {
        return [['ingredient_id' => $this->ing('Flour'), 'quantity' => 100], ['ingredient_id' => $this->ing('Cheese'), 'quantity' => 20] + $flags, ['ingredient_id' => $this->ing('Onion'), 'quantity' => 10, 'removable' => true]];
    }

    public function test_a_line_of_a_recipe_made_to_order_can_be_removable_and_have_extra_and_it_is_kept(): void
    {
        $d = $this->dish('Burger');
        $r = app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => $this->lines(['extra_allowed' => true, 'removable' => true])]);
        $this->assertSame([[false, false], [true, true], [true, false]], $r->lines->map(fn ($l) => [(bool) $l->removable, (bool) $l->extra_allowed])->all());
        $again = app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => $this->lines()]);
        $this->assertSame([[false, false], [false, false], [true, false]], $again->lines->map(fn ($l) => [(bool) $l->removable, (bool) $l->extra_allowed])->all(), 'the flags are what was last saved');
    }

    public function test_a_recipe_made_ahead_cannot_have_a_line_that_may_be_removed(): void
    {
        $d = $this->dish('Stew');
        $this->fails(fn () => app(DishRecipes::class)->save($d, ['made_to_order' => false, 'yield_qty' => 1, 'lines' => $this->lines()]), 'made ahead in batches cannot lose an ingredient');
        $this->assertSame(0, DishRecipeLine::count(), 'nothing was saved');
        $ok = app(DishRecipes::class)->save($d, ['made_to_order' => false, 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 100]]]);
        $this->assertFalse((bool) $ok->lines->first()->removable);
    }

    public function test_a_recipe_inside_a_recipe_cannot_be_flagged(): void
    {
        $base = app(DishRecipes::class)->saveStandalone(['name' => 'Base', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 10]]]);
        $this->fails(fn () => app(DishRecipes::class)->saveStandalone(['name' => 'Stew', 'yield_qty' => 1, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1, 'removable' => true]]]), 'taken as a whole');
        $ok = app(DishRecipes::class)->saveStandalone(['name' => 'Stew', 'yield_qty' => 1, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Onion'), 'quantity' => 5, 'removable' => true]]]);
        $this->assertSame([false, true], $ok->lines->map(fn ($l) => (bool) $l->removable)->all());
    }

    public function test_the_flags_are_copied_when_a_side_is_made_from_a_dish(): void
    {
        $d = $this->dish('Burger');
        app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => $this->lines(['extra_allowed' => true])]);
        app(SidesFromDishes::class)->run();
        $copy = DishRecipe::findOrFail(Side::where('from_dish_id', $d->id)->value('recipe_id'));
        $this->assertSame([[false, false], [false, true], [true, false]], $copy->lines()->orderBy('position')->get()->map(fn ($l) => [(bool) $l->removable, (bool) $l->extra_allowed])->all());
    }

    public function test_before_script_205_a_flag_says_which_script_and_a_recipe_without_flags_still_saves(): void
    {
        Schema::table('menus_recipe_lines', function ($t) { $t->dropColumn(['removable', 'extra_allowed']); });
        $d = $this->dish('Burger');
        $this->assertFalse(DishRecipes::hasFlags());
        $this->fails(fn () => app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => $this->lines()]), '205_menus_recipe_line_flags');
        $r = app(DishRecipes::class)->save($d, ['yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Flour'), 'quantity' => 100]]]);
        $this->assertCount(1, $r->lines);
    }
}
