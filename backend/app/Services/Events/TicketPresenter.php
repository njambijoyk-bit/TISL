<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use Illuminate\Support\Collection;

/** A ticket as its holder sees it: the event, the dates it admits to, its code and, for an online event, the link to join (only while the ticket is valid). */
final class TicketPresenter
{
    public function __construct(private TicketHolds $holds)
    {
    }

    /** @return Collection<int, EventTicket> the booking: the ticket that was opened first, then the buyer's other valid tickets for the same event */
    public function booking(EventTicket $opened): Collection
    {
        $others = $opened->buyer_email
            ? EventTicket::where('event_id', $opened->event_id)->where('buyer_email', $opened->buyer_email)->where('state', EventTicket::VALID)->where('id', '!=', $opened->id)->orderBy('id')->get()
            : collect();

        return collect([$opened])->merge($others)->values();
    }

    /** @return array<string, mixed> */
    public function event(Event $e): array
    {
        $e->loadMissing('sessions');

        return ['title' => $e->title, 'slug' => $e->slug, 'kind' => $e->kind, 'status' => $e->status, 'image_url' => $e->main_image ? asset($e->main_image) : null, 'venue_name' => $e->venue_name,
            'venue_address' => $e->venue_address, 'map_url' => $e->map_url, 'organiser' => $e->organiser, 'over' => $e->isOver(), 'allow_name_change' => (bool) $e->allow_name_change,
            'refund_open' => $e->refundOpen() && ! $e->isOver(), 'refund_until' => $e->refund_until?->format('Y-m-d\TH:i'), 'refund_policy' => $e->refund_policy,
            'note' => (string) (EventSettings::all()['ticket_note'] ?? '')];
    }

    /** @return array<string, mixed> */
    public function ticket(EventTicket $t, Event $e): array
    {
        $valid = $t->state === EventTicket::VALID;
        $by = $this->holds->sessionsByType($e->id);
        $admits = $e->sessions->filter(fn (EventSession $s) => TicketHolds::covers($by, $t->ticket_type_id, $s->id));

        return ['code' => TicketCodes::code($t), 'reference' => $t->reference, 'state' => $t->state, 'holder_name' => $t->holder_name, 'type' => $t->type?->name, 'price' => (float) $t->price,
            'qr_url' => url('/api/tickets/' . TicketCodes::code($t) . '/qr'), 'can_rename' => $valid && $e->allow_name_change && ! $e->isOver(),
            'join_url' => $valid && in_array($e->kind, ['online', 'hybrid'], true) && trim((string) $e->online_url) !== '' ? $e->online_url : null,
            'sessions' => $admits->map(fn ($s) => ['label' => $s->label, 'starts_at' => $s->starts_at->format('Y-m-d\TH:i'), 'ends_at' => $s->ends_at?->format('Y-m-d\TH:i'), 'is_cancelled' => (bool) $s->is_cancelled])->values()->all()];
    }

    /** @return array<string, mixed> everything the ticket page shows */
    public function page(EventTicket $opened): array
    {
        $e = Event::withTrashed()->with('sessions')->findOrFail($opened->event_id);

        return ['event' => $this->event($e), 'tickets' => $this->booking($opened)->map(fn ($t) => $this->ticket($t, $e))->values()->all()];
    }
}
