<?php

namespace Tests\Feature;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Events\Event;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Events\EventCheckout;
use App\Services\Events\EventEditor;
use App\Services\Events\EventException;
use App\Services\Events\EventPresenter;
use App\Services\Events\HoldReaper;
use App\Services\Events\TicketHolds;
use App\Services\Events\TicketIssuer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Buying tickets: what is priced and asked of the books, who can buy, what happens when the payment cannot start, when the money arrives (also late) and when nobody pays.
 * The books and the payment gateways are stood in for; what they are asked is checked.
 */
class EventCheckoutTest extends TestCase
{
    use Concerns\CreatesEventTables;

    private array $placed = [];
    private array $started = [];
    private ?\Throwable $gatewayFails = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        DB::table('voucher_types')->insert(['id' => 1, 'base_type' => 'sales_order']);
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); $t->integer('sort_order')->default(0); $t->timestamps(); });
        DB::table('locations')->insert(['id' => 5, 'name' => 'Main shop', 'is_default' => true]);
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'name' => 'Kenyan shilling', 'symbol' => 'KSh', 'is_base' => true]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'M-Pesa', 'kind' => 'mpesa', 'is_online' => true, 'gateway' => 'mpesa_stk', 'is_active' => true], ['id' => 2, 'name' => 'Bank slip', 'kind' => 'bank', 'is_online' => true, 'gateway' => 'bank_manual', 'is_active' => true]]);

        // the books: a Sales Order is "placed" with what it is asked, priced as ledger-taxed 16%
        $vouchers = $this->createMock(VoucherService::class);
        $vouchers->method('preview')->willReturnCallback(function (array $d) {
            $sub = array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines']));

            return ['subtotal' => $sub, 'tax_total' => round($sub * 0.16, 2), 'total' => round($sub * 1.16, 2)];
        });
        $vouchers->method('placeOrder')->willReturnCallback(function (array $d) {
            $this->placed[] = $d;
            $sub = array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines']));
            $v = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-' . (count($this->placed)), 'currency_id' => $d['currency_id'], 'customer_id' => $d['customer_id'], 'total_amount' => round($sub * 1.16, 2), 'meta' => $d['meta']]);

            return $v;
        });
        $this->app->instance(VoucherService::class, $vouchers);
        $gateway = $this->createMock(GatewayPaymentService::class);
        $gateway->method('start')->willReturnCallback(function (Voucher $order, PaymentMethod $m, array $contact, array $tenders, float $due) {
            if ($this->gatewayFails) {
                throw $this->gatewayFails;
            }
            $this->started[] = compact('contact', 'due') + ['order' => $order->id, 'method' => $m->name];
            $a = new PaymentAttempt();
            $a->forceFill(['id' => 900 + count($this->started), 'status' => 'pending', 'amount' => $due, 'gateway' => $m->gateway]);

            return ['attempt' => $a, 'redirect_url' => $m->gateway === 'mpesa_stk' ? null : 'https://pay.example/x'];
        });
        $this->app->instance(GatewayPaymentService::class, $gateway);
    }

    private function checkout(): EventCheckout
    {
        return app(EventCheckout::class);
    }

    private function event(array $o = []): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10, 'currency_id' => 1, 'sales_ledger_id' => 40]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(10), 'ends_at' => now()->addDays(10)->addHours(3)]);

        return $e;
    }

    private function type(Event $e, array $o = []): EventTicketType
    {
        return EventTicketType::create($o + ['event_id' => $e->id, 'name' => 'General', 'price' => 1000, 'capacity' => 5]);
    }

    private function buyer(array $o = []): array
    {
        return $o + ['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'phone' => '0712345678'];
    }

    private function mpesa(): PaymentMethod
    {
        return PaymentMethod::find(1);
    }

    private function refuses(callable $f, string $needle): void
    {
        try {
            $f();
            $this->fail("Expected: {$needle}");
        } catch (EventException $e) {
            $this->assertStringContainsString($needle, $e->getMessage());
        }
    }

    // ------------------------------------------------------------ pricing

    public function test_the_quote_adds_what_the_books_charge_and_leaves_free_tickets_out_of_the_order(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['price' => 1000]);
        $f = $this->type($e, ['name' => 'RSVP', 'price' => 0, 'capacity' => null]);
        $q = $this->checkout()->quote($e, [['ticket_type_id' => $g->id, 'quantity' => 2], ['ticket_type_id' => $f->id, 'quantity' => 1]]);
        $this->assertSame([false, 2000.0, 320.0, 2320.0], [$q['free'], $q['subtotal'], $q['tax_total'], $q['total']]);
        $this->assertSame(['General', 2, 2000.0], [$q['lines'][0]['name'], $q['lines'][0]['quantity'], $q['lines'][0]['amount']]);
        $this->assertSame('KES', $q['currency']['code']);
        $free = $this->checkout()->quote($e, [['ticket_type_id' => $f->id, 'quantity' => 3]]);
        $this->assertSame([true, 0.0], [$free['free'], $free['total']]);
    }

    public function test_the_same_ticket_type_listed_twice_is_added_up_and_a_foreign_type_is_refused(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $this->assertSame([$g->id => 3], $this->checkout()->wanted([['ticket_type_id' => $g->id, 'quantity' => 1], ['ticket_type_id' => $g->id, 'quantity' => 2], ['ticket_type_id' => 0, 'quantity' => 4]]));
        $other = $this->event(['title' => 'Other']);
        $x = $this->type($other);
        $this->refuses(fn () => $this->checkout()->quote($e, [['ticket_type_id' => $x->id, 'quantity' => 1]]), 'not part of this event');
        $this->refuses(fn () => $this->checkout()->wanted([]), 'Choose how many');
    }

    // ------------------------------------------------------------ buying

    public function test_a_free_ticket_is_valid_at_once_with_no_order_and_no_payment(): void
    {
        $e = $this->event();
        $f = $this->type($e, ['name' => 'RSVP', 'price' => 0, 'capacity' => 2]);
        $r = $this->checkout()->place($e, [['ticket_type_id' => $f->id, 'quantity' => 2]], $this->buyer(['phone' => '']), null, null, ['Amina', 'Baraka']);
        $this->assertSame('issued', $r['status']);
        $this->assertSame(['valid', 'valid'], array_column($r['tickets'], 'state'));
        $this->assertSame(['Amina', 'Baraka'], array_column($r['tickets'], 'holder_name'));
        $this->assertSame([], $this->placed, 'nothing was put on the books');
        $this->assertSame(2, EventTicket::where('state', 'valid')->count());
        $this->refuses(fn () => $this->checkout()->place($e, [['ticket_type_id' => $f->id, 'quantity' => 1]], $this->buyer(), null, null), 'sold out');
    }

    public function test_a_paid_purchase_holds_the_seats_places_one_order_line_per_type_and_starts_the_payment(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['price' => 1500]);
        $v = $this->type($e, ['name' => 'VIP', 'price' => 4000, 'capacity' => 3]);
        $r = $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 2], ['ticket_type_id' => $v->id, 'quantity' => 1]], $this->buyer(), null, $this->mpesa());
        $this->assertSame('awaiting_payment', $r['status']);
        $this->assertSame(['held', 'held', 'held'], array_column($r['tickets'], 'state'));
        $order = $this->placed[0];
        $this->assertSame([['custom', 'Jazz night — General', 40, 2, 1500.0], ['custom', 'Jazz night — VIP', 40, 1, 4000.0]], array_map(fn ($l) => [$l['type'], $l['description'], $l['ledger_id'], $l['quantity'], $l['rate']], $order['lines']));
        $this->assertSame([1, null, true, 5], [$order['currency_id'], $order['customer_id'], $order['meta']['guest'], $order['location_id']]);
        $this->assertSame(['name' => 'Amina Wanjiru', 'email' => 'amina@example.com', 'phone' => '0712345678'], $order['meta']['contact']);
        $this->assertEqualsCanonicalizing(EventTicket::pluck('id')->all(), $order['meta']['event']['ticket_ids'], 'the order remembers its tickets');
        $this->assertSame([[$g->id, 'Jazz night — General'], [$v->id, 'Jazz night — VIP']], array_map(fn ($l) => [$l['ticket_type_id'], $l['description']], $order['meta']['event']['lines']), 'and which line each ticket type is, for a refund');
        $this->assertSame([1], array_unique(EventTicket::pluck('order_id')->all()), 'and each ticket its order');
        $this->assertEqualsWithDelta(7000 * 1.16, $this->started[0]['due'], 0.001, 'the payment asks for the total with tax');
        $this->assertSame('0712345678', $this->started[0]['contact']['phone']);
        $this->assertSame(null, $r['redirect_url']);
        $this->assertSame(15, $r['hold_minutes']);
        $this->assertNotEmpty($r['attempt']['token']);
        $this->assertSame(0, EventTicket::where('state', 'valid')->count(), 'nothing is valid until the money arrives');
    }

    public function test_a_card_purchase_returns_the_page_to_send_the_buyer_to(): void
    {
        DB::table('payment_methods')->insert(['id' => 3, 'name' => 'Card', 'kind' => 'card', 'is_online' => true, 'gateway' => 'stripe', 'is_active' => true]);
        $e = $this->event();
        $g = $this->type($e);
        $r = $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], $this->buyer(), null, PaymentMethod::find(3));
        $this->assertSame('https://pay.example/x', $r['redirect_url']);
    }

    public function test_what_is_missing_is_asked_for_before_any_seat_is_held(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $one = [['ticket_type_id' => $g->id, 'quantity' => 1]];
        $this->refuses(fn () => $this->checkout()->place($e, $one, $this->buyer(['name' => ' ']), null, $this->mpesa()), 'Enter your name');
        $this->refuses(fn () => $this->checkout()->place($e, $one, $this->buyer(['email' => 'nope']), null, $this->mpesa()), 'email');
        $this->refuses(fn () => $this->checkout()->place($e, $one, $this->buyer(['phone' => '']), null, $this->mpesa()), 'phone');
        $this->refuses(fn () => $this->checkout()->place($e, $one, $this->buyer(), null, null), 'Choose how to pay');
        $this->refuses(fn () => $this->checkout()->place($e, $one, $this->buyer(), null, PaymentMethod::find(2)), "can't be charged automatically");
        $this->assertSame(0, EventTicket::count());
    }

    public function test_when_the_payment_cannot_start_the_seats_go_straight_back_on_sale_and_no_order_is_left(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['capacity' => 1]);
        $this->gatewayFails = new BooksException('We could not send the M-Pesa prompt: timeout');
        $this->refuses(fn () => $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], $this->buyer(), null, $this->mpesa()), 'M-Pesa prompt');
        $this->assertSame(['released'], EventTicket::pluck('state')->all());
        $this->assertSame(0, Voucher::count(), 'the order was rolled back with the failed payment');
        $this->gatewayFails = null;
        $r = $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], $this->buyer(), null, $this->mpesa());
        $this->assertSame('awaiting_payment', $r['status'], 'the only seat can be bought again');
    }

    public function test_giving_seats_back_never_touches_a_ticket_that_was_paid_for(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $r = $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 2]], $this->buyer(), null, $this->mpesa());
        $paid = EventTicket::orderBy('id')->first();
        $paid->update(['state' => 'valid', 'held_until' => null]);
        app(TicketHolds::class)->release(EventTicket::all());
        $this->assertSame(['valid', 'released'], EventTicket::orderBy('id')->pluck('state')->all());
    }

    public function test_an_event_that_is_not_on_sale_sells_nothing(): void
    {
        $e = $this->event(['status' => Event::DRAFT]);
        $g = $this->type($e);
        $this->refuses(fn () => $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], $this->buyer(), null, $this->mpesa()), 'not on sale');
        $this->assertSame([], $this->placed);
    }

    // ------------------------------------------------------------ the money arrives

    private function paidOrder(int $qty = 1, array $typeOpts = []): array
    {
        $e = $this->event();
        $g = $this->type($e, $typeOpts + ['capacity' => 1]);
        $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => $qty]], $this->buyer(), null, $this->mpesa());

        return [$e, $g, Voucher::first()];
    }

    public function test_paying_makes_the_held_tickets_valid_and_paying_twice_changes_nothing(): void
    {
        [, , $order] = $this->paidOrder();
        $sale = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-1']);
        $this->assertSame(['issued' => 1, 'short' => false], app(TicketIssuer::class)->orderPaid($order, $sale));
        $t = EventTicket::first();
        $this->assertSame(['valid', $order->id, $sale->id], [$t->state, $t->order_id, $t->sale_id]);
        $this->assertNotNull($t->issued_at);
        $this->assertSame(0, app(TicketIssuer::class)->orderPaid($order, $sale)['issued']);
    }

    public function test_a_payment_after_the_hold_ran_out_still_gets_the_ticket_when_the_seat_is_free(): void
    {
        [, , $order] = $this->paidOrder();
        $this->travel(20)->minutes();
        app(TicketHolds::class)->releaseExpired();
        $this->assertSame('released', EventTicket::first()->state);
        $this->assertSame(['issued' => 1, 'short' => false], app(TicketIssuer::class)->orderPaid($order));
        $this->assertSame('valid', EventTicket::first()->state);
    }

    public function test_a_payment_after_the_seat_was_sold_to_someone_else_opens_a_refund_instead_of_vanishing(): void
    {
        [$e, $g, $order] = $this->paidOrder();
        $this->travel(20)->minutes();
        app(TicketHolds::class)->releaseExpired();
        $second = $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], $this->buyer(['email' => 'b@example.com']), null, $this->mpesa());
        $this->assertSame('awaiting_payment', $second['status'], 'the freed seat went to the next buyer');
        $this->assertSame(['issued' => 0, 'short' => true], app(TicketIssuer::class)->orderPaid($order));
        $first = EventTicket::where('order_id', $order->id)->first();
        $this->assertSame('released', $first->state, 'the first buyer holds no ticket');
        $r = EventRefundRequest::first();
        $this->assertSame([$first->id, 'pending', 'system', '1000.00'], [$r->ticket_id, $r->status, $r->requested_by, (string) $r->amount]);
        $this->assertSame('seats_gone', $order->fresh()->meta['event']['problem']);
        app(TicketIssuer::class)->orderPaid($order);
        $this->assertSame(1, EventRefundRequest::count(), 'asking again does not open a second request');
    }

    public function test_an_order_that_is_not_for_tickets_is_left_alone(): void
    {
        $o = Voucher::create(['voucher_type_id' => 1, 'meta' => ['contact' => []]]);
        $this->assertFalse(app(TicketIssuer::class)->isEventOrder($o));
        $this->assertSame(['issued' => 0, 'short' => false], app(TicketIssuer::class)->orderPaid($o));
    }

    // ------------------------------------------------------------ nobody pays

    public function test_unpaid_seats_are_released_but_the_order_is_kept_for_a_day_then_cancelled(): void
    {
        [, , $order] = $this->paidOrder();
        $cancelled = [];
        $books = $this->createMock(VoucherService::class);
        $books->method('cancel')->willReturnCallback(function (Voucher $v, ?string $reason) use (&$cancelled) {
            $cancelled[] = [$v->id, $reason];
            $v->update(['status' => Voucher::CANCELLED]);

            return $v;
        });
        $reaper = new HoldReaper(app(TicketHolds::class), $books);
        $this->assertSame(['released' => 0, 'cancelled' => 0], $reaper->run(), 'nothing yet');
        $this->travel(16)->minutes();
        $this->assertSame(['released' => 1, 'cancelled' => 0], $reaper->run());
        $this->assertSame([], $cancelled, 'a late card payment can still arrive, so the order stays');
        $this->travel(25)->hours();
        $this->assertSame(['released' => 0, 'cancelled' => 1], $reaper->run());
        $this->assertSame([[$order->id, 'The tickets were not paid for in time.']], $cancelled);
        $this->assertSame(['released' => 0, 'cancelled' => 0], $reaper->run(), 'and only once');
    }

    public function test_an_order_part_of_which_was_paid_is_not_cancelled(): void
    {
        [$e, $g, $order] = $this->paidOrder(2, ['capacity' => 5]);
        $first = EventTicket::orderBy('id')->first();
        $first->update(['state' => 'valid', 'held_until' => null]);
        $books = $this->createMock(VoucherService::class);
        $books->expects($this->never())->method('cancel');
        $reaper = new HoldReaper(app(TicketHolds::class), $books);
        $this->travel(20)->minutes();
        $this->assertSame(1, $reaper->run()['released'], 'the unpaid one lapsed');
        $this->travel(2)->days();
        $reaper->run();
        $this->assertSame(['valid', 'released'], EventTicket::orderBy('id')->pluck('state')->all());
    }

    // ------------------------------------------------------------ what the public sees

    public function test_the_public_page_shows_prices_what_is_left_and_never_the_join_link(): void
    {
        $e = $this->event(['kind' => 'hybrid', 'online_url' => 'https://meet.example/secret', 'venue_name' => 'Alliance']);
        $g = $this->type($e, ['capacity' => 4, 'description' => 'Standing']);
        $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 4]], $this->buyer(), null, $this->mpesa());
        $page = app(EventPresenter::class)->publicShow($e->fresh());
        $this->assertStringNotContainsString('meet.example', json_encode($page), 'the join link is for ticket holders only');
        $this->assertTrue($page['has_online_link']);
        $t = $page['ticket_types'][0];
        $this->assertSame([1000.0, 'sold_out', 0], [$t['price'], $t['state'], $t['max']]);
        $this->assertTrue($page['sold_out']);
        $this->assertFalse(app(EventPresenter::class)->publicShow($this->event(['title' => 'Fresh']))['sold_out']);
    }

    public function test_only_a_few_left_is_said_only_when_it_is_a_few(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['capacity' => 30]);
        $this->assertNull(app(EventPresenter::class)->publicShow($e)['ticket_types'][0]['left']);
        $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 10]], $this->buyer(), null, $this->mpesa());
        $this->checkout()->place($e, [['ticket_type_id' => $g->id, 'quantity' => 10]], $this->buyer(), null, $this->mpesa());
        $this->assertSame(10, app(EventPresenter::class)->publicShow($e->fresh())['ticket_types'][0]['left']);
    }

    public function test_the_list_leaves_out_drafts_private_and_finished_events_and_filters(): void
    {
        $live = $this->event(['title' => 'Live gig']);
        $this->type($live);
        $free = $this->event(['title' => 'Free talk']);
        $this->type($free, ['price' => 0, 'capacity' => null]);
        $this->event(['title' => 'Hidden', 'is_listed' => false]);
        $this->event(['title' => 'Draft', 'status' => Event::DRAFT]);
        $old = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED, 'max_per_order' => 10]);
        EventSession::create(['event_id' => $old->id, 'starts_at' => now()->subDays(3), 'ends_at' => now()->subDays(3)->addHours(2)]);
        $c = new \App\Http\Controllers\Api\EventPublicController(app(EventPresenter::class), $this->checkout());
        $names = fn (array $q) => array_column($c->index(\Illuminate\Http\Request::create('/x', 'GET', $q))->getData(true)['data'], 'title');
        $this->assertEqualsCanonicalizing(['Live gig', 'Free talk'], $names([]));
        $this->assertSame(['Free talk'], $names(['free' => 1]));
        $this->assertSame(['Live gig'], $names(['q' => 'gig']));
        $this->assertSame([], $names(['when' => 'week']), 'both are ten days away');
        $this->assertEqualsCanonicalizing(['Live gig', 'Free talk'], $names(['when' => 'month']));
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $c->show('draft');
    }
}
