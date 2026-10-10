<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Services\ServiceVideo;
use Illuminate\Support\Facades\DB;

/** An event as the screens want it: the fields, its dates and ticket types with what is sold and left, and what still stops it being published. */
final class EventPresenter
{
    public function __construct(private TicketHolds $holds, private EventEditor $editor)
    {
    }

    /** @return array<string, mixed> */
    public function admin(Event $e): array
    {
        $e->loadMissing(['sessions', 'ticketTypes']);
        $taken = $this->holds->takenByType($e->id);
        $bySession = $this->holds->sessionsByType($e->id);
        $valid = EventTicket::where('event_id', $e->id)->where('state', EventTicket::VALID)->selectRaw('ticket_type_id, COUNT(*) as n, SUM(price) as total')->groupBy('ticket_type_id')->get()->keyBy('ticket_type_id');

        return $this->base($e) + [
            'description' => $e->description, 'venue_address' => $e->venue_address, 'map_url' => $e->map_url, 'online_url' => $e->online_url, 'organiser' => $e->organiser, 'refund_policy' => $e->refund_policy,
            'sales_ledger_id' => $e->sales_ledger_id, 'tax_rate_id' => $e->tax_rate_id, 'location_id' => $e->location_id, 'max_per_order' => (int) $e->max_per_order,
            'allow_name_change' => (bool) $e->allow_name_change, 'refund_until' => $e->refund_until?->format('Y-m-d\TH:i'), 'video' => ServiceVideo::describe($e->video_url),
            'sessions' => $e->sessions->map(fn ($s) => ['id' => $s->id, 'label' => $s->label, 'starts_at' => $s->starts_at->format('Y-m-d\TH:i'), 'ends_at' => $s->ends_at?->format('Y-m-d\TH:i'), 'capacity' => $s->capacity, 'is_cancelled' => (bool) $s->is_cancelled])->values()->all(),
            'ticket_types' => $e->ticketTypes->map(fn ($t) => [
                'id' => $t->id, 'name' => $t->name, 'description' => $t->description, 'price' => (float) $t->price, 'capacity' => $t->capacity, 'min_per_order' => $t->min_per_order, 'max_per_order' => $t->max_per_order,
                'sale_starts_at' => $t->sale_starts_at?->format('Y-m-d\TH:i'), 'sale_ends_at' => $t->sale_ends_at?->format('Y-m-d\TH:i'), 'is_active' => (bool) $t->is_active, 'sort_order' => $t->sort_order,
                'session_ids' => $bySession[$t->id] ?? [], 'taken' => $taken[$t->id] ?? 0, 'sold' => (int) ($valid[$t->id]->n ?? 0), 'revenue' => (float) ($valid[$t->id]->total ?? 0), 'remaining' => $this->holds->remaining($t),
            ])->values()->all(),
            'problems' => $e->status === Event::PUBLISHED ? [] : $this->editor->problems($e),
        ];
    }

    /** @return array<string, mixed> one line of the events list */
    public function row(Event $e): array
    {
        $e->loadMissing(['sessions', 'ticketTypes']);
        $cap = $e->ticketTypes->where('is_active', true);
        $total = $cap->contains(fn ($t) => $t->capacity === null) ? null : (int) $cap->sum('capacity');
        $next = $e->sessions->where('is_cancelled', false)->filter(fn ($s) => ($s->ends_at ?? $s->starts_at)->isFuture())->first() ?? $e->sessions->first();

        return $this->base($e) + [
            'next_at' => $next?->starts_at?->format('Y-m-d\TH:i'), 'sessions' => $e->sessions->count(), 'over' => $e->isOver(),
            'sold' => (int) EventTicket::where('event_id', $e->id)->where('state', EventTicket::VALID)->count(), 'capacity' => $total,
            'revenue' => (float) EventTicket::where('event_id', $e->id)->where('state', EventTicket::VALID)->sum('price'),
        ];
    }

    /** @return array<string, mixed> */
    private function base(Event $e): array
    {
        return ['id' => $e->id, 'title' => $e->title, 'slug' => $e->slug, 'summary' => $e->summary, 'kind' => $e->kind, 'venue_name' => $e->venue_name, 'status' => $e->status, 'is_listed' => (bool) $e->is_listed, 'currency_id' => $e->currency_id,
            'image_url' => $e->main_image ? asset($e->main_image) : null, 'published_at' => $e->published_at?->toIso8601String()];
    }
}
