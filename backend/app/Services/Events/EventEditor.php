<?php

namespace App\Services\Events;

use App\Models\Books\Ledger;
use App\Models\Events\Event;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Services\Books\LedgerService;
use Illuminate\Support\Facades\DB;

/**
 * What staff do to an event: save it with its dates and ticket types in one go, publish it (only when it can really be sold), take it down, cancel it. Anything that would hurt
 * people who already hold tickets is refused with the reason (deleting a date or a ticket type that has tickets, lowering a limit under what is sold).
 */
final class EventEditor
{
    private const EVENT_FIELDS = ['title', 'summary', 'description', 'kind', 'venue_name', 'venue_address', 'map_url', 'online_url', 'organiser', 'is_listed', 'currency_id', 'sales_ledger_id', 'tax_rate_id',
        'location_id', 'max_per_order', 'refund_until', 'refund_policy', 'allow_name_change'];

    public function __construct(private TicketHolds $holds, private LedgerService $ledgers)
    {
    }

    /**
     * @param  array<string, mixed>  $d  the event's fields, `sessions` [{id?, key?, label, starts_at, ends_at, capacity, is_cancelled}] and `ticket_types` [{id?, name, price, capacity, …, session_ids: [id or key]}]
     */
    public function save(?Event $event, array $d, ?int $by): Event
    {
        return DB::transaction(function () use ($event, $d, $by) {
            $fields = array_intersect_key($d, array_flip(self::EVENT_FIELDS));
            $this->validateFields($fields, $event);
            if ($event) {
                $event->update($fields + ['updated_by' => $by]);
            } else {
                if (empty($fields['title'])) {
                    throw new EventException('Give the event a title.');
                }
                $event = Event::create($fields + ['status' => Event::DRAFT, 'created_by' => $by, 'updated_by' => $by]);
            }
            $keys = array_key_exists('sessions', $d) ? $this->syncSessions($event, (array) $d['sessions']) : [];
            if (array_key_exists('ticket_types', $d)) {
                $this->syncTypes($event, (array) $d['ticket_types'], $keys);
            }

            return $event->fresh(['sessions', 'ticketTypes']);
        });
    }

    /** @param array<string, mixed> $f */
    private function validateFields(array &$f, ?Event $event): void
    {
        if (array_key_exists('title', $f) && trim((string) $f['title']) === '') {
            throw new EventException('Give the event a title.');
        }
        if (isset($f['kind']) && ! isset(Event::KINDS[$f['kind']])) {
            throw new EventException('The event is in person, online or both.');
        }
        if (isset($f['max_per_order']) && ((int) $f['max_per_order'] < 1 || (int) $f['max_per_order'] > 100)) {
            throw new EventException('Tickets per order is 1 to 100.');
        }
        foreach (['map_url', 'online_url'] as $url) {
            if (! empty($f[$url]) && ! preg_match('#^https?://#i', (string) $f[$url])) {
                throw new EventException('A web address must start with http:// or https://.');
            }
        }
        foreach (['title', 'summary', 'venue_name', 'venue_address', 'organiser'] as $k) {
            if (isset($f[$k])) {
                $f[$k] = trim((string) $f[$k]);
            }
        }
        if (! empty($f['sales_ledger_id'])) {
            $this->assertIncomeLedger((int) $f['sales_ledger_id']);
        }
    }

    /** Ticket money is income: a customer's or supplier's account, cash and bank are moved by receipts and payments, never by a sales line. */
    public function assertIncomeLedger(int $id): void
    {
        $l = Ledger::find($id) ?? throw new EventException('That sales account was not found.');
        foreach (['Sundry Debtors', 'Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'] as $group) {
            if ($this->ledgers->isUnderGroup($l, $group)) {
                throw new EventException("Ticket sales can not be booked to {$l->name}: choose an income account.");
            }
        }
    }

