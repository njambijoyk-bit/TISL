<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\PrepTimer;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\PrepTimers;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus batch timers, build step 8.2 (script 214): a clock on a batch that says when it is ready, and finishes when the batch is made. */
class MenusPrepTimersTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private Carbon $at;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql', '200_menus_sides.sql');
        DB::table('ledgers')->insert(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->default(0); $t->string('display_name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        $this->pantry('Maize flour', 10000, 0.1);
        $this->at = Carbon::parse('2026-10-18 11:00', 'Africa/Nairobi');
    }

    private function timers(): PrepTimers
    {
        return app(PrepTimers::class);
    }

    private function on(): void
    {
        $this->runSqlScripts('214_menus_timers.sql');
    }

    /** Ugali: 2 kg a batch; up to 1 kg takes 15 minutes, up to 2 kg takes 20. */
    private function ugali(array $over = []): DishRecipe
    {
        $flour = (int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id');

        return app(DishRecipes::class)->saveStandalone($over + ['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $flour, 'quantity' => 800]],
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

    public function test_the_timer_is_off_until_script_214_has_been_run(): void
    {
        $this->assertFalse(PrepTimers::installed());
        $this->fails(fn () => $this->timers()->start($this->ugali(), 1, 2.0, [], null, $this->at), '214_menus_timers');
        $this->assertSame([], $this->timers()->running(1));
    }

    public function test_a_batch_is_timed_from_the_recipe_and_says_when_it_is_ready(): void
    {
        $this->on();
        $t = $this->timers()->start($this->ugali(), 1, 2.0, ['note' => 'simmer'], null, $this->at);
        $this->assertSame([20, 'running', '2026-10-18 11:20'], [$t->expected_minutes, $t->status, $t->ready_at->format('Y-m-d H:i')]);

        $r = $this->timers()->running(1, $this->at->copy()->addMinutes(5))[0];
        $this->assertSame(['Ugali', 'kg', 2.0, 20, 'simmer', '11:20', 900, false], [$r['recipe'], $r['unit'], $r['planned'], $r['minutes'], $r['note'], $r['ready_time'], $r['seconds_left'], $r['overdue']], 'ready 11:20, 15 minutes to go');
    }

    public function test_the_size_may_be_written_in_another_unit_and_the_smaller_batch_is_quicker(): void
    {
        $this->on();
        $r = $this->ugali();
        $small = $this->timers()->start($r, 1, 1000.0, ['unit_id' => $this->g], null, $this->at);   // 1000 g is 1 kg
        $this->assertSame([1.0, 15], [(float) $small->planned_qty, $small->expected_minutes]);
    }

    public function test_a_batch_bigger_than_every_time_needs_the_minutes_typed_and_what_is_typed_wins(): void
    {
        $this->on();
        $r = $this->ugali();
        $this->fails(fn () => $this->timers()->start($r, 1, 5.0, [], null, $this->at), 'type how many minutes');
        $this->assertSame(45, $this->timers()->start($r, 1, 5.0, ['minutes' => 45], null, $this->at)->expected_minutes);
        $this->assertSame(30, $this->timers()->start($r, 1, 2.0, ['minutes' => 30], null, $this->at)->expected_minutes, 'typed beats the recipe\'s 20');
        $this->fails(fn () => $this->timers()->start($r, 1, 2.0, ['minutes' => 0], null, $this->at), 'between 1 and 6000');
        $this->fails(fn () => $this->timers()->start($r, 1, 0.0, [], null, $this->at), 'how big the batch is');
    }

    public function test_only_a_recipe_that_may_be_made_in_a_batch_can_be_timed(): void
    {
        $this->on();
        $off = $this->ugali(['name' => 'Old ugali']);
        $off->update(['is_active' => false]);
        $this->fails(fn () => $this->timers()->start($off->fresh(), 1, 2.0, [], null, $this->at), 'switched off');
    }

    public function test_several_pots_run_together_the_first_ready_at_the_top_and_late_ones_say_so(): void
    {
        $this->on();
        $r = $this->ugali();
        $slow = $this->timers()->start($r, 1, 5.0, ['minutes' => 90, 'note' => 'simmer'], null, $this->at);
        $quick = $this->timers()->start($r, 1, 1.0, [], null, $this->at);
        $other = $this->timers()->start($r, 2, 1.0, [], null, $this->at);   // another branch

        $rows = $this->timers()->running(1, $this->at->copy()->addMinutes(30));
        $this->assertSame([$quick->id, $slow->id], array_column($rows, 'id'), 'the one ready first at the top; the other branch is not here');
        $this->assertSame([true, false], array_column($rows, 'overdue'), 'the quick one was ready 15 minutes ago');
        $this->assertSame([-900, 3600], array_column($rows, 'seconds_left'));
        $this->assertNotContains($other->id, array_column($rows, 'id'));
    }

    public function test_a_timer_takes_nothing_off_the_shelf_and_ends_when_its_batch_is_made(): void
    {
        $this->on();
        $r = $this->ugali();
        $t = $this->timers()->start($r, 1, 2.0, [], null, $this->at);
        $this->assertEqualsWithDelta(10000.0, (float) StockBatch::sum('qty_left'), 0.001, 'only Make a batch uses ingredients');

        $run = app(PrepProduction::class)->run($r, 1, 2.0, ['date' => '2026-10-18', 'started_at' => $t->started_at->toDateTimeString(), 'finished_at' => $this->at->copy()->addMinutes(22)->toDateTimeString()]);
        $this->assertSame(22, $run->actualMinutes(), 'the batch is timed from when the timer started');
        $done = $this->timers()->finish($t->id, $run, $this->at->copy()->addMinutes(22));
        $this->assertSame(['done', $run->id], [$done->status, (int) $done->run_id]);
        $this->assertSame([], $this->timers()->running(1));
        $this->assertNull($this->timers()->finish($t->id, $run), 'finishing it twice does nothing');
    }

    public function test_a_timer_can_be_switched_off_without_making_anything(): void
    {
        $this->on();
        $t = $this->timers()->start($this->ugali(), 1, 2.0, [], null, $this->at);
        $this->assertSame('cancelled', $this->timers()->cancel($t->id)->status);
        $this->assertSame([], $this->timers()->running(1));
        $this->assertSame('cancelled', $this->timers()->cancel($t->id)->status, 'twice is fine');
        $this->fails(fn () => $this->timers()->cancel(999), 'could not be found');
        $this->assertSame(1, PrepTimer::count());
    }

    public function test_a_recipe_with_no_times_by_size_uses_its_prep_and_cook_minutes_and_rows_still_win(): void
    {
        $this->on();
        $flour = (int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id');
        $chai = app(DishRecipes::class)->saveStandalone(['name' => 'Masala chai', 'yield_qty' => 1, 'prep_minutes' => 2, 'cook_minutes' => 5, 'lines' => [['ingredient_id' => $flour, 'quantity' => 10]]]);
        $this->assertSame(7, $this->timers()->start($chai, 1, 3.0, [], null, $this->at)->expected_minutes, 'no rows: prep 2 + cook 5, for a batch of any size');
        $this->assertSame(12, $this->timers()->start($chai, 1, 3.0, ['minutes' => 12], null, $this->at)->expected_minutes, 'typed minutes still win');
        $u = $this->ugali(['prep_minutes' => 2, 'cook_minutes' => 5]);
        $this->assertSame(20, $this->timers()->start($u, 1, 2.0, [], null, $this->at)->expected_minutes, 'rows win over prep and cook');
        $none = app(DishRecipes::class)->saveStandalone(['name' => 'Plain', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $flour, 'quantity' => 10]]]);
        $this->assertNull(app(\App\Services\Menus\RecipeTimes::class)->expected($none, 1.0), 'no rows and no prep or cook: no estimate');
    }
}
