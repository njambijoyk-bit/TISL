<?php

namespace Tests\Feature;

use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Events\EventSummary;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The numbers on an event's Summary: sold, held, refunded, what it brought in, who has arrived on each date. */
class EventSummaryTest extends TestCase
{
    use Concerns\CreatesEventTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createEventTables();
    }

    private function summary(Event $e): array
    {
        return app(EventSummary::class)->of($e->fresh());
    }

    private function ticket(Event $e, EventTicketType $type, array $o = []): EventTicket
    {
        return EventTicket::create($o + ['event_id' => $e->id, 'ticket_type_id' => $type->id, 'reference' => strtoupper(substr(md5(uniqid('', true)), 0, 8)), 'state' => 'valid', 'price' => $type->price, 'issued_at' => now(), 'buyer_email' => 'a@example.com']);
    }

    public function test_what_has_sold_what_is_held_and_what_it_brought_in(): void
    {
        $e = Event::create(['title' => 'Jazz night', 'status' => Event::PUBLISHED]);
        EventSession::create(['event_id' => $e->id, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHours(3)]);
        $general = EventTicketType::create(['event_id' => $e->id, 'name' => 'General', 'price' => 1000, 'capacity' => 10]);
        $rsvp = EventTicketType::create(['event_id' => $e->id, 'name' => 'RSVP', 'price' => 0]);
        $this->ticket($e, $general);
        $this->ticket($e, $general);
        $this->ticket($e, $rsvp);
        $this->ticket($e, $general, ['state' => 'held', 'held_until' => now()->addMinutes(5)]);
        $this->ticket($e, $general, ['state' => 'held', 'held_until' => now()->subMinute()]);
        $this->ticket($e, $general, ['state' => 'cancelled']);
        $refunded = $this->ticket($e, $general, ['state' => 'cancelled']);
        EventRefundRequest::create(['event_id' => $e->id, 'ticket_id' => $refunded->id, 'status' => 'approved', 'amount' => 1160]);
        EventRefundRequest::create(['event_id' => $e->id, 'ticket_id' => 999, 'status' => 'pending', 'amount' => 1000]);
        $s = $this->summary($e);
        $this->assertSame([3, 2, 1, 1, 1], [$s['tickets']['valid'], $s['tickets']['paid'], $s['tickets']['free'], $s['tickets']['held'], $s['tickets']['refunded']], 'a lapsed hold is not held');
        $this->assertSame([2000.0, 1160.0, 1], [$s['money']['sold'], $s['money']['refunded'], $s['money']['refunds_waiting']]);
        $g = collect($s['by_type'])->firstWhere('name', 'General');
        $this->assertSame([2, 1, 2000.0, 7], [$g['sold'], $g['held'], $g['revenue'], $g['remaining']], 'sold 2, 1 more being bought, 7 left of 10');
        $this->assertNull(collect($s['by_type'])->firstWhere('name', 'RSVP')['remaining']);
    }

    public function test_who_has_arrived_on_each_date_and_only_among_those_still_holding_a_ticket(): void
    {
        $e = Event::create(['title' => 'Festival', 'status' => Event::PUBLISHED]);
        $d1 = EventSession::create(['event_id' => $e->id, 'label' => 'Day 1', 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHours(3)]);
        $d2 = EventSession::create(['event_id' => $e->id, 'label' => 'Day 2', 'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHours(3)]);
        EventSession::create(['event_id' => $e->id, 'label' => 'Gone', 'starts_at' => now()->addDays(3), 'is_cancelled' => true]);
        $full = EventTicketType::create(['event_id' => $e->id, 'name' => 'Full', 'price' => 3000]);
        $day2 = EventTicketType::create(['event_id' => $e->id, 'name' => 'Day 2', 'price' => 1000]);
        DB::table('event_ticket_type_sessions')->insert(['ticket_type_id' => $day2->id, 'session_id' => $d2->id]);
        $a = $this->ticket($e, $full);
        $b = $this->ticket($e, $full);
        $c = $this->ticket($e, $day2);
        $left = $this->ticket($e, $full, ['state' => 'cancelled']);
        foreach ([[$a, $d1], [$a, $d2], [$c, $d2], [$left, $d1]] as [$t, $s]) {
            EventCheckin::create(['event_id' => $e->id, 'ticket_id' => $t->id, 'session_id' => $s->id, 'result' => 'ok']);
        }
        EventCheckin::create(['event_id' => $e->id, 'ticket_id' => $b->id, 'session_id' => $d1->id, 'result' => 'already']);
        EventCheckin::create(['event_id' => $e->id, 'ticket_id' => $b->id, 'session_id' => $d1->id, 'result' => 'undone']);
        $s = $this->summary($e);
        $this->assertSame(2, count($s['by_session']), 'a cancelled date is not listed');
        $this->assertSame([2, 1, 50], [$s['by_session'][0]['expected'], $s['by_session'][0]['arrived'], $s['by_session'][0]['percent']], 'day 1: two full passes, one came (the refunded one does not count; refused and undone scans do not)');
        $this->assertSame([3, 2, 67], [$s['by_session'][1]['expected'], $s['by_session'][1]['arrived'], $s['by_session'][1]['percent']]);
        $this->assertSame(2, $s['tickets']['checked_in'], 'a person who came on two days is one person');
    }

    public function test_sales_by_day_cover_the_last_thirty_days_in_order(): void
    {
        $e = Event::create(['title' => 'Course', 'status' => Event::PUBLISHED]);
        $t = EventTicketType::create(['event_id' => $e->id, 'name' => 'Seat', 'price' => 500]);
        $this->ticket($e, $t, ['issued_at' => now()->subDay()]);
        $this->ticket($e, $t, ['issued_at' => now()->subDays(2)->setTime(10, 0)]);
        $this->ticket($e, $t, ['issued_at' => now()->subDays(2)->setTime(18, 0)]);
        $this->ticket($e, $t, ['issued_at' => now()->subDays(45)]);
        $days = $this->summary($e)['by_day'];
        $this->assertSame([[now()->subDays(2)->format('Y-m-d'), 2, 1000.0], [now()->subDay()->format('Y-m-d'), 1, 500.0]], array_map(fn ($d) => [$d['date'], $d['tickets'], $d['revenue']], $days));
    }
}
