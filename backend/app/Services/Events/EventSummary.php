<?php

namespace App\Services\Events;

use App\Models\Currency;
use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventTicket;
use Illuminate\Support\Facades\DB;

/** How an event is doing: what has sold (by ticket type and by day), what it brought in, who has arrived on each date, and what has gone back. Money is the ticket price before tax. */
final class EventSummary
{
    public function __construct(private TicketHolds $holds, private CheckIn $door)
    {
    }

    /** @return array<string, mixed> */
    public function of(Event $event): array
    {
        $event->loadMissing(['sessions', 'ticketTypes']);
        $valid = EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->get();
        $taken = $this->holds->takenByType($event->id);
        $by = $this->holds->sessionsByType($event->id);
        $arrived = EventCheckin::where('event_id', $event->id)->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->get(['ticket_id', 'session_id'])->groupBy('session_id');
        $refunded = EventRefundRequest::where('event_id', $event->id)->where('status', EventRefundRequest::APPROVED)->get();
        $currency = $event->currency_id ? Currency::find($event->currency_id) : null;

        return [
            'event' => ['id' => $event->id, 'title' => $event->title, 'status' => $event->status],
            'currency' => $currency ? ['code' => $currency->code, 'symbol' => $currency->symbol ?? $currency->code] : null,
            'tickets' => ['valid' => $valid->count(), 'paid' => $valid->where('price', '>', 0)->count(), 'free' => $valid->where('price', '<=', 0)->count(),
                'held' => EventTicket::where('event_id', $event->id)->where('state', EventTicket::HELD)->where('held_until', '>', now())->count(),
                'refunded' => $refunded->count(), 'checked_in' => $arrived->flatten(1)->pluck('ticket_id')->unique()->intersect($valid->pluck('id'))->count()],
            'money' => ['sold' => round((float) $valid->sum('price'), 2), 'refunded' => round((float) $refunded->sum('amount'), 2),
                'refunds_waiting' => EventRefundRequest::where('event_id', $event->id)->where('status', EventRefundRequest::PENDING)->count()],
            'by_type' => $event->ticketTypes->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'price' => (float) $t->price, 'capacity' => $t->capacity, 'is_active' => (bool) $t->is_active,
                'sold' => $valid->where('ticket_type_id', $t->id)->count(), 'held' => max(0, ($taken[$t->id] ?? 0) - $valid->where('ticket_type_id', $t->id)->count()),
                'revenue' => round((float) $valid->where('ticket_type_id', $t->id)->sum('price'), 2), 'remaining' => $this->holds->remaining($t)])->values()->all(),
            'by_session' => $event->sessions->where('is_cancelled', false)->map(function ($s) use ($valid, $by, $arrived) {
                $expected = $valid->filter(fn ($t) => TicketHolds::covers($by, $t->ticket_type_id, $s->id));
                $in = ($arrived[$s->id] ?? collect())->pluck('ticket_id')->unique()->intersect($expected->pluck('id'))->count();

                return ['id' => $s->id, 'label' => $s->label, 'starts_at' => $s->starts_at->format('Y-m-d\TH:i'), 'expected' => $expected->count(), 'arrived' => $in, 'percent' => $expected->count() ? (int) round($in / $expected->count() * 100) : 0];
            })->values()->all(),
            'by_day' => $this->byDay($event),
        ];
    }

    /** Tickets sold and what they brought in on each of the last 30 days that had sales. @return array<int, array{date: string, tickets: int, revenue: float}> */
    private function byDay(Event $event): array
    {
        return EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->where('issued_at', '>=', now()->subDays(30)->startOfDay())->get(['issued_at', 'price'])
            ->groupBy(fn ($t) => $t->issued_at->format('Y-m-d'))->map(fn ($g, $d) => ['date' => $d, 'tickets' => $g->count(), 'revenue' => round((float) $g->sum('price'), 2)])->sortKeys()->values()->all();
    }
}
