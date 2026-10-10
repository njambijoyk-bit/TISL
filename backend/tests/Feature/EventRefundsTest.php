<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Events\EventEditor;
use App\Services\Events\EventException;
use App\Services\Events\EventNotices;
use App\Services\Events\EventRefunds;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Handing tickets back: who may ask and until when, what staff do about it, what goes into the books, and what happens to the holders when an event is cancelled or postponed. */
class EventRefundsTest extends TestCase
{
    use Concerns\CreatesEventTables;

    /** @var array<int, array> what was told to whom */
    private array $sent = [];
    /** @var array<int, array> the credit notes asked of the books */
    private array $returns = [];
    private bool $paidAtOnce = true;
    private ?string $returnFails = null;
    private array $lines;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
        config(['app.frontend_url' => 'https://shop.example.com']);
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        $this->lines = [['id' => 501, 'item_type' => 'custom', 'description' => 'Jazz night — General', 'available_quantity' => 3.0, 'available_amount' => 3000.0]];
        $books = $this->createMock(VoucherService::class);
        $books->method('paidAtOnce')->willReturnCallback(fn () => $this->paidAtOnce);
        $books->method('returnable')->willReturnCallback(fn () => ['lines' => $this->lines, 'refund' => ['ledgers' => [['id' => 41, 'name' => 'KCB Bank'], ['id' => 42, 'name' => 'Till']], 'default_id' => 41]]);
        $books->method('createReturn')->willReturnCallback(function (Voucher $sale, array $opts, ?User $by) {
            if ($this->returnFails) {
                throw new BooksException($this->returnFails);
            }
            $this->returns[] = $opts + ['sale' => $sale->id, 'by' => $by?->id];

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CN-' . count($this->returns), 'total_amount' => 1160, 'meta' => ['refunded_to' => ($opts['refund_ledger_id'] ?? null) === 42 ? 'Till' : 'KCB Bank']]);
        });
        $this->app->instance(VoucherService::class, $books);
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('sendToContact')->willReturnCallback(function (array $c, string $type, string $title, string $msg, array $o = []) { $this->sent[] = ['to' => $c['email'] ?? '', 'type' => $type, 'title' => $title, 'msg' => $msg, 'o' => $o]; return []; });
        $notifier->method('send')->willReturnCallback(function ($to, string $type, string $title, string $msg, array $o = []) { $this->sent[] = ['to' => 'staff:' . $to->id, 'type' => $type, 'title' => $title, 'msg' => $msg, 'o' => $o]; return []; });
        $this->app->instance(Notifier::class, $notifier);
        $this->app->instance(Staff::class, new class extends Staff {
            public function holding(string $permission): Collection
            {
                return collect([(new User)->forceFill(['id' => 9])]);
            }
        });
    }

    private function refunds(): EventRefunds
    {
        return app(EventRefunds::class);
    }

    private function event(array $o = []): Event
    {
        $e = Event::create($o + ['title' => 'Jazz night', 'status' => Event::PUBLISHED, 'max_per_order' => 10, 'currency_id' => 1, 'sales_ledger_id' => 40, 'venue_name' => 'Alliance']);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDays(10), 'ends_at' => now()->addDays(10)->addHours(3)]);

        return $e;
    }

    private function ticket(Event $e, array $o = []): EventTicket
    {
        $type = EventTicketType::where('event_id', $e->id)->first() ?? EventTicketType::create(['event_id' => $e->id, 'name' => 'General', 'price' => 1000]);
        $sale = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-' . (Voucher::count() + 1), 'total_amount' => 3480]);

        return EventTicket::create($o + ['event_id' => $e->id, 'ticket_type_id' => $type->id, 'reference' => strtoupper(substr(md5(uniqid('', true)), 0, 8)), 'state' => 'valid', 'buyer_name' => 'Amina Wanjiru',
            'buyer_email' => 'amina@example.com', 'holder_name' => 'Amina Wanjiru', 'price' => 1000, 'sale_id' => $sale->id, 'issued_at' => now()]);
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

    // ------------------------------------------------------------ who may ask

    public function test_the_cut_off_date_decides_until_when_a_refund_can_be_asked_for(): void
    {
        $open = $this->event(['refund_until' => now()->addDays(3)]);
        $this->assertTrue($this->refunds()->eligibility($this->ticket($open), $open)['can_request']);
        $shut = $this->event(['title' => 'Shut', 'refund_until' => now()->subDay()]);
        $r = $this->refunds()->eligibility($this->ticket($shut), $shut);
        $this->assertSame([false, 'closed'], [$r['can_request'], $r['reason']]);
        $never = $this->event(['title' => 'No cut-off']);
        $this->assertTrue($this->refunds()->eligibility($this->ticket($never), $never)['can_request'], 'no date means no cut-off');
    }

    public function test_a_cancelled_or_postponed_event_can_always_be_handed_back_but_an_event_that_is_over_never(): void
    {
        foreach ([Event::CANCELLED, Event::POSTPONED] as $status) {
            $e = $this->event(['title' => $status, 'status' => $status, 'refund_until' => now()->subDay()]);
            $this->assertTrue($this->refunds()->eligibility($this->ticket($e), $e)['can_request'], "{$status} after the cut-off");
        }
        $over = Event::create(['title' => 'Old', 'status' => Event::PUBLISHED]);
        EventSession::create(['event_id' => $over->id, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHours(2)]);
        $this->assertSame('closed', $this->refunds()->eligibility($this->ticket($over), $over)['reason']);
    }

    public function test_a_ticket_already_used_to_get_in_is_not_refunded_unless_the_event_was_cancelled(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        EventCheckin::create(['event_id' => $e->id, 'ticket_id' => $t->id, 'session_id' => 1, 'result' => 'ok']);
        $this->assertSame('used', $this->refunds()->eligibility($t, $e)['reason']);
        $e->update(['status' => Event::CANCELLED]);
        $this->assertTrue($this->refunds()->eligibility($t, $e->fresh())['can_request']);
    }

    public function test_the_state_of_an_earlier_request_is_shown_and_a_declined_one_can_be_asked_again(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->request($t, 'plans changed');
        $el = $this->refunds()->eligibility($t, $e);
        $this->assertSame(['requested', 'pending'], [$el['reason'], $el['state']]);
        $this->refuses(fn () => $this->refunds()->request($t, 'again'), 'already asked');
        $this->refunds()->decline(EventRefundRequest::first(), 'Too late', null);
        $el = $this->refunds()->eligibility($t->fresh(), $e);
        $this->assertSame([true, 'declined', 'Too late'], [$el['can_request'], $el['state'], $el['note']]);
        $this->refunds()->request($t->fresh(), 'please');
        $this->assertSame(2, EventRefundRequest::count());
    }

    public function test_a_free_ticket_is_cancelled_by_its_holder_at_once_and_the_seat_is_free(): void
    {
        $e = $this->event();
        $free = EventTicketType::create(['event_id' => $e->id, 'name' => 'RSVP', 'price' => 0, 'capacity' => 1]);
        $t = $this->ticket($e, ['ticket_type_id' => $free->id, 'price' => 0, 'sale_id' => null]);
        $r = $this->refunds()->request($t, '');
        $this->assertTrue($r['cancelled']);
        $this->assertSame(['cancelled', 0], [$t->fresh()->state, EventRefundRequest::count()]);
        $this->assertSame(1, app(\App\Services\Events\TicketHolds::class)->remaining($free->fresh()), 'the one place is free again');
    }

    public function test_asking_for_a_paid_ticket_opens_a_request_and_tells_the_people_who_decide(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $r = $this->refunds()->request($t, 'I am ill');
        $this->assertFalse($r['cancelled']);
        $req = EventRefundRequest::first();
        $this->assertSame(['pending', 'I am ill', '1000.00', 'amina@example.com'], [$req->status, $req->reason, (string) $req->amount, $req->requested_by]);
        $this->assertSame('valid', $t->fresh()->state, 'nothing changes until staff decide');
        $this->assertSame(['staff:9', 'event_refund_requested', '/admin/events?tab=refunds'], [$this->sent[0]['to'], $this->sent[0]['type'], $this->sent[0]['o']['action_url'] ?? null]);
    }

    // ------------------------------------------------------------ staff decide

    public function test_approving_credits_one_ticket_on_the_right_line_and_cancels_it(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->request($t, '');
        $credit = $this->refunds()->approve(EventRefundRequest::first(), null, 'Sorry to miss you', (new User)->forceFill(['id' => 5]));
        $this->assertSame('CN-1', $credit->voucher_number);
        $ret = $this->returns[0];
        $this->assertSame([[['item_id' => 501, 'mode' => 'return', 'quantity' => 1]], 41, 5], [$ret['lines'], $ret['refund_ledger_id'], $ret['by']], 'one unit of the right line, paid back from the ledger the money came in through');
        $this->assertSame(['cancelled', 'Refunded'], [$t->fresh()->state, $t->fresh()->cancel_reason]);
        $req = EventRefundRequest::first();
        $this->assertSame(['approved', '1160.00', 'Sorry to miss you', 5], [$req->status, (string) $req->amount, $req->decision_note, (int) $req->decided_by], 'the amount is what was really credited, with tax');
        $told = collect($this->sent)->firstWhere('type', 'event_refund');
        $this->assertSame('amina@example.com', $told['to']);
        $this->assertStringContainsString('1,160.00 (KCB Bank)', $told['msg']);
        $this->assertStringContainsString('Sorry to miss you', $told['msg']);
    }

    public function test_a_ticket_that_is_no_longer_valid_has_nothing_to_refund(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->request($t, '');
        $req = EventRefundRequest::first();
        $this->refunds()->approve($req, null, null, null);
        $el = $this->refunds()->eligibility($t->fresh(), $e);
        $this->assertSame([false, false, 'refunded'], [$el['can_request'], $el['can_cancel'], $el['reason']]);
        $released = $this->ticket($e, ['state' => 'released']);
        $this->assertSame('not_valid', $this->refunds()->eligibility($released, $e)['reason']);
        $this->refuses(fn () => $this->refunds()->request($released, ''), 'not valid');
        $other = $this->ticket($e);
        $this->refunds()->request($other, '');
        $other->update(['state' => 'cancelled']);
        $this->refuses(fn () => $this->refunds()->approve(EventRefundRequest::where('ticket_id', $other->id)->first(), null, null, null), 'no longer valid');
        $this->assertCount(1, $this->returns);
    }

    public function test_each_ticket_type_is_credited_on_its_own_line(): void
    {
        $e = $this->event();
        $vip = EventTicketType::create(['event_id' => $e->id, 'name' => 'VIP', 'price' => 4000]);
        $this->lines = [['id' => 501, 'item_type' => 'custom', 'description' => 'Jazz night — General', 'available_quantity' => 3.0, 'available_amount' => 3000.0],
            ['id' => 502, 'item_type' => 'custom', 'description' => 'Jazz night — VIP', 'available_quantity' => 1.0, 'available_amount' => 4000.0]];
        $t = $this->ticket($e, ['ticket_type_id' => $vip->id, 'price' => 4000]);
        $this->refunds()->request($t, '');
        $this->refunds()->approve(EventRefundRequest::first(), null, null, null);
        $this->assertSame(502, $this->returns[0]['lines'][0]['item_id'], 'the VIP ticket is taken off the VIP line, not the first line');
    }

    public function test_staff_can_choose_another_ledger_and_a_sale_not_paid_at_the_till_names_none(): void
    {
        $e = $this->event();
        $this->refunds()->request($this->ticket($e), '');
        $this->refunds()->approve(EventRefundRequest::first(), 42, null, null);
        $this->assertSame(42, $this->returns[0]['refund_ledger_id']);
        $this->paidAtOnce = false;
        $this->refunds()->request($this->ticket($e), '');
        $this->refunds()->approve(EventRefundRequest::orderByDesc('id')->first(), 42, null, null);
        $this->assertArrayNotHasKey('refund_ledger_id', $this->returns[1], 'money can only go back at once for a sale paid at the till');
    }

    public function test_the_line_is_found_by_what_the_order_remembers_even_if_the_title_was_edited(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $order = Voucher::create(['voucher_type_id' => 1, 'meta' => ['event' => ['lines' => [['ticket_type_id' => $t->ticket_type_id, 'description' => 'Old title — General']]]]]);
        $t->update(['order_id' => $order->id]);
        $this->lines[0]['description'] = 'Old title — General';
        $e->update(['title' => 'A new title']);
        $this->refunds()->request($t, '');
        $this->refunds()->approve(EventRefundRequest::first(), null, null, null);
        $this->assertSame(501, $this->returns[0]['lines'][0]['item_id']);
    }

    public function test_when_the_books_refuse_nothing_changes(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->request($t, '');
        $this->returnFails = 'The period is locked.';
        $this->refuses(fn () => $this->refunds()->approve(EventRefundRequest::first(), null, null, null), 'period is locked');
        $this->assertSame(['valid', 'pending'], [$t->fresh()->state, EventRefundRequest::first()->status]);
        $this->returnFails = null;
        $this->lines[0]['available_quantity'] = 0.0;
        $this->refuses(fn () => $this->refunds()->approve(EventRefundRequest::first(), null, null, null), 'nothing left of this ticket');
        $t->update(['sale_id' => null]);
        $this->refuses(fn () => $this->refunds()->approve(EventRefundRequest::first(), null, null, null), 'no paid sale');
        $this->assertSame([], $this->returns);
    }

    public function test_a_request_is_decided_once(): void
    {
        $e = $this->event();
        $this->refunds()->request($this->ticket($e), '');
        $req = EventRefundRequest::first();
        $this->refunds()->approve($req, null, null, null);
        $this->refuses(fn () => $this->refunds()->approve($req, null, null, null), 'already been decided');
        $this->refuses(fn () => $this->refunds()->decline($req, 'x', null), 'already been decided');
        $this->assertCount(1, $this->returns, 'the money went back once');
    }

    public function test_declining_needs_a_reason_the_buyer_will_read_and_leaves_the_ticket_valid(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->request($t, '');
        $this->refuses(fn () => $this->refunds()->decline(EventRefundRequest::first(), '  ', null), 'Say why');
        $this->refunds()->decline(EventRefundRequest::first(), 'Tickets are not refundable after the show started.', (new User)->forceFill(['id' => 5]));
        $this->assertSame(['declined', 'valid', 5], [EventRefundRequest::first()->status, $t->fresh()->state, (int) EventRefundRequest::first()->decided_by]);
        $told = collect($this->sent)->firstWhere('type', 'event_refund');
        $this->assertStringContainsString('not refundable after the show started', $told['msg']);
        $this->assertStringContainsString('still valid', $told['msg']);
        $this->assertSame([], $this->returns);
    }

    public function test_staff_can_refund_a_ticket_for_someone_who_phoned(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $this->refunds()->refundNow($t, null, null, (new User)->forceFill(['id' => 5]));
        $this->assertSame(['cancelled', 'approved', 'staff #5'], [$t->fresh()->state, EventRefundRequest::first()->status, EventRefundRequest::first()->requested_by]);
        $this->refuses(fn () => $this->refunds()->refundNow($t->fresh(), null, null, null), 'not valid');
        $waiting = $this->ticket($e);
        $this->refunds()->request($waiting, 'ill');
        $this->refunds()->refundNow($waiting, null, null, null);
        $this->assertSame(1, EventRefundRequest::where('ticket_id', $waiting->id)->count(), 'the buyer\'s own request is the one approved, not a second one');
    }

    public function test_the_waiting_list_shows_where_money_can_go_back_from_and_what_is_blocked(): void
    {
        $e = $this->event();
        $a = $this->ticket($e);
        $b = $this->ticket($e, ['sale_id' => null]);
        $this->refunds()->request($a, 'x');
        $this->refunds()->request($b, 'y');
        $rows = collect($this->refunds()->list());
        $this->assertSame([41, 2], [$rows->firstWhere('ticket.id', $a->id)['refund']['default_id'], count($rows->firstWhere('ticket.id', $a->id)['refund']['ledgers'])]);
        $this->assertStringContainsString('no paid sale', $rows->firstWhere('ticket.id', $b->id)['blocked']);
        $this->refunds()->decline(EventRefundRequest::where('ticket_id', $a->id)->first(), 'No', null);
        $this->assertCount(1, $this->refunds()->list(), 'only what is waiting by default');
        $this->assertCount(2, $this->refunds()->list(null));
        $this->assertCount(1, $this->refunds()->list('declined'));
    }

    // ------------------------------------------------------------ the event changes

    public function test_cancelling_the_event_opens_every_paid_refund_cancels_free_tickets_frees_held_seats_and_tells_each_buyer_once(): void
    {
        $e = $this->event();
        $paid1 = $this->ticket($e);
        $paid2 = $this->ticket($e);
        $other = $this->ticket($e, ['buyer_email' => 'baraka@example.com', 'buyer_name' => 'Baraka']);
        $free = EventTicketType::create(['event_id' => $e->id, 'name' => 'RSVP', 'price' => 0]);
        $rsvp = $this->ticket($e, ['ticket_type_id' => $free->id, 'price' => 0, 'buyer_email' => 'free@example.com']);
        $held = $this->ticket($e, ['state' => 'held', 'held_until' => now()->addMinutes(5)]);
        app(EventEditor::class)->cancel($e, 5);
        $this->assertSame('cancelled', $e->fresh()->status);
        $this->assertEqualsCanonicalizing([$paid1->id, $paid2->id, $other->id], EventRefundRequest::where('status', 'pending')->pluck('ticket_id')->all(), 'a refund waits for every paid ticket');
        $this->assertSame('The event was cancelled', EventRefundRequest::first()->reason);
        $this->assertSame(['valid', 'cancelled', 'released'], [$paid1->fresh()->state, $rsvp->fresh()->state, $held->fresh()->state], 'paid tickets stay valid until refunded; free ones end; held seats go back');
        $mail = collect($this->sent)->where('type', 'event_changed');
        $this->assertEqualsCanonicalizing(['amina@example.com', 'baraka@example.com'], $mail->pluck('to')->all(), 'one message per buyer, only to those with a valid ticket');
        $this->assertStringContainsString('refund', $mail->firstWhere('to', 'amina@example.com')['msg']);
        app(EventEditor::class)->cancel($e->fresh(), 5);
        $this->assertSame(3, EventRefundRequest::count(), 'cancelling again opens nothing twice');
    }

    public function test_approving_all_goes_on_past_a_problem_and_reports_it(): void
    {
        $e = $this->event();
        $a = $this->ticket($e);
        $b = $this->ticket($e, ['sale_id' => null]);
        $c = $this->ticket($e);
        $this->refunds()->openForEvent($e);
        $r = $this->refunds()->approveAll($e, null, null);
        $this->assertSame(2, $r['done']);
        $this->assertSame([$b->reference], array_column($r['failed'], 'ticket'));
        $this->assertSame(['cancelled', 'valid', 'cancelled'], [$a->fresh()->state, $b->fresh()->state, $c->fresh()->state]);
    }

    public function test_postponing_stops_sales_tells_the_holders_and_putting_it_on_sale_again_tells_them_the_new_date(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $this->ticket($e, ['buyer_email' => 'baraka@example.com']);
        $editor = app(EventEditor::class);
        $this->refuses(fn () => $editor->postpone($this->event(['title' => 'Draft', 'status' => Event::DRAFT])), 'on sale can be postponed');
        $editor->postpone($e, 5);
        $this->assertSame('postponed', $e->fresh()->status);
        $this->assertFalse($e->fresh()->isOnSale(), 'nothing can be bought while it is postponed');
        $this->assertSame(2, collect($this->sent)->where('type', 'event_changed')->where('title', 'Jazz night has been postponed')->count());
        EventSession::where('event_id', $e->id)->update(['starts_at' => now()->addDays(40), 'ends_at' => now()->addDays(40)->addHours(3)]);
        $this->sent = [];
        $editor->publish($e->fresh(), 5);
        $this->assertSame('published', $e->fresh()->status);
        $again = collect($this->sent)->where('title', 'Jazz night has a new date');
        $this->assertSame(2, $again->count());
        $this->assertStringContainsString(now()->addDays(40)->format('D j M Y'), $again->first()['msg']);
    }

    public function test_staff_can_tell_every_holder_something(): void
    {
        $e = $this->event();
        $this->ticket($e);
        $this->ticket($e);
        $this->ticket($e, ['state' => 'cancelled', 'buyer_email' => 'gone@example.com']);
        $n = app(EventNotices::class)->eventMessage($e, 'Doors now open at 5.30pm.');
        $this->assertSame(1, $n, 'one buyer with valid tickets; a cancelled ticket is not told');
        $this->assertSame('Doors now open at 5.30pm.', $this->sent[0]['msg']);
        $this->assertStringStartsWith('/tickets/tk.', $this->sent[0]['o']['action_url']);
    }

    // ------------------------------------------------------------ the doors

    public function test_the_holders_door_answers_in_words_and_never_leaks_an_error(): void
    {
        $e = $this->event();
        $t = $this->ticket($e);
        $c = new \App\Http\Controllers\Api\EventTicketController(app(\App\Services\Events\TicketPresenter::class), app(\App\Services\Events\TicketPdf::class), app(EventNotices::class), $this->refunds());
        $code = \App\Services\Events\TicketCodes::code($t);
        $req = fn (array $d = []) => \Illuminate\Http\Request::create('/x', 'POST', $d);
        $ok = $c->refund($req(['reason' => 'ill']), $code);
        $this->assertSame([200, false], [$ok->getStatusCode(), $ok->getData(true)['cancelled']]);
        $again = $c->refund($req(), $code);
        $this->assertSame(422, $again->getStatusCode());
        $this->assertStringContainsString('already asked', $again->getData(true)['message']);
        $page = $c->show($code)->getData(true);
        $this->assertSame(['pending', true], [$page['tickets'][0]['refund']['state'], $page['event']['refund_open']]);
    }

    public function test_the_staff_door_lists_approves_declines_and_approves_all(): void
    {
        $e = $this->event();
        $a = $this->ticket($e);
        $b = $this->ticket($e);
        $c = $this->ticket($e);
        foreach ([$a, $b, $c] as $t) {
            $this->refunds()->request($t, 'x');
        }
        $door = new \App\Http\Controllers\Api\EventRefundController($this->refunds());
        $as = fn (array $d = [], string $m = 'POST') => tap(\Illuminate\Http\Request::create('/x', $m, $d), fn ($r) => $r->setUserResolver(fn () => (new User)->forceFill(['id' => 5])));
        $this->assertCount(3, $door->index($as([], 'GET'))->getData(true)['data']);
        $first = EventRefundRequest::orderBy('id')->first();
        $this->assertStringContainsString('Refunded: credit note CN-1', $door->approve($as(['refund_ledger_id' => 42]), $first->id)->getData(true)['message']);
        $this->assertSame(42, $this->returns[0]['refund_ledger_id']);
        try {
            $door->decline($as(['note' => '']), $first->id + 1);
            $this->fail('a decline needs a note');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertSame('pending', EventRefundRequest::find($first->id + 1)->status);
        }
        $second = EventRefundRequest::where('status', 'pending')->orderBy('id')->first();
        $this->assertSame(200, $door->decline($as(['note' => 'No']), $second->id)->getStatusCode());
        $this->assertSame(422, $door->approve($as(), $first->id)->getStatusCode(), 'a decided request is refused in words');
        $all = $door->approveAll($as(), $e->id)->getData(true);
        $this->assertSame([1, []], [$all['done'], $all['failed']]);
        $this->assertSame(200, $door->refundTicket($as(), $e->id, $this->ticket($e)->id)->getStatusCode());
        $this->assertCount(0, $door->index($as([], 'GET'))->getData(true)['data'], 'nothing is waiting');
    }
}
