<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The numbers: how many seats of each ticket type and each session are taken, and the one rule that matters, that the last seat can never be sold twice. A buyer first HOLDS
 * seats (kept for a few minutes while they pay); paying turns the hold into valid tickets; a hold that runs out is released. Everything that counts seats counts "valid, or
 * held and not run out", so a lapsed hold frees its seat without anything having to run.
 */
final class TicketHolds
{
    private const REF = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    // ------------------------------------------------------------ counting

    /** seats taken per ticket type id @return array<int, int> */
    public function takenByType(int $eventId): array
    {
        return EventTicket::where('event_id', $eventId)->takingASeat()->selectRaw('ticket_type_id, COUNT(*) as n')->groupBy('ticket_type_id')->pluck('n', 'ticket_type_id')->map(fn ($n) => (int) $n)->all();
    }

    /** which session ids each ticket type admits to (empty = every session). @return array<int, int[]> */
    public function sessionsByType(int $eventId): array
    {
        return DB::table('event_ticket_type_sessions as p')->join('event_ticket_types as t', 't.id', '=', 'p.ticket_type_id')->where('t.event_id', $eventId)
            ->get(['p.ticket_type_id', 'p.session_id'])->groupBy('ticket_type_id')->map(fn ($g) => $g->pluck('session_id')->map(fn ($i) => (int) $i)->all())->all();
    }

    /** does the ticket type admit to the session? */
    public static function covers(array $sessionsByType, int $typeId, int $sessionId): bool
    {
        return empty($sessionsByType[$typeId]) || in_array($sessionId, $sessionsByType[$typeId], true);
    }

    /** Seats left of a ticket type (null = no limit), counting the type's own limit and the room left in every session it admits to. */
    public function remaining(EventTicketType $type): ?int
    {
        $left = $this->roomFor($type->event_id, [$type->id => $type]);

        return $left[$type->id];
    }

    /**
     * @param  array<int, EventTicketType>  $types  keyed by id
     * @return array<int, ?int> id => seats left (null = unlimited)
     */
    private function roomFor(int $eventId, array $types): array
    {
        $taken = $this->takenByType($eventId);
        $bySession = $this->sessionsByType($eventId);
        $sessions = EventSession::where('event_id', $eventId)->where('is_cancelled', false)->get()->keyBy('id');
        $allTypes = EventTicketType::where('event_id', $eventId)->get()->keyBy('id');
        $out = [];
        foreach ($types as $id => $type) {
            $room = $type->capacity === null ? null : max(0, $type->capacity - ($taken[$id] ?? 0));
            foreach ($sessions as $s) {
                if ($s->capacity === null || ! self::covers($bySession, $id, $s->id)) {
                    continue;
                }
                $used = 0;
                foreach ($allTypes as $tid => $_) {
                    if (self::covers($bySession, $tid, $s->id)) {
                        $used += $taken[$tid] ?? 0;
                    }
                }
                $sessionRoom = max(0, $s->capacity - $used);
                $room = $room === null ? $sessionRoom : min($room, $sessionRoom);
            }
            $out[$id] = $room;
        }

        return $out;
    }

    // ------------------------------------------------------------ holding

