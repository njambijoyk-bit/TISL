<?php

namespace Tests\Feature;

use App\Models\Menus\MenuOrderLine;
use App\Models\Menus\Side;
use App\Models\Menus\Station;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\KitchenService;
use App\Services\Menus\MenuService;
use App\Services\Menus\Sides;
use App\Services\Menus\TicketTimers;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus ticket timers, build step 8.3 (script 214): the longest plating or reheating task on a ticket is its own timer, shown with the station's target. */
class MenusTicketTimersTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private Side $rice;
    private Side $choma;
    private Side $plain;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->runSqlScripts('200_menus_sides.sql', '203_menus_order_lines_selection.sql');
    }

    private function on(): void
    {
        $this->runSqlScripts('214_menus_timers.sql');
        foreach (['rice' => ['Rice', 3], 'choma' => ['Choma', 5], 'plain' => ['Plain', null]] as $prop => [$name, $min]) {
            $this->$prop = Side::create(['name' => $name, 'ingredient_id' => 1, 'base_amount' => 1, 'task_minutes' => $min, 'sort_order' => 1, 'is_active' => true]);
        }
    }

    /** A paid order for a dish whose line carries these sides, with its ticket started at the given time. */
    private function ticket(array $sideIds, ?Carbon $startedAt, string $status = 'started'): Ticket
    {
        $d = $this->make('Plate', 500);
        $this->stockDish($d, 50);
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $s = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $s->id, 'dish_id' => $d->id]);
        app(CounterService::class)->sell(['items' => [['dish_id' => $d->id, 'quantity' => 1]], 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 1000]]], null, $this->now);
        $t = Ticket::latest('id')->first();
        MenuOrderLine::where('ticket_id', $t->id)->update(['selection' => json_encode(array_map(fn ($id) => ['side_id' => $id, 'side' => Side::find($id)->name, 'qty' => 1], $sideIds))]);
        $t->update(['status' => $status, 'started_at' => $startedAt]);

        return $t->fresh(['lines']);
    }

    public function test_a_ticket_has_no_timer_of_its_own_before_script_214_or_when_no_side_has_a_task(): void
    {
        $this->assertFalse(TicketTimers::installed());
        $this->on();
        $this->assertNull(app(TicketTimers::class)->forTicket($this->ticket([$this->plain->id], $this->now)), 'sides with no task time');
        $this->assertNull(app(TicketTimers::class)->forTicket($this->ticket([], $this->now)), 'a dish with no sides');
    }

    public function test_the_longest_task_on_the_ticket_is_its_timer_and_it_counts_from_when_the_ticket_is_started(): void
    {
        $this->on();
        $t = $this->ticket([$this->rice->id, $this->choma->id, $this->plain->id], $this->now);
        $timers = app(TicketTimers::class);

        $at = $timers->forTicket($t, $this->now->copy()->addMinutes(3));
        $this->assertSame([5, 'Choma', '2026-10-12T12:05:00+03:00', 120, false], [$at['minutes'], $at['side'], $at['due_at'], $at['seconds_left'], $at['overdue']], 'plating the choma takes 5 minutes: 2 to go');
        $late = $timers->forTicket($t, $this->now->copy()->addMinutes(7));
        $this->assertSame([-120, true], [$late['seconds_left'], $late['overdue']]);

        $waiting = $this->ticket([$this->choma->id], null, 'new');
        $this->assertSame([5, null, null, false], [($w = $timers->forTicket($waiting, $this->now))['minutes'], $w['due_at'], $w['seconds_left'], $w['overdue']], 'not started: the time is known, the clock is not running');

        $ready = $this->ticket([$this->choma->id], $this->now, 'ready');
        $this->assertNull($timers->forTicket($ready, $this->now->copy()->addHour())['due_at'], 'a ticket that is ready has nothing left to time');
    }

    public function test_the_kitchen_screen_shows_the_task_next_to_the_stations_target(): void
    {
        $this->on();
        $this->ticket([$this->choma->id], $this->now);
        $station = Station::first();
        $screen = app(KitchenService::class)->screen($station, $this->now->copy()->addMinutes(2));
        $card = $screen['tickets'][0];
        $this->assertSame([5, 'Choma', 180], [$card['task']['minutes'], $card['task']['side'], $card['task']['seconds_left']]);
        $this->assertSame(15, $screen['station']['target_minutes'], 'the order as a whole is still held to the station target');
        $this->assertArrayHasKey('late', $card);
    }
}
