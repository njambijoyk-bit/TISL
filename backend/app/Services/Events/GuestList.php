<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use Illuminate\Support\Facades\DB;

/** What staff at the door see: the counts for the date being checked in, the latest scans, and the guest list with who has arrived. */
final class GuestList
{
    public const PER_PAGE = 50;

    public function __construct(private TicketHolds $holds, private CheckIn $door)
    {
    }

    /** @return array<string, mixed> */
    public function door(Event $event, ?int $sessionId): array
    {
        $event->loadMissing('sessions');
        $live = $event->sessions->where('is_cancelled', false)->values();
        $current = ($sessionId ? $live->firstWhere('id', $sessionId) : null) ?? $this->door->current($live);
        $by = $this->holds->sessionsByType($event->id);
        $expected = $current
            ? EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->get()->filter(fn ($t) => TicketHolds::covers($by, $t->ticket_type_id, $current->id))
            : collect();
        $arrived = $current ? EventCheckin::where('event_id', $event->id)->where('session_id', $current->id)->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->distinct()->pluck('ticket_id') : collect();
        $recent = EventCheckin::where('event_id', $event->id)->orderByDesc('id')->limit(30)->get();
        $tickets = EventTicket::whereIn('id', $recent->pluck('ticket_id')->filter())->get()->keyBy('id');
        $users = DB::table('users')->whereIn('id', $recent->pluck('checked_by')->filter())->pluck('name', 'id');

        return [
            'event' => ['id' => $event->id, 'title' => $event->title, 'status' => $event->status, 'kind' => $event->kind, 'venue_name' => $event->venue_name],
            'sessions' => $live->map(fn (EventSession $s) => ['id' => $s->id, 'label' => $s->label, 'starts_at' => $s->starts_at->format('Y-m-d\TH:i'), 'ends_at' => $s->ends_at?->format('Y-m-d\TH:i')])->all(),
            'current_session_id' => $current?->id,
            'expected' => $expected->count(), 'arrived' => $arrived->intersect($expected->pluck('id'))->count(),
            'recent' => $recent->map(fn ($c) => ['id' => $c->id, 'result' => $c->result, 'note' => $c->note, 'at' => $c->created_at->format('Y-m-d\TH:i:s'), 'by' => $users[$c->checked_by] ?? null,
                'reference' => $tickets[$c->ticket_id]->reference ?? null, 'holder_name' => isset($tickets[$c->ticket_id]) ? ($tickets[$c->ticket_id]->holder_name ?: $tickets[$c->ticket_id]->buyer_name) : null])->all(),
        ];
    }

    /**
     * @param  array{q?: ?string, state?: ?string, session_id?: ?int|string, arrived?: ?string, page?: ?int}  $f
     * @return array{data: array<int, array<string, mixed>>, total: int, page: int, last_page: int}
     */
    public function guests(Event $event, array $f): array
    {
        $q = $this->query($event, $f);
        $total = (clone $q)->count();
        $page = max(1, (int) ($f['page'] ?? 1));
        $rows = $q->orderBy('holder_name')->orderBy('id')->forPage($page, self::PER_PAGE)->get();

        return ['data' => $this->rows($event, $rows, ! empty($f['session_id']) ? (int) $f['session_id'] : null), 'total' => $total, 'page' => $page, 'last_page' => max(1, (int) ceil($total / self::PER_PAGE))];
    }

    private function query(Event $event, array $f)
    {
        $state = ($f['state'] ?? '') === 'cancelled' ? [EventTicket::CANCELLED] : (($f['state'] ?? '') === 'valid' ? [EventTicket::VALID] : [EventTicket::VALID, EventTicket::CANCELLED]);
        $q = EventTicket::with('type')->where('event_id', $event->id)->whereIn('state', $state);
        if (($s = trim((string) ($f['q'] ?? ''))) !== '') {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $s) . '%';
            $q->where(fn ($w) => $w->where('holder_name', 'like', $like)->orWhere('buyer_name', 'like', $like)->orWhere('buyer_email', 'like', $like)->orWhere('buyer_phone', 'like', $like)->orWhere('reference', 'like', $like));
        }
        $sid = ! empty($f['session_id']) ? (int) $f['session_id'] : null;
        if (($f['arrived'] ?? '') === 'yes' || ($f['arrived'] ?? '') === 'no') {
            $in = EventCheckin::where('event_id', $event->id)->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->when($sid, fn ($w) => $w->where('session_id', $sid))->select('ticket_id');
            ($f['arrived'] === 'yes') ? $q->whereIn('id', $in) : $q->whereNotIn('id', $in);
        }

        return $q;
    }

    /** @param \Illuminate\Support\Collection<int, EventTicket> $tickets @return array<int, array<string, mixed>> */
    private function rows(Event $event, $tickets, ?int $sessionId): array
    {
        $in = EventCheckin::whereIn('ticket_id', $tickets->pluck('id'))->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->orderBy('id')->get()->groupBy('ticket_id');
        $users = DB::table('users')->whereIn('id', $in->flatten()->pluck('checked_by')->filter()->unique())->pluck('name', 'id');

        return $tickets->map(function ($t) use ($in, $sessionId, $users) {
            $mine = ($in[$t->id] ?? collect())->when($sessionId, fn ($c) => $c->where('session_id', $sessionId));
            $last = $mine->last();

            return ['id' => $t->id, 'reference' => $t->reference, 'holder_name' => $t->holder_name, 'buyer_name' => $t->buyer_name, 'buyer_email' => $t->buyer_email, 'buyer_phone' => $t->buyer_phone,
                'type' => $t->type?->name, 'state' => $t->state, 'price' => (float) $t->price, 'issued_at' => $t->issued_at?->format('Y-m-d\TH:i'),
                'arrived' => $last ? ['at' => $last->created_at->format('Y-m-d\TH:i'), 'by' => $users[$last->checked_by] ?? null, 'checkin_id' => $last->id, 'times' => $mine->count()] : null];
        })->all();
    }

    /** Everyone with a ticket, one row each, for a spreadsheet. @return \Generator<int, array<int, string>> */
    public function csv(Event $event): \Generator
    {
        $sessions = $event->sessions()->orderBy('starts_at')->get();
        yield array_merge(['Reference', 'Ticket', 'State', 'Name on ticket', 'Bought by', 'Email', 'Phone', 'Price', 'Issued'], $sessions->map(fn ($s) => 'Arrived ' . $s->starts_at->format('j M H:i') . ($s->label ? " ({$s->label})" : ''))->all());
        $q = $this->query($event, []);
        foreach ($q->orderBy('holder_name')->orderBy('id')->cursor() as $t) {
            $in = EventCheckin::where('ticket_id', $t->id)->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->get()->keyBy('session_id');
            yield array_merge([$t->reference, $t->type?->name ?? '', $t->state, (string) $t->holder_name, (string) $t->buyer_name, (string) $t->buyer_email, (string) $t->buyer_phone, number_format((float) $t->price, 2, '.', ''),
                $t->issued_at?->format('Y-m-d H:i') ?? ''], $sessions->map(fn ($s) => isset($in[$s->id]) ? $in[$s->id]->created_at->format('Y-m-d H:i') : '')->all());
        }
    }
}