    /**
     * Reserve seats for a buyer. `$wanted` is ticket type id => how many. Everything is checked and counted under a lock, so two buyers can never both get the last seat.
     *
     * @param  array<int, int>  $wanted
     * @param  array{name?: ?string, email?: ?string, phone?: ?string, customer_id?: ?int}  $buyer
     * @return Collection<int, EventTicket>
     */
    public function hold(Event $event, array $wanted, array $buyer, ?int $soldBy = null, ?int $minutes = null): Collection
    {
        $wanted = array_filter(array_map('intval', $wanted), fn ($n) => $n > 0);
        if (! $wanted) {
            throw new EventException('Choose how many tickets you want.');
        }
        $minutes ??= (int) EventSettings::all()['hold_minutes'];

        return DB::transaction(function () use ($event, $wanted, $buyer, $soldBy, $minutes) {
            EventTicketType::where('event_id', $event->id)->orderBy('id')->lockForUpdate()->get();   // one buyer at a time per event while seats are counted
            $event = Event::with('sessions')->findOrFail($event->id);
            if ($event->status !== Event::PUBLISHED && $soldBy === null) {
                throw new EventException($event->status === Event::CANCELLED ? 'This event has been cancelled.' : 'Tickets for this event are not on sale.');
            }
            if ($event->isOver()) {
                throw new EventException('This event is over.');
            }
            if ($event->sessions->where('is_cancelled', false)->isEmpty()) {
                throw new EventException('This event has no dates yet.');
            }
            $types = EventTicketType::where('event_id', $event->id)->whereIn('id', array_keys($wanted))->get()->keyBy('id');
            if ($types->count() !== count($wanted)) {
                throw new EventException('One of those ticket types is not part of this event.');
            }
            $total = array_sum($wanted);
            if ($total > (int) $event->max_per_order) {
                throw new EventException("You can buy up to {$event->max_per_order} tickets at a time.");
            }
            $room = $this->roomFor($event->id, $types->all());
            foreach ($wanted as $id => $n) {
                $t = $types[$id];
                if ($soldBy === null && ! $t->onSaleNow()) {
                    throw new EventException("{$t->name} tickets are not on sale right now.");
                }
                if ($n < $t->min_per_order) {
                    throw new EventException("{$t->name}: the least you can buy is {$t->min_per_order}.");
                }
                if ($t->max_per_order !== null && $n > $t->max_per_order) {
                    throw new EventException("{$t->name}: the most you can buy is {$t->max_per_order}.");
                }
                if ($room[$id] !== null && $n > $room[$id]) {
                    throw new EventException($room[$id] === 0 ? "{$t->name} is sold out." : "Only {$room[$id]} {$t->name} ticket" . ($room[$id] === 1 ? ' is' : 's are') . ' left.');
                }
            }
            $this->assertSessionRoom($event, $types, $wanted);

            $made = collect();
            foreach ($wanted as $id => $n) {
                for ($i = 0; $i < $n; $i++) {
                    $made->push(EventTicket::create([
                        'event_id' => $event->id, 'ticket_type_id' => $id, 'reference' => $this->newReference(), 'state' => EventTicket::HELD, 'held_until' => now()->addMinutes($minutes),
                        'customer_id' => $buyer['customer_id'] ?? null, 'buyer_name' => $buyer['name'] ?? null, 'buyer_email' => $buyer['email'] ?? null, 'buyer_phone' => $buyer['phone'] ?? null,
                        'holder_name' => $buyer['name'] ?? null, 'price' => $types[$id]->price, 'sold_by' => $soldBy,
                    ]));
                }
            }

            return $made;
        });
    }

    /** The room left in a session is shared by every ticket type that admits to it: what is wanted across all of them must fit together. */
    private function assertSessionRoom(Event $event, Collection $types, array $wanted): void
    {
        $taken = $this->takenByType($event->id);
        $bySession = $this->sessionsByType($event->id);
        $allIds = EventTicketType::where('event_id', $event->id)->pluck('id')->all();
        foreach ($event->sessions->where('is_cancelled', false) as $s) {
            if ($s->capacity === null) {
                continue;
            }
            $used = 0;
            foreach ($allIds as $tid) {
                if (self::covers($bySession, $tid, $s->id)) {
                    $used += $taken[$tid] ?? 0;
                }
            }
            $adding = 0;
            foreach ($wanted as $id => $n) {
                if (self::covers($bySession, $id, $s->id)) {
                    $adding += $n;
                }
            }
            if ($used + $adding > $s->capacity) {
                $left = max(0, $s->capacity - $used);
                $when = ($s->label ?: $s->starts_at->format('D j M, H:i'));
                throw new EventException($left === 0 ? "{$when} is full." : "Only {$left} place" . ($left === 1 ? ' is' : 's are') . " left for {$when}.");
            }
        }
    }

