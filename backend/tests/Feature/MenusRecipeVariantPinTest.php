<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusRecipesController;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientUse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Script 225: a recipe line may name the variant it takes. Left empty it follows the ingredient's pick rule as before; named, that variant is taken first and the rule covers what is short. */
class MenusRecipeVariantPinTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('225_menus_recipe_line_variant.sql');
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Pembe'], ['name' => 'Exe'], ['name' => 'Soko', 'allowed' => false]], 'preferred');
        $this->shelve('Pembe', 1000, 0.10);
        $this->shelve('Exe', 5000, 0.13);
        $this->shelve('Soko', 500, 0.05);
    }

    private function item(string $name): int
    {
        return $this->itemId($name);
    }

    private function recipe(?int $item, float $grams = 600): DishRecipe
    {
        $dish = \App\Models\Menus\Dish::create(['name' => 'Bread '.uniqid(), 'slug' => 'b'.uniqid(), 'price' => 100, 'is_active' => true]);

        return app(DishRecipes::class)->save($dish, ['yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Wheat flour')->value('id'), 'quantity' => $grams, 'item_id' => $item]]]);
    }

    private function left(): array
    {
        return StockBatch::orderBy('id')->pluck('qty_left')->map(fn ($q) => (float) $q)->all();
    }

    public function test_a_line_on_automatic_follows_the_pick_rule_and_the_pick_is_shown(): void
    {
        $r = $this->recipe(null);
        app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 1], null);
        $this->assertSame([400.0, 5000.0, 500.0], $this->left(), 'Pembe is first in order');
        $this->assertNull($r->lines->first()->item_id);
        $ing = \App\Models\Menus\Ingredient::first();
        $this->assertSame('Pembe', app(IngredientUse::class)->variantNow($ing, 1)['name'], 'what a line on automatic takes now');
    }

    public function test_a_named_variant_is_taken_instead_of_the_one_the_rule_would_pick(): void
    {
        $r = $this->recipe($this->item('Exe'));
        $use = app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 2], null);
        $this->assertSame([1000.0, 4400.0, 500.0], $this->left());
        $this->assertEquals(600 * 0.13, $use['cost'], 'costed at the variant it came from');
        $this->assertEqualsWithDelta(78.0, app(IngredientUse::class)->cost($r, 1)['per_portion'], 0.001, 'and the recipe screen says the same, though the shelf average is lower');
    }

    public function test_a_named_variant_that_runs_short_is_topped_up_by_the_rule(): void
    {
        $r = $this->recipe($this->item('Exe'), 6000);
        $use = app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 3], null);
        $this->assertSame([0.0, 0.0, 500.0], $this->left(), 'all 5,000 g of Exe, then Pembe for the last 1,000 g');
        $this->assertEquals(5000 * 0.13 + 1000 * 0.10, $use['cost']);
    }

    public function test_a_variant_named_inside_a_recipe_used_by_another_still_reaches_the_shelf_and_a_line_on_automatic_carries_none(): void
    {
        $flour = (int) DB::table('menus_ingredients')->where('name', 'Wheat flour')->value('id');
        $inner = app(DishRecipes::class)->saveStandalone(['name' => 'Dough', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $flour, 'quantity' => 300, 'item_id' => $this->item('Exe')]]]);
        $outer = app(DishRecipes::class)->saveStandalone(['name' => 'Loaf', 'yield_qty' => 1, 'lines' => [['recipe_id' => $inner->id, 'quantity' => 1], ['ingredient_id' => $flour, 'quantity' => 200]]]);
        $row = array_values(app(IngredientUse::class)->needs($outer, 1))[0];
        $this->assertSame([500.0, [$this->item('Exe') => 300.0]], [$row['qty'], $row['pins']], '300 g asked from Exe, 200 g left to the rule');
        app(IngredientUse::class)->consume($outer, 1, 1, ['type' => 'voucher', 'id' => 4], null);
        $this->assertSame([800.0, 4700.0, 500.0], $this->left(), 'Exe 300 g as named, Pembe 200 g as the rule says');
        $plain = array_values(app(IngredientUse::class)->needs($this->recipe(null), 1))[0];
        $this->assertArrayNotHasKey('pins', $plain);
    }

    public function test_a_variant_that_may_not_be_used_or_belongs_to_another_ingredient_is_refused(): void
    {
        try {
            $this->recipe($this->item('Soko'));
            $this->fail('saved');
        } catch (BooksException $e) {
            $this->assertStringContainsString('may not be used', $e->getMessage());
        }
        $this->makeIngredient('Sugar', $this->g, $this->kg, [['name' => 'Kabras']]);
        try {
            $this->recipe($this->item('Kabras'));
            $this->fail('saved');
        } catch (BooksException $e) {
            $this->assertStringContainsString('not a variant of Wheat flour', $e->getMessage());
        }
    }

    public function test_the_recipes_door_shows_the_variants_with_what_is_left_the_rule_and_what_automatic_takes_now(): void
    {
        $r = $this->recipe($this->item('Exe'));
        $c = app(MenusRecipesController::class);
        $out = $c->index(Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $flour = collect($out['ingredients'])->firstWhere('name', 'Wheat flour');
        $this->assertTrue($out['pins_installed']);
        $this->assertSame(['preferred', 'the preferred one first', 'Pembe'], [$flour['pick_rule'], $flour['pick_label'], $flour['auto']['name']]);
        $this->assertEquals([['Pembe', 1000], ['Exe', 5000]], array_map(fn ($v) => [$v['name'], $v['left']], $flour['variants']), 'Soko may not be used, so it is not offered');
        $this->assertSame($this->item('Exe'), $out['dishes'][0]['recipe']['lines'][0]['item_id']);
        $this->assertSame('Exe', $out['dishes'][0]['recipe']['lines'][0]['variant'], 'the kitchen card names the variant a line takes');
        $this->assertNotNull($r);
    }
}
