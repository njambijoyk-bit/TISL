<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\Side;
use App\Models\Menus\SideAmount;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\Ingredients;
use App\Services\Menus\Sides;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus sides (script 200): what is served, what it is made from, and how much of it goes in each serving size. */
class MenusSidesTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $jumbo;
    private int $kids;
    private DishRecipe $ugali;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql');
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $this->kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 2, 'is_active' => true]);
        $this->pantry('Maize flour', 10000, 0.1);
        $this->ugali = app(DishRecipes::class)->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 800]]]);
    }

    private function sides(): Sides
    {
        return app(Sides::class);
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function soda(): int
    {
        return $this->makeIngredient('Coke', $this->each, null, [['name' => 'Coke 500ml']], 'preferred', ['kind_id' => (int) IngredientKind::where('code', 'ready_to_serve')->value('id')])->id;
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

    private function ugaliSide(array $over = []): Side
    {
        return $this->sides()->save($over + ['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'unit_id' => $this->g, 'base_amount' => 250,
            'amounts' => [['serving_id' => $this->jumbo, 'amount' => 350], ['serving_id' => $this->kids, 'amount' => 100]]]);
    }

    public function test_a_side_made_from_a_recipe_keeps_its_amount_for_each_serving_size(): void
    {
        $s = $this->ugaliSide(['note' => 'Hot, from the pot']);
        $row = $this->sides()->row($s);
        $this->assertSame(['Ugali', 'recipe', 'Ugali', 'g', 'kg', 250.0], [$row['name'], $row['kind'], $row['made_from'], $row['unit'], $row['source_unit'], $row['base_amount']]);
        $this->assertSame([['serving_id' => $this->jumbo, 'serving' => 'Jumbo', 'amount' => 350.0], ['serving_id' => $this->kids, 'serving' => 'Kids', 'amount' => 100.0]], $row['amounts']);
        $this->assertSame('Hot, from the pot', $row['note']);
    }

    public function test_the_amount_for_a_serving_is_in_the_recipes_own_unit_and_a_size_without_one_gets_the_sides(): void
    {
        $s = $this->ugaliSide(['amounts' => [['serving_id' => $this->jumbo, 'amount' => 350]]]);
        $this->assertEqualsWithDelta(0.35, $this->sides()->amountFor($s, $this->jumbo), 0.000001, '350 g is 0.35 kg');
        $this->assertEqualsWithDelta(0.25, $this->sides()->amountFor($s, $this->kids), 0.000001, 'Kids has none of its own: the side amount, 250 g');
        $this->assertEqualsWithDelta(0.25, $this->sides()->amountFor($s), 0.000001, 'no size named: the side amount');
    }

    public function test_a_ready_to_serve_ingredient_is_a_side_and_a_soda_is_one_of_it(): void
    {
        $soda = $this->sides()->save(['name' => 'Coke', 'ingredient_id' => $this->soda()]);
        $row = $this->sides()->row($soda);
        $this->assertSame(['ready', 'Coke', 'each', 1.0, []], [$row['kind'], $row['made_from'], $row['unit'], $row['base_amount'], $row['amounts']], 'with no amounts it is 1');
        $this->assertSame(1.0, $this->sides()->amountFor($soda, $this->jumbo));
        $this->pantry('Salt');
        $this->fails(fn () => $this->sides()->save(['name' => 'Salt side', 'ingredient_id' => $this->ing('Salt')]), 'is not sold as it is');
    }

    public function test_a_side_is_made_from_exactly_one_thing_of_the_right_kind(): void
    {
        $dish = $this->dish('Pancakes', 100, [['Maize flour', 5]]);
        $inactive = app(DishRecipes::class)->saveStandalone(['name' => 'Off', 'is_active' => false, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 1]]]);
        $this->fails(fn () => $this->sides()->save(['name' => 'X']), 'choose one of the two');
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'recipe_id' => $this->ugali->id, 'ingredient_id' => $this->soda()]), 'choose one of the two');
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'recipe_id' => DishRecipe::where('dish_id', $dish->id)->value('id')]), "dish's recipe");
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'recipe_id' => $inactive->id]), 'switched off');
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'recipe_id' => 99999]), 'Choose the recipe');
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'ingredient_id' => 99999]), 'Choose the ingredient');
        $this->assertSame(0, Side::count());
    }

    public function test_the_unit_must_measure_the_same_thing_as_the_source(): void
    {
        $portions = app(DishRecipes::class)->saveStandalone(['name' => 'Stew', 'yield_qty' => 4, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 100]]]);
        $off = DB::table('units_of_measure')->insertGetId(['code' => 'oz', 'name' => 'Ounce', 'dimension' => 'mass', 'to_base_factor' => 28, 'is_active' => false]);
        $this->fails(fn () => $this->ugaliSide(['unit_id' => $this->l]), 'measures the same');
        $this->fails(fn () => $this->ugaliSide(['unit_id' => $off]), 'not available');
        $this->fails(fn () => $this->sides()->save(['name' => 'Stew', 'recipe_id' => $portions->id, 'unit_id' => $this->g]), 'counted in portions');
        $this->assertSame(0, Side::count());
        $this->assertSame($this->kg, (int) $this->sides()->save(['name' => 'Ugali kg', 'recipe_id' => $this->ugali->id, 'unit_id' => $this->kg])->unit_id, 'the recipe\'s own unit is allowed');
    }

    public function test_the_amounts_are_checked_and_an_empty_one_is_left_out(): void
    {
        $this->fails(fn () => $this->ugaliSide(['base_amount' => 0]), 'more than nothing');
        $this->fails(fn () => $this->ugaliSide(['amounts' => [['serving_id' => 999, 'amount' => 5]]]), 'servings on your list');
        $this->fails(fn () => $this->ugaliSide(['amounts' => [['serving_id' => $this->jumbo, 'amount' => 0]]]), 'more than nothing');
        $this->fails(fn () => $this->ugaliSide(['amounts' => [['serving_id' => $this->jumbo, 'amount' => 5], ['serving_id' => $this->jumbo, 'amount' => 6]]]), 'listed twice');
        $this->assertSame(0, Side::count());
        $s = $this->ugaliSide(['amounts' => [['serving_id' => $this->jumbo, 'amount' => ''], ['serving_id' => $this->kids, 'amount' => 100]]]);
        $this->assertSame([$this->kids], $s->amounts->pluck('serving_id')->map(fn ($i) => (int) $i)->all());
    }

    public function test_names_are_unique_stations_must_be_on_and_saving_again_replaces_the_amounts(): void
    {
        $s = $this->ugaliSide();
        $this->fails(fn () => $this->ugaliSide(['name' => ' ugali ']), 'already a side called');
        $this->fails(fn () => $this->sides()->save(['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'name' => '  '], $s->id), 'Give the side a name');
        $off = DB::table('menus_stations')->insertGetId(['name' => 'Old grill', 'is_active' => false]);
        $on = DB::table('menus_stations')->insertGetId(['name' => 'Grill', 'is_active' => true]);
        $this->fails(fn () => $this->ugaliSide(['name' => 'Rice', 'station_id' => $off]), 'switched on');
        $again = $this->sides()->save(['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'base_amount' => 300, 'station_id' => $on, 'amounts' => [['serving_id' => $this->jumbo, 'amount' => 400]]], $s->id);
        $this->assertSame($s->id, $again->id);
        $this->assertSame([[400.0]], [$again->amounts->map(fn ($a) => (float) $a->amount)->all()]);
        $this->assertSame('Grill', $this->sides()->row($again)['station']);
        $kept = $this->sides()->save(['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'base_amount' => 300], $s->id);
        $this->assertCount(1, $kept->amounts, 'a save with no amounts in it leaves them alone');
        $cleared = $this->sides()->save(['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'base_amount' => 300, 'amounts' => []], $s->id);
        $this->assertCount(0, $cleared->amounts, 'an empty list clears them');
    }

    public function test_removing_a_side_takes_its_amounts(): void
    {
        $s = $this->ugaliSide();
        $this->sides()->delete($s->id);
        $this->assertSame([0, 0], [Side::count(), SideAmount::count()]);
    }

    public function test_what_a_side_is_made_from_can_not_be_removed_switched_off_or_changed_under_it(): void
    {
        $this->ugaliSide();
        $soda = $this->soda();
        $this->sides()->save(['name' => 'Coke', 'ingredient_id' => $soda]);
        $svc = app(DishRecipes::class);
        $this->fails(fn () => $svc->deleteStandalone($this->ugali->id), 'recipe of the side Ugali');
        $this->fails(fn () => $svc->saveStandalone(['name' => 'Ugali', 'is_active' => false, 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 800]]], $this->ugali->id), 'Switch the side off');
        $this->fails(fn () => $svc->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => null, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 800]]], $this->ugali->id), 'change the side first');
        $same = $svc->saveStandalone(['name' => 'Ugali', 'yield_qty' => 3, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 900]]], $this->ugali->id);
        $this->assertSame(3.0, (float) $same->yield_qty, 'the amounts of the recipe can still change');
        $this->fails(fn () => app(Ingredients::class)->delete(\App\Models\Menus\Ingredient::findOrFail($soda)), 'is the side Coke');
        $cooking = (int) IngredientKind::where('code', 'cooking')->value('id');
        $this->fails(fn () => app(Ingredients::class)->save(['name' => 'Coke', 'base_unit_id' => $this->each, 'kind_id' => $cooking, 'variants' => [['name' => 'Coke 500ml']]], $soda), 'not sold as it is');
    }

    public function test_the_page_offers_what_a_side_can_be_made_from_and_saves_and_removes(): void
    {
        $this->soda();
        $this->pantry('Salt');
        $c = app(\App\Http\Controllers\Admin\MenusSidesController::class);
        $page = $c->index()->getData(true);
        $this->assertTrue($page['ready']);
        $this->assertSame(['Ugali'], array_column($page['recipes'], 'name'));
        $this->assertSame(['Coke'], array_column($page['ingredients'], 'name'), 'only what is sold as it is');
        $this->assertSame(['Jumbo', 'Kids'], array_column($page['servings'], 'name'));
        $this->assertContains('g', array_column($page['units'], 'code'));
        $body = ['name' => 'Ugali', 'recipe_id' => $this->ugali->id, 'unit_id' => $this->g, 'base_amount' => 250, 'amounts' => [['serving_id' => $this->jumbo, 'amount' => 350]]];
        $res = $c->save(Request::create('/x', 'POST', $body));
        $this->assertSame(201, $res->getStatusCode());
        $id = $res->getData(true)['side']['id'];
        $this->assertSame(200, $c->save(Request::create('/x', 'PUT', ['base_amount' => 260] + $body), $id)->getStatusCode());
        $this->assertSame(422, $c->save(Request::create('/x', 'POST', $body))->getStatusCode(), 'the same name twice');
        $page = $c->index()->getData(true);
        $this->assertSame([260.0, 'Ugali'], [(float) $page['sides'][0]['base_amount'], $page['sides'][0]['made_from']]);
        $this->assertSame(200, $c->destroy($id)->getStatusCode());
        $this->assertSame([], $c->index()->getData(true)['sides']);
    }

    public function test_before_script_200_the_page_says_it_is_not_ready(): void
    {
        Schema::drop('menus_sides');
        Schema::drop('menus_side_amounts');
        $this->assertFalse(app(\App\Http\Controllers\Admin\MenusSidesController::class)->index()->getData(true)['ready']);
        $this->fails(fn () => $this->sides()->save(['name' => 'X', 'recipe_id' => $this->ugali->id]), '200_menus_sides');
        app(DishRecipes::class)->deleteStandalone($this->ugali->id);   // nothing can use it, so it can go
        $this->assertSame(0, DishRecipe::count());
    }
}