    // ------------------------------------------------------------ what happens next

    /** Paid, or free: the held tickets become valid. @param iterable<EventTicket> $tickets */
    public function issue(iterable $tickets, ?int $orderId = null, ?int $saleId = null): int
    {
        $n = 0;
        foreach ($tickets as $t) {
            $fresh = EventTicket::whereKey($t->id)->lockForUpdate()->first();
            if (! $fresh || $fresh->state === EventTicket::VALID) {
                continue;
            }
            if (! in_array($fresh->state, [EventTicket::HELD, EventTicket::RELEASED], true)) {
                continue;   // cancelled: staff took it back; nothing to issue
            }
            $fresh->update(['state' => EventTicket::VALID, 'held_until' => null, 'issued_at' => now(), 'order_id' => $orderId ?? $fresh->order_id, 'sale_id' => $saleId ?? $fresh->sale_id]);
            $n++;
        }

        return $n;
    }

    /** Payment arrived after the hold ran out: take the seats again if they are still free. Returns true when every ticket got its seat back. @param iterable<EventTicket> $tickets */
    public function reclaim(iterable $tickets): bool
    {
        return DB::transaction(function () use ($tickets) {
            $tickets = collect($tickets);
            $released = $tickets->filter(fn ($t) => EventTicket::whereKey($t->id)->value('state') === EventTicket::RELEASED);
            if ($released->isEmpty()) {
                return true;
            }
            $eventId = $released->first()->event_id;
            EventTicketType::where('event_id', $eventId)->orderBy('id')->lockForUpdate()->get();
            $types = EventTicketType::where('event_id', $eventId)->get()->keyBy('id');
            $room = $this->roomFor($eventId, $types->all());
            $need = $released->groupBy('ticket_type_id')->map->count();
            foreach ($need as $id => $n) {
                if ($room[$id] !== null && $n > $room[$id]) {
                    return false;
                }
            }
            foreach ($released as $t) {
                EventTicket::whereKey($t->id)->update(['state' => EventTicket::HELD, 'held_until' => now()->addMinutes(5)]);
            }

            return true;
        });
    }

    /** Holds that ran out: marked released (the seat was already free the moment the hold lapsed). Returns the order ids that were waiting on them. @return int[] */
    public function releaseExpired(): array
    {
        $expired = EventTicket::where('state', EventTicket::HELD)->where('held_until', '<=', now())->get();
        if ($expired->isEmpty()) {
            return [];
        }
        EventTicket::whereIn('id', $expired->pluck('id'))->update(['state' => EventTicket::RELEASED]);

        return $expired->pluck('order_id')->filter()->unique()->values()->map(fn ($i) => (int) $i)->all();
    }

    /** The buyer did not go through with it (the payment could not even be started): the held seats go back at once. @param iterable<EventTicket> $tickets */
    public function release(iterable $tickets): void
    {
        $ids = collect($tickets)->pluck('id')->all();
        if ($ids) {
            EventTicket::whereIn('id', $ids)->where('state', EventTicket::HELD)->update(['state' => EventTicket::RELEASED, 'held_until' => null]);
        }
    }

    /** A paid ticket is cancelled (refunded, or staff took it back): the seat goes back and the code stops working. */
    public function cancel(EventTicket $ticket, ?string $reason = null): void
    {
        if (! in_array($ticket->state, [EventTicket::VALID, EventTicket::HELD], true)) {
            throw new EventException('This ticket is already ' . $ticket->state . '.');
        }
        $ticket->update(['state' => EventTicket::CANCELLED, 'cancelled_at' => now(), 'cancel_reason' => $reason, 'held_until' => null]);
    }

    private function newReference(): string
    {
        do {
            $r = '';
            for ($i = 0; $i < 8; $i++) {
                $r .= self::REF[random_int(0, 31)];
            }
        } while (EventTicket::where('reference', $r)->exists());

        return $r;
    }
}
