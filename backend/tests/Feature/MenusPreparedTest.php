<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepLot;
use App\Models\Menus\PrepMove;
use App\Models\Menus\PrepRun;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\PrepProduction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus prepared food (script 198): a batch of a recipe of its own uses the ingredients really used, puts what came out on the shelf, books it to Prepared Food Inventory and can be undone. */
class MenusPreparedTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $prepared;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('198_menus_prepared_food.sql');
        $this->prepared = DB::table('ledgers')->insertGetId(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->default(0); $t->string('display_name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        $this->pantry('Maize flour', 10000, 0.1);
    }

    private function recipes(): DishRecipes
    {
        return app(DishRecipes::class);
    }

    private function prep(): PrepProduction
    {
        return app(PrepProduction::class);
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function flourLeft(): float
    {
        return (float) StockBatch::sum('qty_left');
    }

    /** Ugali: 2 kg a batch from 800 g of flour. */
    private function ugali(array $over = []): DishRecipe
    {
        return $this->recipes()->saveStandalone($over + ['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 800]],
            'times' => [['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20]]]);
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

    public function test_making_a_batch_uses_the_ingredients_shelves_what_came_out_and_books_it_to_prepared_food(): void
    {
        $r = $this->ugali();
        $run = $this->prep()->run($r, 1, 2.0, ['date' => '2026-10-17']);
        $this->assertSame('PB-000001', $run->number);
        $this->assertEqualsWithDelta(9200.0, $this->flourLeft(), 0.001, '800 g of the flour is used');
        $this->assertEqualsWithDelta(80.0, (float) $run->cost, 0.001);
        $lot = PrepLot::first();
        $this->assertSame([$r->id, 1, 2.0, 2.0, 40.0], [(int) $lot->recipe_id, (int) $lot->location_id, (float) $lot->qty_in, (float) $lot->qty_left, (float) $lot->unit_cost], 'a 2 kg lot at 40 a kg');
        $this->assertSame(['production', 2.0], [PrepMove::first()->kind, (float) PrepMove::first()->quantity]);
        $this->assertSame($lot->id, (int) $run->lot_id);
        $this->assertCount(1, $this->posted, 'one journal');
        $entries = collect($this->posted[0]['entries']);
        $this->assertEqualsWithDelta(80.0, $entries->where('ledger_id', $this->prepared)->where('side', 'D')->sum('amount'), 0.001, 'Dr Prepared Food Inventory');
        $this->assertEqualsWithDelta(80.0, $entries->where('ledger_id', $this->inventory)->where('side', 'C')->sum('amount'), 0.001, 'Cr Food Ingredients Inventory');
        $this->assertSame($this->posted[0]['date'], '2026-10-17');
        $this->assertNotNull(StockUse::where('ref_type', 'prep_run')->first()->journal_id, 'the journal is kept on the record of what was used');
    }

    public function test_what_was_really_used_and_what_really_came_out_are_what_is_kept(): void
    {
        $r = $this->ugali();
        $run = $this->prep()->run($r, 1, 2.0, ['output_qty' => 2.4, 'inputs' => [['ingredient_id' => $this->ing('Maize flour'), 'qty' => 900]]]);
        $this->assertEqualsWithDelta(9100.0, $this->flourLeft(), 0.001, '900 g went in');
        $this->assertEqualsWithDelta(90.0, (float) $run->cost, 0.001);
        $this->assertEqualsWithDelta(37.5, (float) $run->unit_cost, 0.0001, '90 over 2.4 kg');
        $this->assertEqualsWithDelta(2.4, (float) PrepLot::first()->qty_left, 0.0001);
        $in = $run->inputs->first();
        $this->assertSame([800.0, 900.0, 90.0], [(float) $in->expected_qty, (float) $in->used_qty, (float) $in->cost], 'the difference from the recipe is kept');
        $this->assertSame([2.0, 2.4], [(float) $run->planned_qty, (float) $run->qty]);
    }

    public function test_a_batch_size_in_another_unit_is_converted_and_the_time_is_from_the_recipe(): void
    {
        $r = $this->ugali();
        $run = $this->prep()->run($r, 1, 1500, ['unit_id' => $this->g, 'started_at' => '2026-10-17 08:00', 'finished_at' => '2026-10-17 08:25', 'note' => 'Lunch rush']);
        $this->assertSame(1.5, (float) $run->planned_qty);
        $this->assertEqualsWithDelta(600.0, 10000 - $this->flourLeft(), 0.001, '1.5 kg is three quarters of a batch: 600 g');
        $this->assertSame([20, 25], [$run->expected_minutes, $run->actualMinutes()], 'expected 20 (up to 2 kg), took 25');
        $this->assertSame($this->kg, (int) $run->unit_id);
        $this->fails(fn () => $this->prep()->run($r, 1, 3, ['unit_id' => $this->each]), 'measures the same');
    }

    public function test_the_checks_and_that_a_refused_batch_leaves_nothing_behind(): void
    {
        $r = $this->ugali();
        $dish = $this->dish('Pancakes', 100, [['Maize flour', 10]]);
        $inactive = $this->recipes()->saveStandalone(['name' => 'Off', 'is_active' => false, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 1]]]);
        DB::table('menus_chefs')->insert(['id' => 5, 'display_name' => 'Chef Off', 'is_active' => false]);
        $this->fails(fn () => $this->prep()->run(DishRecipe::where('dish_id', $dish->id)->first(), 1, 1), "dish's recipe");
        $this->fails(fn () => $this->prep()->run($inactive, 1, 1), 'switched off');
        $this->fails(fn () => $this->prep()->run($r, 99, 1), 'Choose the branch');
        $this->fails(fn () => $this->prep()->run($r, 1, 0), 'how big the batch is');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['output_qty' => 0]), 'how much came out');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['chef_id' => 5]), 'chef who is on the kitchen list');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['started_at' => '2026-10-17 09:00', 'finished_at' => '2026-10-17 08:00']), 'finished before it started');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['date' => '2026-10-17', 'expiry_date' => '2026-10-16']), 'use-by date is before');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['inputs' => [['ingredient_id' => 9999, 'qty' => 1]]]), 'not in this recipe');
        $this->fails(fn () => $this->prep()->run($r, 1, 1, ['inputs' => [['ingredient_id' => $this->ing('Maize flour'), 'qty' => -1]]]), 'less than nothing');
        $this->assertSame([0, 0, 0, 0], [PrepRun::count(), PrepLot::count(), StockMove::where('kind', 'use')->count(), count($this->posted)]);
        $this->assertEqualsWithDelta(10000.0, $this->flourLeft(), 0.001);
    }

    public function test_not_enough_on_the_shelf_refuses_the_whole_batch(): void
    {
        $r = $this->recipes()->saveStandalone(['name' => 'Big', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 20000]]]);
        try {
            $this->prep()->run($r, 1, 1);
            $this->fail('expected a shortage');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Maize flour', $e->getMessage());
        }
        $this->assertSame([0, 0, 0, 0], [PrepRun::count(), PrepLot::count(), StockUse::count(), count($this->posted)]);
        $this->assertEqualsWithDelta(10000.0, $this->flourLeft(), 0.001);
    }

    public function test_pressing_twice_with_the_same_key_makes_one_batch(): void
    {
        $r = $this->ugali();
        $a = $this->prep()->run($r, 1, 2.0, ['client_key' => 'press-1']);
        $b = $this->prep()->run($r, 1, 2.0, ['client_key' => 'press-1']);
        $this->assertSame($a->id, $b->id);
        $this->assertSame(1, PrepRun::count());
        $this->assertEqualsWithDelta(9200.0, $this->flourLeft(), 0.001, 'the ingredients were used once');
        $this->prep()->run($r, 1, 2.0, ['client_key' => 'press-2']);
        $this->assertSame(2, PrepRun::count());
    }

    public function test_a_batch_can_be_undone_while_all_of_it_is_there(): void
    {
        $r = $this->ugali();
        $run = $this->prep()->run($r, 1, 2.0);
        $this->prep()->cancel($run, null, 'Wrong recipe');
        $this->assertEqualsWithDelta(10000.0, $this->flourLeft(), 0.001, 'the ingredients are back');
        $this->assertSame(0.0, (float) PrepLot::first()->qty_left);
        $this->assertSame(['production', 'production_reversal'], PrepMove::orderBy('id')->pluck('kind')->all());
        $this->assertSame('cancelled', $run->fresh()->status);
        $this->assertCount(1, $this->cancelled, 'the journal is cancelled');
        $this->fails(fn () => $this->prep()->cancel($run->fresh()), 'already cancelled');
    }

    public function test_a_batch_that_has_been_used_can_not_be_undone_and_its_recipe_is_held(): void
    {
        $r = $this->ugali();
        $run = $this->prep()->run($r, 1, 2.0);
        PrepLot::whereKey($run->lot_id)->update(['qty_left' => 1.5]);
        $this->fails(fn () => $this->prep()->cancel($run), 'already been used');
        $this->assertSame('posted', $run->fresh()->status);
        $this->fails(fn () => $this->recipes()->deleteStandalone($r->id), 'made in a batch');
        $this->fails(fn () => $this->recipes()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->g, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 800]]], $r->id), 'unit it is counted in can not change');
        $same = $this->recipes()->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 700]]], $r->id);
        $this->assertSame(700.0, (float) $same->lines[0]->quantity, 'the amounts can still be changed');
    }

    public function test_a_batch_of_a_recipe_that_uses_another_recipe_uses_the_ingredients_inside_it(): void
    {
        $this->pantry('Beef', 5000, 0.5);
        $base = $this->ugali();
        $stew = $this->recipes()->saveStandalone(['name' => 'Stew', 'yield_qty' => 4, 'lines' => [['recipe_id' => $base->id, 'quantity' => 1], ['ingredient_id' => $this->ing('Beef'), 'quantity' => 800]]]);
        $run = $this->prep()->run($stew, 1, 4);
        $this->assertEqualsWithDelta(400.0, 10000 - (float) StockBatch::where('item_id', $this->itemId('Maize flour'))->sum('qty_left'), 0.001, '1 kg of ugali is half a batch: 400 g of flour');
        $this->assertEqualsWithDelta(800.0, 5000 - (float) StockBatch::where('item_id', $this->itemId('Beef'))->sum('qty_left'), 0.001);
        $this->assertEqualsWithDelta(40 + 400, (float) $run->cost, 0.001);
        $this->assertCount(2, $run->inputs);
    }

    public function test_the_preview_says_what_a_batch_would_take_cost_and_last(): void
    {
        $r = $this->ugali();
        $p = $this->prep()->preview($r, 1, 1.5);
        $this->assertSame([1.5, 'kg', 20, false], [$p['planned'], $p['unit'], $p['expected_minutes'], $p['short']]);
        $this->assertSame(['Maize flour', 600.0, 10000.0, 0.0], [$p['inputs'][0]['name'], $p['inputs'][0]['expected'], $p['inputs'][0]['on_hand'], $p['inputs'][0]['short']]);
        $this->assertEqualsWithDelta(60.0, $p['cost'], 0.001);
        $big = $this->prep()->preview($r, 1, 40);
        $this->assertTrue($big['short']);
        $this->assertGreaterThan(0, $big['inputs'][0]['short']);
        $this->assertNull($big['expected_minutes'], 'bigger than every time row');
    }

    public function test_the_page_lists_recipes_with_what_is_on_the_shelf_and_the_batches_made(): void
    {
        DB::table('menus_chefs')->insert(['id' => 1, 'display_name' => 'Chef Wanjiru']);
        $r = $this->ugali();
        $this->recipes()->saveStandalone(['name' => 'Sauce', 'lines' => [['ingredient_id' => $this->ing('Maize flour'), 'quantity' => 1]]]);
        $this->dish('Pancakes', 100, [['Maize flour', 5]]);
        $this->prep()->run($r, 1, 2.0, ['chef_id' => 1, 'started_at' => '2026-10-17 08:00', 'finished_at' => '2026-10-17 08:30']);
        $c = app(\App\Http\Controllers\Admin\MenusPreparedController::class);
        $page = $c->index(Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertTrue($page['ready']);
        $this->assertSame(['Sauce', 'Ugali'], array_column($page['recipes'], 'name'), 'recipes of their own only');
        $ugali = collect($page['recipes'])->firstWhere('name', 'Ugali');
        $this->assertSame([2.0, 80.0, 1], [(float) $ugali['on_shelf'], (float) $ugali['value'], count($ugali['lots'])]);
        $run = $page['runs'][0];
        $this->assertSame(['PB-000001', 'Ugali', 'Chef Wanjiru', 'kg', 20, 30, true], [$run['number'], $run['recipe'], $run['chef'], $run['unit'], $run['expected_minutes'], $run['actual_minutes'], $run['can_cancel']]);
        $this->assertSame([['id' => 1, 'name' => 'Chef Wanjiru']], $page['chefs']);

        $res = $c->run(Request::create('/x', 'POST', ['recipe_id' => $r->id, 'location_id' => 1, 'qty' => 2]));
        $this->assertSame(201, $res->getStatusCode());
        $this->assertSame(422, $c->run(Request::create('/x', 'POST', ['recipe_id' => $r->id, 'location_id' => 1, 'qty' => 2, 'chef_id' => 99]))->getStatusCode());
        $this->assertSame(200, $c->cancel(Request::create('/x', 'POST'), (int) $res->getData(true)['id'])->getStatusCode());
        $pre = $c->preview(Request::create('/x', 'GET', ['recipe_id' => $r->id, 'location_id' => 1, 'qty' => 1]))->getData(true);
        $this->assertSame(15, $pre['expected_minutes']);
    }

    public function test_before_script_198_the_page_says_it_is_not_ready(): void
    {
        foreach (['menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves'] as $t) {
            Schema::drop($t);
        }
        $page = app(\App\Http\Controllers\Admin\MenusPreparedController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $this->assertFalse($page['ready']);
        $this->fails(fn () => $this->prep()->run($this->ugali(), 1, 1), '198_menus_prepared_food');
    }
}