    /** @return array<string, int> temporary key => session id */
    private function syncSessions(Event $event, array $rows): array
    {
        $existing = $event->sessions()->get()->keyBy('id');
        $live = $this->liveTickets($event->id) > 0;
        $keep = [];
        $keys = [];
        foreach ($rows as $r) {
            if (empty($r['starts_at'])) {
                throw new EventException('Every date needs a start.');
            }
            $starts = \Illuminate\Support\Carbon::parse($r['starts_at']);
            $ends = ! empty($r['ends_at']) ? \Illuminate\Support\Carbon::parse($r['ends_at']) : null;
            if ($ends && $ends->lt($starts)) {
                throw new EventException('A date can not end before it starts.');
            }
            if (isset($r['capacity']) && $r['capacity'] !== '' && $r['capacity'] !== null && (int) $r['capacity'] < 1) {
                throw new EventException('A date holds at least 1 person (leave it empty for no limit).');
            }
            $row = ['label' => ($r['label'] ?? null) ?: null, 'starts_at' => $starts, 'ends_at' => $ends, 'capacity' => ($r['capacity'] ?? '') === '' ? null : (int) $r['capacity'], 'is_cancelled' => ! empty($r['is_cancelled'])];
            if (! empty($r['id']) && $existing->has((int) $r['id'])) {
                $s = $existing[(int) $r['id']];
                $s->update($row);
            } else {
                $s = EventSession::create($row + ['event_id' => $event->id]);
            }
            $keep[] = $s->id;
            if (! empty($r['key'])) {
                $keys[(string) $r['key']] = $s->id;
            }
        }
        foreach ($existing->keys()->diff($keep) as $gone) {
            if ($live || DB::table('event_checkins')->where('session_id', $gone)->exists()) {
                throw new EventException('A date that people already have tickets for can not be deleted: mark it cancelled instead.');
            }
            DB::table('event_ticket_type_sessions')->where('session_id', $gone)->delete();
            $existing[$gone]->delete();
        }

        return $keys;
    }

    /** @param array<string, int> $keys */
    private function syncTypes(Event $event, array $rows, array $keys): void
    {
        $existing = $event->ticketTypes()->get()->keyBy('id');
        $sessionIds = $event->sessions()->pluck('id')->map(fn ($i) => (int) $i)->all();
        $keep = [];
        foreach ($rows as $n => $r) {
            $name = trim((string) ($r['name'] ?? ''));
            if ($name === '') {
                throw new EventException('Every ticket type needs a name.');
            }
            $price = round((float) ($r['price'] ?? 0), 2);
            if ($price < 0) {
                throw new EventException("{$name}: the price can not be below 0.");
            }
            $cap = ($r['capacity'] ?? '') === '' ? null : (int) $r['capacity'];
            if ($cap !== null && $cap < 1) {
                throw new EventException("{$name}: the number of tickets is at least 1 (leave it empty for no limit).");
            }
            $min = max(1, (int) ($r['min_per_order'] ?? 1));
            $max = ($r['max_per_order'] ?? '') === '' ? null : (int) $r['max_per_order'];
            if ($max !== null && $max < $min) {
                throw new EventException("{$name}: the most per order can not be below the least.");
            }
            $from = ! empty($r['sale_starts_at']) ? \Illuminate\Support\Carbon::parse($r['sale_starts_at']) : null;
            $to = ! empty($r['sale_ends_at']) ? \Illuminate\Support\Carbon::parse($r['sale_ends_at']) : null;
            if ($from && $to && $to->lt($from)) {
                throw new EventException("{$name}: the sale can not end before it starts.");
            }
            $row = ['name' => $name, 'description' => ($r['description'] ?? null) ?: null, 'price' => $price, 'capacity' => $cap, 'min_per_order' => $min, 'max_per_order' => $max,
                'sale_starts_at' => $from, 'sale_ends_at' => $to, 'sort_order' => (int) ($r['sort_order'] ?? $n), 'is_active' => ! array_key_exists('is_active', $r) || ! empty($r['is_active'])];
            if (! empty($r['id']) && $existing->has((int) $r['id'])) {
                $t = $existing[(int) $r['id']];
                $taken = $this->holds->takenByType($event->id)[$t->id] ?? 0;
                if ($cap !== null && $cap < $taken) {
                    throw new EventException("{$name}: {$taken} are already sold or held, so the number can not go below that.");
                }
                $t->update($row);
            } else {
                $t = EventTicketType::create($row + ['event_id' => $event->id]);
            }
            $keep[] = $t->id;
            if (array_key_exists('session_ids', $r)) {
                $ids = [];
                foreach ((array) $r['session_ids'] as $ref) {
                    $id = is_numeric($ref) ? (int) $ref : ($keys[(string) $ref] ?? null);
                    if ($id === null || ! in_array($id, $sessionIds, true)) {
                        throw new EventException("{$name}: one of the dates it admits to is not part of this event.");
                    }
                    $ids[] = $id;
                }
                DB::table('event_ticket_type_sessions')->where('ticket_type_id', $t->id)->delete();
                foreach (array_unique($ids) as $sid) {
                    DB::table('event_ticket_type_sessions')->insert(['ticket_type_id' => $t->id, 'session_id' => $sid]);
                }
            }
        }
        foreach ($existing->keys()->diff($keep) as $gone) {
            if ((int) EventTicket::where('ticket_type_id', $gone)->whereIn('state', [EventTicket::VALID, EventTicket::HELD, EventTicket::CANCELLED])->count() > 0) {
                throw new EventException("{$existing[$gone]->name} has tickets, so it can not be deleted: switch it off instead.");
            }
            DB::table('event_ticket_type_sessions')->where('ticket_type_id', $gone)->delete();
            $existing[$gone]->delete();
        }
    }

