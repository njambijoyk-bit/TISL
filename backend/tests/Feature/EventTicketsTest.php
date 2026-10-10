<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\EventTicketController;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\User;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;
use App\Services\Events\EventCheckout;
use App\Services\Events\EventNotices;
use App\Services\Events\TicketCodes;
use App\Services\Events\TicketHolds;
use App\Services\Events\TicketIssuer;
use App\Services\Events\TicketPdf;
use App\Services\Events\TicketPresenter;
use App\Services\Notify\Notifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** A ticket as its holder has it: a code only we can make, its QR, the page, the PDF, passing it on, getting it again, and the email that carries it. */
class EventTicketsTest extends TestCase
{
    use Concerns\CreatesEventTables;

    /** @var array<int, array{0: string, 1: string, 2: string, 3: string, 4: array}> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        config(['app.frontend_url' => 'https://shop.example.com', 'app.url' => 'https://api.example.com']);
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('sendToContact')->willReturnCallback(function (array $c, string $type, string $title, string $msg, array $o = []) { $this->sent[] = ['contact:' . ($c['email'] ?? ''), $type, $title, $msg, $o]; return []; });
        $notifier->method('send')->willReturnCallback(function ($to, string $type, string $title, string $msg, array $o = []) { $this->sent[] = ['account:' . get_class($to), $type, $title, $msg, $o]; return []; });
        $this->app->instance(Notifier::class, $notifier);
    }

    private function event(array $o = []): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10, 'venue_name' => 'Alliance', 'venue_address' => 'Loita St']);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(10), 'ends_at' => now()->addDays(10)->addHours(3)]);

        return $e;
    }

    private function ticket(Event $e, array $o = []): EventTicket
    {
        $type = EventTicketType::where('event_id', $e->id)->first() ?? EventTicketType::create(['event_id' => $e->id, 'name' => 'General', 'price' => 1000]);

        return EventTicket::create($o + ['event_id' => $e->id, 'ticket_type_id' => $type->id, 'reference' => strtoupper(substr(md5(uniqid('', true)), 0, 8)), 'state' => 'valid', 'buyer_name' => 'Amina Wanjiru',
            'buyer_email' => 'amina@example.com', 'holder_name' => 'Amina Wanjiru', 'price' => 1000, 'issued_at' => now()]);
    }

    private function controller(): EventTicketController
    {
        return new EventTicketController(app(TicketPresenter::class), app(TicketPdf::class), app(EventNotices::class));
    }

    // ------------------------------------------------------------ the code

    public function test_a_ticket_code_is_ours_and_only_a_ticket_code(): void
    {
        $t = $this->ticket($this->event());
        $code = TicketCodes::code($t);
        $this->assertMatchesRegularExpression('/^tk\.[0-9A-Z]{8}\.[0-9A-Z]{13}$/', $code);
        $this->assertSame($t->id, TicketCodes::find($code)->id, 'the bare code');
        $this->assertSame($t->id, TicketCodes::find(TicketCodes::url($t))->id, 'the address in the QR');
        $this->assertSame($t->id, TicketCodes::find(strtolower($code))->id, 'typed in lower case');
        $this->assertNull(TicketCodes::find(substr($code, 0, -1) . ($code[-1] === 'A' ? 'B' : 'A')), 'an altered signature');
        $this->assertNull(TicketCodes::find(Signed::make('gv', $t->reference)), 'another kind of code with the same id is not a ticket');
        $this->assertNull(TicketCodes::find('tk.' . $t->reference . '.' . str_repeat('0', 13)), 'a guessed signature');
        $this->assertNull(TicketCodes::find(Signed::make('tk', 'ZZZZZZZZ')), 'a genuine code for a ticket that does not exist');
        $this->assertNull(TicketCodes::find('nonsense'));
    }

    public function test_the_core_scanner_knows_what_a_ticket_qr_means(): void
    {
        $t = $this->ticket($this->event());
        $resolvers = app(CodeResolvers::class);
        $this->assertSame('Event ticket', $resolvers->types()['tk']);
        $this->assertSame('/tickets/' . TicketCodes::code($t), $resolvers->publicPath(TicketCodes::url($t)), 'a phone camera opens the ticket page');
    }

    public function test_the_qr_holds_the_address_of_the_code_and_each_ticket_has_its_own(): void
    {
        $e = $this->event();
        [$a, $b] = [$this->ticket($e), $this->ticket($e)];
        $this->assertStringStartsWith('<svg', TicketCodes::qrSvg($a));
        $this->assertNotSame(TicketCodes::qrSvg($a), TicketCodes::qrSvg($b));
        $this->assertStringStartsWith("\x89PNG", TicketCodes::qrPng($a));
        $this->assertStringStartsWith('https://shop.example.com/q/tk.', TicketCodes::url($a));
    }

    // ------------------------------------------------------------ the page

    public function test_the_page_shows_the_booking_with_the_opened_ticket_first(): void
    {
        $e = $this->event();
        $a = $this->ticket($e);
        $b = $this->ticket($e, ['holder_name' => 'Baraka']);
        $other = $this->ticket($e, ['buyer_email' => 'someone@else.com']);
        $cancelled = $this->ticket($e, ['state' => 'cancelled']);
        $page = $this->controller()->show(TicketCodes::code($b))->getData(true);
        $this->assertSame([$b->reference, $a->reference], array_column($page['tickets'], 'reference'), 'the opened one first, then the buyer\'s other valid ticket; not someone else\'s, not a cancelled one');
        $this->assertSame(['Jazz night', 'Alliance'], [$page['event']['title'], $page['event']['venue_name']]);
        $this->assertStringEndsWith('/api/tickets/' . TicketCodes::code($b) . '/qr', $page['tickets'][0]['qr_url']);
        $this->assertCount(1, $page['tickets'][0]['sessions']);
        $shown = $this->controller()->show(TicketCodes::code($cancelled))->getData(true);
        $this->assertSame('cancelled', $shown['tickets'][0]['state'], 'a cancelled ticket can still be opened, and says so');
    }

    public function test_a_wrong_code_finds_nothing(): void
    {
        $this->expectException(\Symfony\Component\HttpKernel\Exception\NotFoundHttpException::class);
        $this->controller()->show('tk.AAAAAAAA.BBBBBBBBBBBBB');
    }

    public function test_the_join_link_is_for_valid_tickets_of_online_events_only(): void
    {
        $e = $this->event(['kind' => 'hybrid', 'online_url' => 'https://meet.example/room']);
        $valid = $this->ticket($e);
        $void = $this->ticket($e, ['state' => 'cancelled']);
        $this->assertSame('https://meet.example/room', $this->controller()->show(TicketCodes::code($valid))->getData(true)['tickets'][0]['join_url']);
        $this->assertNull($this->controller()->show(TicketCodes::code($void))->getData(true)['tickets'][0]['join_url']);
        $inPerson = $this->ticket($this->event(['title' => 'Gig', 'online_url' => 'https://meet.example/other']));
        $this->assertNull($this->controller()->show(TicketCodes::code($inPerson))->getData(true)['tickets'][0]['join_url'], 'an in-person event has no join link even if one was typed in');
    }

    public function test_a_day_pass_lists_only_the_dates_it_admits_to(): void
    {
        $e = $this->event();
        $second = EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(11)]);
        $day2 = EventTicketType::create(['event_id' => $e->id, 'name' => 'Day 2', 'price' => 500]);
        DB::table('event_ticket_type_sessions')->insert(['ticket_type_id' => $day2->id, 'session_id' => $second->id]);
        $t = $this->ticket($e, ['ticket_type_id' => $day2->id]);
        $s = $this->controller()->show(TicketCodes::code($t))->getData(true)['tickets'][0]['sessions'];
        $this->assertCount(1, $s);
        $this->assertSame($second->starts_at->format('Y-m-d\TH:i'), $s[0]['starts_at']);
    }

    // ------------------------------------------------------------ passing it on

    private function putReq(array $d): Request
    {
        return Request::create('/x', 'PUT', $d);
    }

    public function test_the_name_on_a_ticket_can_be_changed_until_the_event_when_it_allows(): void
    {
        $e = $this->event(['allow_name_change' => true]);
        $t = $this->ticket($e);
        $this->assertSame('Baraka', $this->controller()->rename($this->putReq(['name' => '  Baraka ']), TicketCodes::code($t))->getData(true)['holder_name']);
        $this->assertSame('Baraka', $t->fresh()->holder_name);
        $this->assertTrue($this->controller()->show(TicketCodes::code($t))->getData(true)['tickets'][0]['can_rename']);

        $locked = $this->ticket($this->event(['title' => 'Locked', 'allow_name_change' => false]));
        $r = $this->controller()->rename($this->putReq(['name' => 'X']), TicketCodes::code($locked));
        $this->assertSame([422, 'Amina Wanjiru'], [$r->getStatusCode(), $locked->fresh()->holder_name]);
        $this->assertFalse($this->controller()->show(TicketCodes::code($locked))->getData(true)['tickets'][0]['can_rename']);

        $void = $this->ticket($e, ['state' => 'cancelled']);
        $this->assertSame(422, $this->controller()->rename($this->putReq(['name' => 'X']), TicketCodes::code($void))->getStatusCode());

        $over = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED, 'allow_name_change' => true]);
        EventSession::create(['event_id' => $over->id, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHours(2)]);
        $past = $this->ticket($over);
        $this->assertSame(422, $this->controller()->rename($this->putReq(['name' => 'X']), TicketCodes::code($past))->getStatusCode(), 'once the event is over the ticket is a keepsake');
        $this->assertFalse($this->controller()->show(TicketCodes::code($past))->getData(true)['tickets'][0]['can_rename']);
    }

    // ------------------------------------------------------------ getting them again

    public function test_asking_for_tickets_again_sends_the_valid_ones_for_events_to_come_and_says_the_same_either_way(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $this->ticket($e);
        $this->ticket($e, ['state' => 'cancelled']);
        $over = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED]);
        EventSession::create(['event_id' => $over->id, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHours(2)]);
        $this->ticket($over);
        $yes = $this->controller()->resend(Request::create('/x', 'POST', ['email' => 'amina@example.com']));
        $no = $this->controller()->resend(Request::create('/x', 'POST', ['email' => 'nobody@example.com']));
        $this->assertSame($yes->getData(true), $no->getData(true), 'nothing tells a stranger whether an address has tickets');
        $this->assertCount(1, $this->sent, 'one message, for the one event still to come');
        $this->assertSame(['contact:amina@example.com', 'event_ticket', 'Your tickets for Jazz night'], array_slice($this->sent[0], 0, 3));
        $this->assertSame(2, substr_count($this->sent[0][3], 'reference'));
    }

    public function test_a_customer_sees_their_own_tickets_by_account_or_email(): void
    {
        $e = $this->event();
        $mine = $this->ticket($e, ['buyer_email' => 'me@example.com']);
        $this->ticket($e, ['buyer_email' => 'other@example.com']);
        $user = (new User)->forceFill(['id' => 9, 'email' => 'me@example.com']);
        $user->setRelation('customer', null);
        $req = Request::create('/x', 'GET');
        $req->setUserResolver(fn () => $user);
        $r = $this->controller()->mine($req)->getData(true);
        $this->assertSame([$mine->reference], array_column($r['upcoming'], 'reference'));
        $this->assertSame([], $r['past']);
        $this->assertSame('Jazz night', $r['upcoming'][0]['event']);
    }

    // ------------------------------------------------------------ the PDF

    public function test_the_pdf_has_a_page_for_each_ticket_and_says_when_one_is_void(): void
    {
        $e = $this->event(['kind' => 'online', 'online_url' => 'https://meet.example/room']);
        $a = $this->ticket($e);
        $b = $this->ticket($e, ['state' => 'cancelled', 'holder_name' => 'Gone']);
        $html = app(TicketPdf::class)->html(collect([$a, $b]));
        $this->assertSame(2, substr_count($html, 'class="page"'));
        $this->assertStringContainsString($a->reference, $html);
        $this->assertStringContainsString('data:image/png;base64,', $html);
        $this->assertStringContainsString('This ticket is cancelled', $html);
        $this->assertStringContainsString('https://meet.example/room', $html);
        $res = $this->controller()->pdf(TicketCodes::code($a));
        $this->assertSame('application/pdf', $res->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', $res->getContent());
    }

    public function test_names_are_escaped_in_the_pdf(): void
    {
        $t = $this->ticket($this->event(), ['holder_name' => '<script>alert(1)</script>']);
        $this->assertStringNotContainsString('<script>', app(TicketPdf::class)->html(collect([$t])));
    }

    // ------------------------------------------------------------ the email

    private function checkoutDeps(): EventCheckout
    {
        $this->app->instance(VoucherService::class, $this->createMock(VoucherService::class));
        $this->app->instance(GatewayPaymentService::class, $this->createMock(GatewayPaymentService::class));

        return app(EventCheckout::class);
    }

    public function test_a_free_ticket_is_emailed_at_once_with_a_link_to_its_page(): void
    {
        $e = $this->event();
        $free = EventTicketType::create(['event_id' => $e->id, 'name' => 'RSVP', 'price' => 0]);
        $r = $this->checkoutDeps()->place($e, [['ticket_type_id' => $free->id, 'quantity' => 2]], ['name' => 'Amina', 'email' => 'amina@example.com', 'phone' => ''], null, null);
        $this->assertCount(1, $this->sent, 'one email for the purchase, not one per ticket');
        [$who, $type, $title, $body, $opts] = $this->sent[0];
        $this->assertSame(['contact:amina@example.com', 'event_ticket', 'Your tickets for Jazz night'], [$who, $type, $title]);
        foreach ($r['tickets'] as $t) {
            $this->assertStringContainsString($t['reference'], $body);
            $this->assertNotNull($t['code'], 'a valid ticket carries its code for the page');
        }
        $this->assertSame('/tickets/' . $r['tickets'][0]['code'], $opts['action_url']);
        $this->assertStringContainsString('Alliance', $body);
    }

    public function test_a_signed_in_customers_tickets_go_to_their_account(): void
    {
        $e = $this->event();
        $t = $this->ticket($e, ['state' => 'held', 'customer_id' => 4]);
        Schema::create('customers', function ($c) { $c->id(); $c->string('first_name')->nullable(); $c->string('email')->nullable(); $c->softDeletes(); $c->timestamps(); });
        DB::table('customers')->insert(['id' => 4, 'first_name' => 'Amina', 'email' => 'amina@example.com']);
        app(EventNotices::class)->ticketsIssued(collect([$t]));
        $this->assertSame(['account:' . Customer::class, 'event_ticket'], array_slice($this->sent[0], 0, 2));
    }

    public function test_a_paid_purchase_is_emailed_when_the_money_arrives_and_only_once(): void
    {
        $e = $this->event();
        $t = $this->ticket($e, ['state' => 'held', 'held_until' => now()->addMinutes(10), 'order_id' => 1]);
        $order = Voucher::create(['voucher_type_id' => 1, 'meta' => ['event' => ['id' => $e->id, 'ticket_ids' => [$t->id]]]]);
        $t->update(['order_id' => $order->id]);
        $issuer = app(TicketIssuer::class);
        $issuer->orderPaid($order);
        $this->assertCount(1, $this->sent);
        $issuer->orderPaid($order);
        $this->assertCount(1, $this->sent, 'a second confirmation of the same payment sends nothing');
    }

    public function test_telling_someone_never_undoes_a_sale(): void
    {
        $e = $this->event();
        $t = $this->ticket($e, ['state' => 'held', 'held_until' => now()->addMinutes(10)]);
        $broken = $this->createMock(Notifier::class);
        $broken->method('sendToContact')->willThrowException(new \RuntimeException('mail server down'));
        $this->app->instance(Notifier::class, $broken);
        (new TicketIssuer(app(TicketHolds::class), new EventNotices($broken)));
        $order = Voucher::create(['voucher_type_id' => 1, 'meta' => ['event' => ['id' => $e->id, 'ticket_ids' => [$t->id]]]]);
        $t->update(['order_id' => $order->id]);
        $this->assertSame(1, (new TicketIssuer(app(TicketHolds::class), new EventNotices($broken)))->orderPaid($order)['issued']);
        $this->assertSame('valid', $t->fresh()->state);
    }
}
