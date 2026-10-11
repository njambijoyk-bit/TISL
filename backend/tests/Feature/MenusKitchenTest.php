<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Models\Menus\Station;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Menus\DishService;
use App\Services\Menus\KitchenService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\StationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 4: dishes go to stations, every station gets one ticket per order, chefs start and finish them and the order follows. */
class MenusKitchenTest extends TestCase
{
    use Concerns\CreatesDishTables;

    private array $told = [];
    private Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow($this->now = Carbon::parse('2026-10-12 12:00', 'Africa/Nairobi'));
        $this->createDishTables();
        Schema::table('menus_dishes', fn ($t) => $t->unsignedBigInteger('station_id')->nullable());
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_tickets', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('station_id'); $t->string('status', 10)->default('new'); $t->dateTime('due_at'); foreach (['started_at', 'ready_at', 'cancelled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps(); $t->unique(['order_id', 'station_id']); });
        Schema::create('menus_orders', function ($t) {
            $t->id(); $t->string('number', 20); $t->string('track_token', 40); $t->unsignedBigInteger('channel_id')->default(1); $t->string('order_type', 12)->default('pickup'); $t->unsignedBigInteger('location_id')->default(self::BRANCH); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable();
            $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone', 40)->default('0'); $t->string('status', 12)->default('placed'); $t->string('payment', 10)->default('paid');
            $t->unsignedBigInteger('payment_method_id')->nullable(); $t->boolean('asap')->default(true); $t->dateTime('fulfil_at'); $t->text('delivery_address')->nullable(); $t->unsignedBigInteger('shipping_option_id')->nullable(); $t->decimal('delivery_fee', 12, 2)->default(0);
            $t->decimal('subtotal', 12, 2)->default(0); $t->decimal('tax_total', 12, 2)->default(0); $t->decimal('total', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('notes', 500)->nullable(); $t->string('cancel_reason', 300)->nullable();
            foreach (['placed_at', 'accepted_at', 'ready_at', 'completed_at', 'cancelled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps();
        });
        Schema::create('menus_order_lines', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->unsignedBigInteger('variant_id'); $t->string('name'); $t->decimal('quantity', 10, 2)->default(1); $t->decimal('base_price', 12, 2)->default(0); $t->decimal('unit_price', 12, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->unsignedBigInteger('ticket_id')->nullable(); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        $this->mock(VoucherService::class);
        $this->mock(GatewayPaymentService::class);
        $this->mock(CheckoutService::class);
        $notices = $this->createMock(MenuOrderNotices::class);
        foreach (['placed', 'paid', 'ready', 'out', 'cancelled'] as $m) {
            $notices->method($m)->willReturnCallback(function (MenuOrder $o) use ($m) { $this->told[] = [$m, $o->number]; });
        }
        $this->app->instance(MenuOrderNotices::class, $notices);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function kitchen(): KitchenService
    {
        return app(KitchenService::class);
    }

    private function station(string $name, array $o = []): Station
    {
        return app(StationService::class)->save(['name' => $name] + $o);
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

    /** An order (paid, placed) with these dishes. */
    private function order(array $dishes, array $o = []): MenuOrder
    {
        $order = MenuOrder::create($o + ['number' => 'MO-'.random_int(1000, 9999), 'track_token' => str_repeat('a', 40), 'name' => 'Wanjiru Kamau', 'fulfil_at' => $this->now->copy()->addMinutes(30), 'status' => 'placed', 'payment' => 'paid']);
        foreach ($dishes as $d) {
            MenuOrderLine::create(['order_id' => $order->id, 'dish_id' => $d->id, 'variant_id' => $d->variant_id, 'name' => $d->name, 'quantity' => 2, 'unit_price' => 100, 'options' => [['name' => 'No onion']], 'note' => 'Hot']);
        }

        return $order->fresh();
    }

    // ------------------------------------------------------------ stations

    public function test_a_station_keeps_to_its_limits_and_one_takes_everything_else_per_branch(): void
    {
        $svc = app(StationService::class);
        $this->fails(fn () => $svc->save(['name' => ' ']), 'a name');
        $this->fails(fn () => $svc->save(['name' => 'Grill', 'target_minutes' => 0]), 'between 1 and 240');
        $this->fails(fn () => $svc->save(['name' => 'Grill', 'location_id' => 999]), 'branch does not exist');
        $a = $svc->save(['name' => 'Grill', 'is_default' => true]);
        $this->fails(fn () => $svc->save(['name' => 'Grill']), 'already a station');
        $b = $svc->save(['name' => 'Cold', 'is_default' => true]);
        $this->assertSame([false, true], [$a->fresh()->is_default, $b->fresh()->is_default], 'only one takes everything else');
        $c = $svc->save(['name' => 'Grill', 'location_id' => self::BRANCH, 'is_default' => true]);
        $this->assertTrue($b->fresh()->is_default, 'another branch has its own');
        $svc->save(['is_active' => false], $c->id);
        $this->assertFalse($c->fresh()->is_default, 'a station that is off takes nothing');
    }

    public function test_a_dish_goes_to_its_station_or_the_default_one_at_that_branch(): void
    {
        DB::table('locations')->insert(['id' => 99, 'name' => 'Other branch']);
        $grill = $this->station('Grill');
        $cold = $this->station('Cold', ['is_default' => true]);
        $other = $this->station('Elsewhere', ['location_id' => 99]);
        $steak = $this->make('Steak');
        $salad = $this->make('Salad');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $grill->id], $steak->id);
        $k = $this->kitchen();
        $this->assertSame($grill->id, $k->stationFor($steak->fresh(), self::BRANCH)->id);
        $this->assertSame($cold->id, $k->stationFor($salad->fresh(), self::BRANCH)->id, 'no station named: the one that takes the rest');
        $grill->update(['is_active' => false]);
        $this->assertSame($cold->id, $k->stationFor($steak->fresh(), self::BRANCH)->id, 'its station is off: the default');
        $grill->update(['is_active' => true, 'location_id' => 99]);
        $this->assertSame($cold->id, $k->stationFor($steak->fresh(), self::BRANCH)->id, 'its station is at another branch');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $other->id], $steak->id);
        $this->assertSame($cold->id, $k->stationFor($steak->fresh(), self::BRANCH)->id);
        $this->fails(fn () => app(DishService::class)->save(['name' => 'Steak', 'station_id' => 12345], $steak->id), 'station does not exist');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => null], $steak->id);
        $this->assertNull($steak->fresh()->station_id);
    }

    public function test_a_station_with_tickets_to_make_can_not_be_removed_and_its_dishes_are_released(): void
    {
        $grill = $this->station('Grill', ['is_default' => true]);
        $d = $this->make('Steak');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $grill->id], $d->id);
        $o = $this->order([$d]);
        $this->kitchen()->fire($o);
        $this->fails(fn () => app(StationService::class)->delete($grill), 'still has tickets');
        $this->kitchen()->ready(Ticket::first());
        app(StationService::class)->delete($grill);
        $this->assertNull($d->fresh()->station_id);
        $this->assertSame(0, Station::count());
    }

    // ------------------------------------------------------------ tickets

    public function test_every_station_gets_one_ticket_and_the_lines_know_which(): void
    {
        $grill = $this->station('Grill');
        $cold = $this->station('Cold', ['is_default' => true]);
        $steak = $this->make('Steak');
        $ribs = $this->make('Ribs');
        $salad = $this->make('Salad');
        foreach ([$steak, $ribs] as $d) {
            app(DishService::class)->save(['name' => $d->name, 'station_id' => $grill->id], $d->id);
        }
        $o = $this->order([$steak, $salad, $ribs]);
        $this->assertSame(2, $this->kitchen()->fire($o));
        $this->assertSame(0, $this->kitchen()->fire($o), 'a second call makes nothing');
        $this->assertSame(2, Ticket::count());
        $g = Ticket::where('station_id', $grill->id)->first();
        $this->assertSame(['Steak', 'Ribs'], $g->lines->pluck('name')->all());
        $this->assertSame(['Salad'], Ticket::where('station_id', $cold->id)->first()->lines->pluck('name')->all());
        $this->assertSame('new', $g->status);
        $this->assertEquals($o->fulfil_at, $g->due_at);
    }

    public function test_with_no_stations_nothing_changes(): void
    {
        $o = $this->order([$this->make('Steak')]);
        $this->assertSame(0, $this->kitchen()->fire($o));
        $this->assertSame(0, Ticket::count());
    }

    public function test_the_order_starts_with_the_first_ticket_and_is_ready_with_the_last(): void
    {
        $grill = $this->station('Grill');
        $cold = $this->station('Cold', ['is_default' => true]);
        $steak = $this->make('Steak');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $grill->id], $steak->id);
        $o = $this->order([$steak, $this->make('Salad')]);
        $this->kitchen()->fire($o);
        [$g, $c] = [Ticket::where('station_id', $grill->id)->first(), Ticket::where('station_id', $cold->id)->first()];
        $this->kitchen()->start($g);
        $this->assertSame(['preparing', 'started'], [$o->fresh()->status, $g->fresh()->status]);
        $this->assertNotNull($o->fresh()->accepted_at);
        $this->kitchen()->ready($g);
        $this->assertSame('preparing', $o->fresh()->status, 'the salad is not done');
        $this->assertSame([], $this->told);
        $this->kitchen()->ready($c);
        $this->assertSame('ready', $o->fresh()->status);
        $this->assertSame([['ready', $o->number]], $this->told, 'the customer is told once');
        $this->assertNotNull($o->fresh()->ready_at);
    }

    public function test_a_dish_with_no_station_keeps_the_order_from_becoming_ready_by_itself(): void
    {
        $grill = $this->station('Grill');
        $steak = $this->make('Steak');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $grill->id], $steak->id);
        $o = $this->order([$steak, $this->make('Drink')]);   // no station takes the drink
        $this->kitchen()->fire($o);
        $this->kitchen()->ready(Ticket::first());
        $this->assertSame('placed', $o->fresh()->status, 'the drink is not on any screen: staff finish the order from the board');
    }

    public function test_a_ticket_goes_new_started_ready_in_order_only(): void
    {
        $this->station('Grill', ['is_default' => true]);
        $o = $this->order([$this->make('Steak')]);
        $this->kitchen()->fire($o);
        $t = Ticket::first();
        $this->fails(fn () => $this->kitchen()->recall($t), 'Nothing to take back');
        $this->kitchen()->start($t);
        $this->fails(fn () => $this->kitchen()->start($t->fresh()), 'already started');
        $this->kitchen()->ready($t->fresh());
        $this->fails(fn () => $this->kitchen()->ready($t->fresh()), 'not being made');
        $this->fails(fn () => $this->kitchen()->start($t->fresh()), 'not waiting');
    }

    public function test_a_ticket_can_be_taken_back_and_the_order_with_it(): void
    {
        $this->station('Grill', ['is_default' => true]);
        $o = $this->order([$this->make('Steak')]);
        $this->kitchen()->fire($o);
        $this->kitchen()->ready(Ticket::first());
        $this->assertSame('ready', $o->fresh()->status);
        $t = $this->kitchen()->recall(Ticket::first());
        $this->assertSame(['started', 'preparing', null], [$t->status, $o->fresh()->status, $o->fresh()->ready_at]);
        $this->assertSame('new', $this->kitchen()->recall($t)->status);
        $this->kitchen()->ready($t->fresh());
        $o->fresh()->update(['status' => 'out']);
        $this->fails(fn () => $this->kitchen()->recall($t->fresh()), 'left the kitchen');
    }

    public function test_marking_the_order_ready_or_cancelling_it_from_the_board_reaches_the_tickets(): void
    {
        $this->station('Grill', ['is_default' => true]);
        $svc = app(MenuOrderService::class);
        $a = $this->order([$this->make('Steak')]);
        $this->kitchen()->fire($a);
        $svc->advance($a, 'ready');
        $this->assertSame(['ready'], Ticket::where('order_id', $a->id)->pluck('status')->all());
        $this->assertNotNull(Ticket::where('order_id', $a->id)->value('started_at'));
        $b = $this->order([$this->make('Chips')]);
        $this->kitchen()->fire($b);
        $svc->cancel($b, 'Closed');
        $this->assertSame(['cancelled'], Ticket::where('order_id', $b->id)->pluck('status')->all());
    }

    public function test_an_order_still_waiting_for_payment_has_no_tickets_until_it_is_paid(): void
    {
        $this->station('Grill', ['is_default' => true]);
        $d = $this->make('Steak');
        $o = $this->order([$d], ['payment' => 'pending']);
        $v = \App\Models\Books\Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-1', 'total_amount' => 200, 'meta' => ['menu_order_id' => $o->id]]);
        $o->update(['voucher_id' => $v->id]);
        $this->assertSame(0, Ticket::count());
        app(MenuOrderService::class)->paid($v, \App\Models\Books\Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-1']));
        $this->assertSame(1, Ticket::count(), 'the money came in: the kitchen has its ticket');
    }

    // ------------------------------------------------------------ what the screens show

    public function test_the_station_screen_shows_what_to_make_with_allergens_choices_and_lateness(): void
    {
        $grill = $this->station('Grill', ['is_default' => true, 'target_minutes' => 15]);
        $d = $this->make('Steak');
        $o = $this->order([$d], ['notes' => 'Allergic to nuts']);
        DB::table('menus_orders')->where('id', $o->id)->update(['created_at' => $this->now->copy()->subMinutes(20)]);
        $this->kitchen()->fire($o);
        $r = $this->kitchen()->screen($grill, $this->now);
        $c = $r['tickets'][0];
        $this->assertSame(['Wanjiru', true, 20, 'Allergic to nuts'], [$c['name'], $c['late'], $c['waited'], $c['notes']], 'the first name only; 20 minutes is past the 15 target');
        $this->assertSame([2, 'Steak', ['No onion'], 'Hot'], [$c['lines'][0]['quantity'], $c['lines'][0]['name'], $c['lines'][0]['options'], $c['lines'][0]['note']]);
        $this->assertSame([], $r['later']);
        $this->kitchen()->ready(Ticket::first());
        $r = $this->kitchen()->screen($grill, $this->now);
        $this->assertSame([[], 1], [$r['tickets'], count($r['done'])], 'finished tickets move to "just done"');
        $this->assertSame([], $this->kitchen()->screen($grill, $this->now->copy()->addMinutes(20))['done'], 'and drop off after a quarter of an hour');
    }

    public function test_an_order_for_later_waits_under_later_until_its_time_is_near(): void
    {
        $grill = $this->station('Grill', ['is_default' => true]);
        $soon = $this->order([$this->make('Steak')], ['fulfil_at' => $this->now->copy()->addMinutes(30)]);
        $far = $this->order([$this->make('Ribs')], ['fulfil_at' => $this->now->copy()->addHours(3)]);
        $this->kitchen()->fire($soon);
        $this->kitchen()->fire($far);
        $r = $this->kitchen()->screen($grill, $this->now);
        $this->assertSame([[$soon->number], [$far->number]], [array_column($r['tickets'], 'number'), array_column($r['later'], 'number')]);
        $later = $this->kitchen()->screen($grill, $this->now->copy()->addMinutes(150));
        $this->assertSame([[$soon->number, $far->number], []], [array_column($later['tickets'], 'number'), $later['later']], 'two and a half hours on, the later order is due within the hour: it moves up');
    }

    public function test_a_cancelled_order_is_off_the_screen_and_the_pass_shows_each_station(): void
    {
        $grill = $this->station('Grill');
        $cold = $this->station('Cold', ['is_default' => true]);
        $steak = $this->make('Steak');
        app(DishService::class)->save(['name' => 'Steak', 'station_id' => $grill->id], $steak->id);
        $a = $this->order([$steak, $this->make('Salad')]);
        $b = $this->order([$this->make('Chips')]);
        $this->kitchen()->fire($a);
        $this->kitchen()->fire($b);
        $this->kitchen()->start(Ticket::where('order_id', $a->id)->where('station_id', $grill->id)->first());
        $pass = collect($this->kitchen()->expo($this->now)['orders']);
        $this->assertEqualsCanonicalizing([['station' => 'Grill', 'status' => 'started'], ['station' => 'Cold', 'status' => 'new']], $pass->firstWhere('id', $a->id)['stations']);
        app(MenuOrderService::class)->cancel($b, 'Closed');
        $this->assertSame([$a->id], collect($this->kitchen()->expo($this->now)['orders'])->pluck('id')->all(), 'a cancelled order leaves the pass');
        $this->assertSame([$a->number], array_column($this->kitchen()->screen($cold, $this->now)['tickets'], 'number'), 'the cold station shows only the live order');
    }

    public function test_orders_waiting_for_payment_are_not_on_the_pass(): void
    {
        $this->station('Grill', ['is_default' => true]);
        $this->order([$this->make('Steak')], ['payment' => 'pending']);
        $this->assertSame([], $this->kitchen()->expo($this->now)['orders']);
    }

    public function test_a_branch_station_beats_the_all_branches_one_for_everything_else(): void
    {
        $all = $this->station('Main kitchen', ['is_default' => true]);
        $mine = $this->station('Branch kitchen', ['is_default' => true, 'location_id' => self::BRANCH]);
        $this->assertSame($mine->id, $this->kitchen()->stationFor($this->make('Steak'), self::BRANCH)->id);
        DB::table('locations')->insert(['id' => 7, 'name' => 'Third']);
        $this->assertSame($all->id, $this->kitchen()->stationFor(null, 7)->id, 'a branch with none of its own uses the shared one');
    }

    public function test_a_ticket_of_an_order_that_is_finished_is_not_on_the_screen(): void
    {
        $grill = $this->station('Grill', ['is_default' => true]);
        $o = $this->order([$this->make('Steak')]);
        $this->kitchen()->fire($o);
        $o->update(['status' => 'completed']);
        $this->assertSame([], $this->kitchen()->screen($grill, $this->now)['tickets']);
    }
}
