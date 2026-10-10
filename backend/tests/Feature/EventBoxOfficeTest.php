<?php

namespace Tests\Feature;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\PaymentModeService;
use App\Services\Books\VoucherService;
use App\Services\Events\EventBoxOffice;
use App\Services\Events\EventException;
use App\Services\Notify\Notifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Selling at the door: for cash into a chosen account (a normal Cash Sale), or complimentary; valid at once; the seat rules still hold. */
class EventBoxOfficeTest extends TestCase
{
    use Concerns\CreatesEventTables;

    private array $placed = [];
    private array $settled = [];
    private array $told = [];
    private ?string $booksFail = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        config(['app.frontend_url' => 'https://shop.example.com']);
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'symbol' => 'KSh', 'is_base' => true]);
        DB::table('locations')->insert(['id' => 5, 'name' => 'Main shop', 'is_default' => true]);
        DB::table('ledger_groups')->insert(['name' => 'Cash-in-hand']);
        DB::table('ledgers')->insert(['id' => 42, 'group_id' => DB::table('ledger_groups')->where('name', 'Cash-in-hand')->value('id'), 'name' => 'Till']);
        $books = $this->createMock(VoucherService::class);
        $books->method('placeOrder')->willReturnCallback(function (array $d) {
            if ($this->booksFail) {
                throw new BooksException($this->booksFail);
            }
            $this->placed[] = $d;

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-' . count($this->placed), 'currency_id' => 1, 'total_amount' => array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines'])) * 1.16, 'meta' => $d['meta']]);
        });
        $this->app->instance(VoucherService::class, $books);
        $this->app->instance(GatewayPaymentService::class, $this->createMock(GatewayPaymentService::class));
        $checkout = $this->createMock(CheckoutService::class);
        $checkout->method('settle')->willReturnCallback(function (Voucher $order, array $tenders, ?User $by) {
            $this->settled[] = ['order' => $order->id, 'tenders' => $tenders, 'by' => $by?->id];

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-' . count($this->settled)]);
        });
        $this->app->instance(CheckoutService::class, $checkout);
        $modes = $this->createMock(PaymentModeService::class);
        $modes->method('methodFor')->willReturnCallback(fn (int $ledger) => (new PaymentMethod)->forceFill(['id' => 100 + $ledger, 'ledger_id' => $ledger]));
        $this->app->instance(PaymentModeService::class, $modes);
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('sendToContact')->willReturnCallback(function (array $c, string $type, string $title) { $this->told[] = [$c['email'], $type, $title]; return []; });
        $this->app->instance(Notifier::class, $notifier);
    }

    private function box(): EventBoxOffice
    {
        return app(EventBoxOffice::class);
    }

    private function staff(): User
    {
        return (new User)->forceFill(['id' => 7]);
    }

    private function event(array $o = []): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10, 'currency_id' => 1, 'sales_ledger_id' => 40, 'venue_name' => 'Alliance']);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHours(3)]);

        return $e;
    }

    private function type(Event $e, array $o = []): EventTicketType
    {
        return EventTicketType::create($o + ['event_id' => $e->id, 'name' => 'General', 'price' => 1000, 'capacity' => 5]);
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

    public function test_only_cash_and_bank_accounts_are_offered_to_take_the_money_into(): void
    {
        $this->assertSame([['id' => 41, 'name' => 'KCB Bank'], ['id' => 42, 'name' => 'Till']], $this->box()->ledgers());
    }

    public function test_a_cash_sale_is_booked_into_the_chosen_account_and_the_tickets_are_valid_at_once(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $r = $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 2]], ['name' => 'Walk-in guest', 'phone' => '0700'], $this->staff(), 'cash', 42, ['Amina', 'Baraka']);
        $this->assertSame('issued', $r['status']);
        $this->assertSame(['valid', 'valid'], array_column($r['tickets'], 'state'));
        $this->assertSame(['Amina', 'Baraka'], array_column($r['tickets'], 'holder_name'));
        $order = $this->placed[0];
        $this->assertSame(['admin', 7, true], [$order['channel'], $order['meta']['box_office'], $order['meta']['guest']]);
        $this->assertSame([['custom', 'Jazz night — General', 40, 2, 1000.0]], array_map(fn ($l) => [$l['type'], $l['description'], $l['ledger_id'], $l['quantity'], $l['rate']], $order['lines']));
        $this->assertSame(142, $this->settled[0]['tenders'][0]['payment_method_id'], 'the till\'s own payment method');
        $this->assertEqualsWithDelta(2320.0, $this->settled[0]['tenders'][0]['amount'], 0.001, 'the whole total, with tax');
        $this->assertSame(7, $this->settled[0]['by']);
        $t = EventTicket::first();
        $this->assertSame([1, 2, 7], [$t->order_id, $t->sale_id, (int) $t->sold_by], 'the order, then the cash sale it became');
        $this->assertSame('SO-1', $r['order']['number']);
    }

    public function test_a_sale_needs_an_account_and_takes_no_seat_without_one(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        foreach ([null, 40, 999] as $bad) {
            $this->refuses(fn () => $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'cash', $bad), 'cash or bank account');
        }
        $this->assertSame(0, EventTicket::count());
    }

    public function test_complimentary_tickets_cost_nothing_need_no_account_and_leave_no_order(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $r = $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 2]], ['name' => 'Guests of the artist', 'email' => 'artist@example.com'], $this->staff(), 'comp', null);
        $this->assertSame([[], 0.0, 'valid'], [$this->placed, (float) EventTicket::sum('price'), EventTicket::first()->state]);
        $this->assertSame(['Guests of the artist', 'Guests of the artist'], array_column($r['tickets'], 'holder_name'));
        $this->assertCount(1, $this->told, 'one email, because an address was given');
        $this->assertSame('artist@example.com', $this->told[0][0]);
        $this->assertSame(3, app(\App\Services\Events\TicketHolds::class)->remaining($g->fresh()), 'they still take seats');
    }

    public function test_no_email_means_nobody_is_emailed_and_a_walk_in_has_a_name(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $r = $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'cash', 41);
        $this->assertSame('Walk-in', $r['tickets'][0]['holder_name']);
        $this->assertSame([], $this->told);
        $this->refuses(fn () => $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], ['email' => 'nope'], $this->staff(), 'cash', 41), 'email address');
    }

    public function test_the_seat_rules_hold_at_the_door_too(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['capacity' => 2]);
        $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 2]], [], $this->staff(), 'cash', 41);
        $this->refuses(fn () => $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'comp', null), 'sold out');
        $this->assertSame(2, EventTicket::count());
    }

    public function test_staff_can_sell_before_it_is_on_sale_and_after_a_ticket_sale_window_closes_but_never_when_it_is_over(): void
    {
        $draft = $this->event(['status' => Event::DRAFT]);
        $closed = $this->type($draft, ['sale_ends_at' => now()->subDay()]);
        $this->assertSame('issued', $this->box()->sell($draft, [['ticket_type_id' => $closed->id, 'quantity' => 1]], [], $this->staff(), 'cash', 41)['status']);
        $over = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED, 'currency_id' => 1, 'sales_ledger_id' => 40]);
        EventSession::create(['event_id' => $over->id, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHours(2)]);
        $t = $this->type($over);
        $this->refuses(fn () => $this->box()->sell($over, [['ticket_type_id' => $t->id, 'quantity' => 1]], [], $this->staff(), 'comp', null), 'over');
    }

    public function test_when_the_books_refuse_nothing_is_sold_and_the_seats_go_back(): void
    {
        $e = $this->event();
        $g = $this->type($e, ['capacity' => 1]);
        $this->booksFail = 'The period is locked.';
        $this->refuses(fn () => $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'cash', 41), 'period is locked');
        $this->assertSame(['released'], EventTicket::pluck('state')->all());
        $this->booksFail = null;
        $this->assertSame('issued', $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'cash', 41)['status'], 'the one seat can still be sold');
    }

    public function test_a_free_ticket_sold_for_cash_needs_no_account_and_no_order(): void
    {
        $e = $this->event();
        $free = $this->type($e, ['name' => 'RSVP', 'price' => 0]);
        $r = $this->box()->sell($e, [['ticket_type_id' => $free->id, 'quantity' => 1]], [], $this->staff(), 'cash', null);
        $this->assertSame(['issued', []], [$r['status'], $this->placed]);
    }

    public function test_a_complimentary_ticket_can_be_cancelled_but_has_no_money_to_give_back(): void
    {
        $e = $this->event();
        $g = $this->type($e);
        $this->box()->sell($e, [['ticket_type_id' => $g->id, 'quantity' => 1]], [], $this->staff(), 'comp', null);
        $el = app(\App\Services\Events\EventRefunds::class)->eligibility(EventTicket::first(), $e->fresh());
        $this->assertSame([false, true], [$el['can_request'], $el['can_cancel']]);
    }
}
