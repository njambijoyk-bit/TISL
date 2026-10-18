<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepLot;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\PrepCounts;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\PrepReports;
use App\Services\Menus\WasteService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** Menus prepared food reports: the daily reconciliation of each prepared item and the comparison of chefs. They are read from the batches and movements, nothing is stored. */
class MenusPreparedReportsTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql');
        DB::table('ledgers')->insert(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->default(0); $t->string('display_name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        $this->pantry('Maize flour', 100000, 0.1);
    }

    private function recipe(string $name = 'Ugali'): DishRecipe
    {
        return app(DishRecipes::class)->saveStandalone(['name' => $name, 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id'), 'quantity' => 800]],
            'times' => [['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20]]]);
    }

    private function make(DishRecipe $r, float $planned, array $o = [])
    {
        return app(PrepProduction::class)->run($r, 1, $planned, $o);
    }

    private function reports(): PrepReports
    {
        return app(PrepReports::class);
    }

    private function row(array $rows, string $name): array
    {
        return collect($rows)->firstWhere(fn ($r) => ($r['name'] ?? $r['recipe']) === $name) ?? $this->fail("No row for {$name}");
    }

    // ------------------------------------------------------------ reconciliation

    private function week(): DishRecipe
    {
        $r = $this->recipe();
        $this->make($r, 2.0, ['date' => '2026-10-14']);
        $this->make($r, 2.0, ['date' => '2026-10-15']);
        app(WasteService::class)->record(['recipe_id' => $r->id, 'location_id' => 1, 'quantity' => 0.5, 'kind' => 'spoilage', 'date' => '2026-10-15']);
        app(PrepCounts::class)->record(1, [['recipe_id' => $r->id, 'counted' => 3.0]], ['date' => '2026-10-16']);   // 3.5 expected: 0.5 short
        $this->make($r, 2.0, ['date' => '2026-10-16']);

        return $r;
    }

    public function test_the_reconciliation_adds_up_opening_made_waste_and_count_to_what_is_left(): void
    {
        $this->week();
        $row = $this->row($this->reports()->reconcile(1, '2026-10-15', '2026-10-16')['rows'], 'Ugali');
        $this->assertSame(['kg', 2.0, 4.0, 0.0, 0.5, -0.5, 5.0], [$row['unit'], $row['opening'], $row['made'], $row['served'], $row['waste'], $row['count'], $row['closing']], '2 + 4 - 0.5 - 0.5 = 5');
        $this->assertEqualsWithDelta(160.0, $row['made_value'], 0.001);
        $this->assertEqualsWithDelta(20.0, $row['waste_value'], 0.001, 'what was thrown away cost 20');
        $this->assertEqualsWithDelta(-20.0, $row['count_value'], 0.001, 'what the count lost was worth 20');
        $this->assertNull($row['shelf_now'], 'a past range is not compared with today');
    }

    public function test_one_day_shows_only_that_days_movement_and_a_quiet_recipe_is_left_out(): void
    {
        $this->week();
        $this->recipe('Sauce');   // never made
        $day = $this->reports()->reconcile(1, '2026-10-15', '2026-10-15')['rows'];
        $this->assertSame(['Ugali'], array_column($day, 'name'));
        $this->assertSame([2.0, 2.0, 0.5, 0.0, 3.5], [$day[0]['opening'], $day[0]['made'], $day[0]['waste'], $day[0]['count'], $day[0]['closing']]);
        $quiet = $this->reports()->reconcile(1, '2026-10-20', '2026-10-20')['rows'];
        $this->assertSame([5.0, 0.0, 5.0], [$quiet[0]['opening'], $quiet[0]['made'], $quiet[0]['closing']], 'a day with nothing still shows what was carried, because there is stock');
        $this->assertSame([], $this->reports()->reconcile(1, '2026-10-10', '2026-10-13')['rows'], 'before anything was made there is nothing to show');
    }

    public function test_the_closing_figure_is_compared_with_the_shelf_now_and_a_difference_is_shown(): void
    {
        $this->week();
        $today = today()->toDateString();
        $row = $this->row($this->reports()->reconcile(1, '2026-10-15', $today)['rows'], 'Ugali');
        $this->assertSame([5.0, 5.0, false], [$row['closing'], $row['shelf_now'], $row['differs']]);
        PrepLot::query()->orderByDesc('id')->first()->update(['qty_left' => 1.0]);   // something changed outside the movements
        $row = $this->row($this->reports()->reconcile(1, '2026-10-15', $today)['rows'], 'Ugali');
        $this->assertSame([5.0, 4.0, true], [$row['closing'], $row['shelf_now'], $row['differs']]);
    }

    public function test_an_undone_batch_and_a_taken_back_waste_show_as_they_happened(): void
    {
        $r = $this->recipe();
        $run = $this->make($r, 2.0, ['date' => '2026-10-14']);
        app(PrepProduction::class)->cancel($run);   // undone today
        $row = $this->row($this->reports()->reconcile(1, '2026-10-14', today()->toDateString())['rows'], 'Ugali');
        $this->assertSame([0.0, 0.0, 0.0], [$row['opening'], $row['made'], $row['closing']], 'made 2, undone 2');
        $this->assertFalse($row['differs']);
    }

    // ------------------------------------------------------------ chefs

    private function chefs(): void
    {
        DB::table('menus_chefs')->insert([['id' => 1, 'display_name' => 'Chef Amina'], ['id' => 2, 'display_name' => 'Chef Brian']]);
        DB::table('menus_servings')->insert(['id' => 1, 'name' => 'Jumbo', 'sort_order' => 1, 'is_active' => true]);
        $r = $this->recipe();
        $this->make($r, 2.0, ['date' => '2026-10-10', 'chef_id' => 1, 'started_at' => '2026-10-10 08:00', 'finished_at' => '2026-10-10 08:25', 'servings' => [['serving_id' => 1, 'count' => 4]]]);
        $this->make($r, 1.0, ['date' => '2026-10-11', 'chef_id' => 1, 'started_at' => '2026-10-11 08:00', 'finished_at' => '2026-10-11 08:15']);
        $this->make($r, 2.0, ['date' => '2026-10-12', 'chef_id' => 2, 'started_at' => '2026-10-12 08:00', 'finished_at' => '2026-10-12 08:30', 'output_qty' => 1.6,
            'inputs' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id'), 'qty' => 900]]]);
        $this->make($r, 2.0, ['date' => '2026-10-13']);   // nobody named, no times
        $gone = $this->make($r, 2.0, ['date' => '2026-10-13', 'chef_id' => 2]);
        app(PrepProduction::class)->cancel($gone);
    }

    public function test_chefs_are_compared_on_time_yield_following_the_recipe_servings_and_cost(): void
    {
        $this->chefs();
        $rows = $this->reports()->chefs(1, '2026-10-01', '2026-10-31')['rows'];
        $this->assertSame(['Chef Amina', 'Chef Brian', 'Nobody named'], array_column($rows, 'chef'));
        $a = $this->row($rows, 'Ugali');   // the first row is Chef Amina's
        $this->assertSame(['Chef Amina', 2, 3.0, 20.0, 17.5, 2.5, 100.0, 100.0, 2.0, 40.0], [$a['chef'], $a['batches'], $a['made'], $a['minutes_avg'], $a['expected_avg'], $a['over_minutes'], $a['yield_pct'], $a['recipe_followed_pct'], $a['servings_per_unit'], $a['cost_per_unit']]);
        $this->assertEqualsWithDelta(13.33, $a['minutes_per_unit'], 0.01, '40 minutes for 3 kg');
        $b = $rows[1];
        $this->assertSame(['Chef Brian', 1, 1.6, 30.0, 20.0, 10.0, 80.0, 112.5, null], [$b['chef'], $b['batches'], $b['made'], $b['minutes_avg'], $b['expected_avg'], $b['over_minutes'], $b['yield_pct'], $b['recipe_followed_pct'], $b['servings_per_unit']]);
        $this->assertEqualsWithDelta(18.75, $b['minutes_per_unit'], 0.01);
        $this->assertEqualsWithDelta(56.25, $b['cost_per_unit'], 0.01, '90 for 1.6 kg');
        $n = $rows[2];
        $this->assertSame([1, null, null, null, 100.0], [$n['batches'], $n['minutes_avg'], $n['expected_avg'], $n['over_minutes'], $n['yield_pct']], 'no times were noted, so none are claimed; the undone batch is left out');
    }

    public function test_the_chef_report_can_be_held_to_a_recipe_and_to_a_period(): void
    {
        $this->chefs();
        $sauce = $this->recipe('Sauce');
        $this->make($sauce, 2.0, ['date' => '2026-10-12', 'chef_id' => 1]);
        $ugali = DishRecipe::where('name', 'Ugali')->value('id');
        $only = $this->reports()->chefs(1, '2026-10-01', '2026-10-31', $ugali)['rows'];
        $this->assertSame(['Ugali'], array_values(array_unique(array_column($only, 'recipe'))));
        $both = $this->reports()->chefs(1, '2026-10-01', '2026-10-31')['rows'];
        $this->assertSame(['Sauce', 'Ugali'], array_values(array_unique(array_column($both, 'recipe'))), 'recipes are never added together: their units differ');
        $short = $this->reports()->chefs(1, '2026-10-12', '2026-10-12')['rows'];
        $this->assertSame(['Chef Amina', 'Chef Brian'], array_column($short, 'chef'));
        $this->assertSame([], $this->reports()->chefs(1, '2026-09-01', '2026-09-30')['rows']);
    }

    // ------------------------------------------------------------ the endpoints

    public function test_the_endpoints_give_the_reports_and_one_table_for_each_day_when_asked(): void
    {
        $this->week();
        $c = app(\App\Http\Controllers\Admin\MenusPreparedController::class);
        $one = $c->reconciliation(Request::create('/x', 'GET', ['location_id' => 1, 'from' => '2026-10-15', 'to' => '2026-10-16']))->getData(true);
        $this->assertSame([true, 1, 5.0], [$one['ready'], count($one['rows']), (float) $one['rows'][0]['closing']]);
        $daily = $c->reconciliation(Request::create('/x', 'GET', ['location_id' => 1, 'from' => '2026-10-14', 'to' => '2026-10-16', 'daily' => 1]))->getData(true);
        $this->assertSame(['2026-10-14', '2026-10-15', '2026-10-16'], array_column($daily['days'], 'date'));
        $this->assertSame([2.0, 3.5, 5.0], array_map(fn ($d) => (float) $d['rows'][0]['closing'], $daily['days']), 'each day starts from the one before');
        $default = $c->reconciliation(Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $this->assertSame([today()->toDateString(), today()->toDateString()], [$default['from'], $default['to']]);
        $chefs = $c->chefs(Request::create('/x', 'GET', ['location_id' => 1, 'from' => '2026-10-01', 'to' => '2026-10-31']))->getData(true);
        $this->assertTrue($chefs['ready']);
        $this->assertSame('Nobody named', $chefs['rows'][0]['chef']);
        $this->expectException(ValidationException::class);
        $c->reconciliation(Request::create('/x', 'GET', ['location_id' => 1, 'from' => '2026-10-16', 'to' => '2026-10-15']));
    }

    public function test_a_range_of_days_is_held_to_a_month(): void
    {
        $this->assertCount(31, PrepReports::days('2026-01-01', '2026-12-31'));
        $this->assertSame(['2026-10-15'], PrepReports::days('2026-10-15', '2026-10-15'));
    }

    public function test_before_script_198_the_reports_say_they_are_not_ready(): void
    {
        foreach (['menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves', 'menus_prep_counts', 'menus_prep_count_lines'] as $t) {
            Schema::drop($t);
        }
        $c = app(\App\Http\Controllers\Admin\MenusPreparedController::class);
        $this->assertFalse($c->reconciliation(Request::create('/x', 'GET', ['location_id' => 1]))->getData(true)['ready']);
        $this->assertFalse($c->chefs(Request::create('/x', 'GET', ['location_id' => 1]))->getData(true)['ready']);
    }
}