    private function liveTickets(int $eventId): int
    {
        return EventTicket::where('event_id', $eventId)->takingASeat()->count();
    }

    // ------------------------------------------------------------ publishing

    /** @return string[] what stops this event from being published, in words */
    public function problems(Event $event): array
    {
        $event->loadMissing(['sessions', 'ticketTypes']);
        $out = [];
        if (trim((string) $event->title) === '') {
            $out[] = 'It needs a title.';
        }
        $future = $event->sessions->where('is_cancelled', false)->filter(fn ($s) => ($s->ends_at ?? $s->starts_at)->isFuture());
        if ($future->isEmpty()) {
            $out[] = 'It needs at least one date that is still to come.';
        }
        $types = $event->ticketTypes->where('is_active', true);
        if ($types->isEmpty()) {
            $out[] = 'It needs at least one ticket type that is switched on.';
        }
        if (in_array($event->kind, ['in_person', 'hybrid'], true) && trim((string) $event->venue_name) === '') {
            $out[] = 'Say where it is (the venue).';
        }
        if (in_array($event->kind, ['online', 'hybrid'], true) && trim((string) $event->online_url) === '') {
            $out[] = 'Add the link people join with (it is shown only to ticket holders).';
        }
        if ($types->contains(fn ($t) => (float) $t->price > 0)) {
            if (! $event->currency_id) {
                $out[] = 'Choose the currency the tickets are sold in.';
            }
            if (! $this->salesLedgerId($event)) {
                $out[] = 'Choose the income account ticket sales are booked to (here, or once for all events in the events settings).';
            }
        }

        return $out;
    }

    public function salesLedgerId(Event $event): ?int
    {
        return $event->sales_ledger_id ?: (EventSettings::all()['sales_ledger_id'] ?: null);
    }

    public function publish(Event $event, ?int $by = null): Event
    {
        if ($event->status === Event::CANCELLED) {
            throw new EventException('A cancelled event can not be published again: make a new one.');
        }
        if ($problems = $this->problems($event)) {
            throw new EventException("It can not be published yet. " . implode(' ', $problems));
        }
        $was = $event->status;
        $event->update(['status' => Event::PUBLISHED, 'published_at' => $event->published_at ?? now(), 'updated_by' => $by]);
        if ($was === Event::POSTPONED) {
            DB::afterCommit(fn () => app(EventNotices::class)->eventRescheduled($event->fresh()));   // the postponed event has its new date
        }

        return $event->fresh();
    }

    /** Back to draft (off sale). Refused when people hold tickets: cancel or postpone instead. */
    public function unpublish(Event $event, ?int $by = null): Event
    {
        if ($this->liveTickets($event->id) > 0) {
            throw new EventException('People already hold tickets for this event, so it can not be taken down: cancel or postpone it instead.');
        }
        $event->update(['status' => Event::DRAFT, 'updated_by' => $by]);

        return $event->fresh();
    }

    /** Staff cancel the event: sales stop, held seats go back, every paid ticket gets a refund request waiting for staff, and every holder is told. */
    public function cancel(Event $event, ?int $by = null): Event
    {
        DB::transaction(function () use ($event, $by) {
            $event->update(['status' => Event::CANCELLED, 'updated_by' => $by]);
            EventTicket::where('event_id', $event->id)->where('state', EventTicket::HELD)->update(['state' => EventTicket::RELEASED, 'held_until' => null]);
            app(EventRefunds::class)->openForEvent($event);
        });
        DB::afterCommit(fn () => app(EventNotices::class)->eventCancelled($event->fresh()));

        return $event->fresh();
    }

    /** Staff postpone it: sales stop, holders keep their tickets for the new date (and may ask for a refund), and they are told. Give it new dates and put it on sale again to finish. */
    public function postpone(Event $event, ?int $by = null): Event
    {
        if ($event->status !== Event::PUBLISHED) {
            throw new EventException('Only an event that is on sale can be postponed.');
        }
        $event->update(['status' => Event::POSTPONED, 'updated_by' => $by]);
        DB::afterCommit(fn () => app(EventNotices::class)->eventPostponed($event->fresh()));

        return $event->fresh();
    }
}
