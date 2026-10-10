<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventSession;
use App\Models\Events\EventTicket;
use Illuminate\Support\Facades\DB;

/**
 * The door. A scanned (or typed) ticket code is checked and the answer is one of: let them in, already used (and when), wrong event, wrong date, not valid (cancelled, refunded, never
 * paid) or not one of our codes. Every try is recorded, the refused ones too. Two scanners reading the same ticket at the same moment can never both let it in: the ticket is locked while it is
 * checked. A ticket can be checked in once per date it admits to (a three-day pass is used on three days).
 */
final class CheckIn
{
    public const OK = 'ok';
    public const MANUAL = 'manual';
    public const ALREADY = 'already';
    public const WRONG_EVENT = 'wrong_event';
    public const WRONG_SESSION = 'wrong_session';
    public const NOT_VALID = 'not_valid';
    public const NOT_FOUND = 'not_found';
    public const UNDONE = 'undone';

    public function __construct(private TicketHolds $holds)
    {
    }

    /** A code was scanned or typed at this event's door. @return array<string, mixed> */
    public function scan(Event $event, string $scanned, ?int $sessionId, ?int $by): array
    {
        $ticket = TicketCodes::find($scanned);
        if (! $ticket) {
            return $this->record($event, null, null, self::NOT_FOUND, mb_substr(trim($scanned), 0, 120), $by, 'This is not one of our ticket codes.');
        }

        return $this->admit($event, $ticket, $sessionId, $by, self::OK, mb_substr(trim($scanned), 0, 120));
    }

    /** Staff let someone in from the guest list (a lost phone). @return array<string, mixed> */
    public function manual(Event $event, EventTicket $ticket, ?int $sessionId, ?int $by): array
    {
        return $this->admit($event, $ticket, $sessionId, $by, self::MANUAL, null);
    }

    /** Checked in by mistake: the check-in is struck out (kept in the log) and the ticket can be used again. */
    public function undo(Event $event, int $checkinId, ?int $by): void
    {
        $c = EventCheckin::where('event_id', $event->id)->whereKey($checkinId)->first() ?? throw new EventException('That check-in was not found.');
        if (! in_array($c->result, [self::OK, self::MANUAL], true)) {
            throw new EventException('Only a check-in that let someone in can be undone.');
        }
        $c->update(['result' => self::UNDONE, 'note' => trim('Undone' . ($by ? " by staff #{$by}" : '') . ' at ' . now()->format('H:i'))]);
    }

    /** @return array<string, mixed> */
    private function admit(Event $event, EventTicket $ticket, ?int $sessionId, ?int $by, string $how, ?string $code): array
    {
        $event->loadMissing('sessions');

        return DB::transaction(function () use ($event, $ticket, $sessionId, $by, $how, $code) {
            $t = EventTicket::whereKey($ticket->id)->lockForUpdate()->first();
            if (! $t || (int) $t->event_id !== (int) $event->id) {
                $other = $t ? Event::withTrashed()->whereKey($t->event_id)->value('title') : null;

                return $this->record($event, $t, null, self::WRONG_EVENT, $code, $by, $other ? "This ticket is for another event: {$other}." : 'This ticket is not for this event.');
            }
            if ($t->state !== EventTicket::VALID) {
                $why = ['cancelled' => 'This ticket was cancelled or refunded.', 'held' => 'This ticket was never paid for.', 'released' => 'This ticket was never paid for.'][$t->state] ?? 'This ticket is not valid.';

                return $this->record($event, $t, null, self::NOT_VALID, $code, $by, $why);
            }
            $session = $this->session($event, $t, $sessionId);
            if (! $session) {
                return $this->record($event, $t, null, self::WRONG_SESSION, $code, $by, $sessionId ? 'This ticket does not admit to that date.' : 'There is no date to check this ticket in to.');
            }
            $used = EventCheckin::where('ticket_id', $t->id)->where('session_id', $session->id)->whereIn('result', [self::OK, self::MANUAL])->orderByDesc('id')->first();
            if ($used) {
                $name = $used->checked_by ? DB::table('users')->where('id', $used->checked_by)->value('name') : null;

                return $this->record($event, $t, $session, self::ALREADY, $code, $by, 'Already checked in at ' . $used->created_at->format('H:i') . ($name ? " by {$name}" : '') . '.', ['at' => $used->created_at->format('Y-m-d\TH:i'), 'first_by' => $name]);
            }

            return $this->record($event, $t, $session, $how, $code, $by, $how === self::MANUAL ? 'Checked in by hand.' : 'Welcome!');
        });
    }

    /** The date a ticket is being checked in to: the one asked for (it must admit this ticket), else the only one, else the one on now, else the nearest. */
    private function session(Event $event, EventTicket $t, ?int $sessionId): ?EventSession
    {
        $by = $this->holds->sessionsByType($event->id);
        $admitted = $event->sessions->where('is_cancelled', false)->filter(fn (EventSession $s) => TicketHolds::covers($by, $t->ticket_type_id, $s->id))->values();
        if ($sessionId) {
            return $admitted->firstWhere('id', $sessionId);
        }

        return $this->current($admitted);
    }

    /** Of some dates, the one on right now (from two hours before it starts to an hour after it ends), else the nearest to now. @param \Illuminate\Support\Collection<int, EventSession> $sessions */
    public function current($sessions): ?EventSession
    {
        if ($sessions->count() <= 1) {
            return $sessions->first();
        }
        $now = now();
        $on = $sessions->first(fn ($s) => $s->starts_at->copy()->subHours(2)->lte($now) && ($s->ends_at ?? $s->starts_at->copy()->addHours(4))->copy()->addHour()->gte($now));

        return $on ?? $sessions->sortBy(fn ($s) => abs($s->starts_at->diffInMinutes($now, false)))->first();
    }

    /** @param array<string, mixed> $extra @return array<string, mixed> */
    private function record(Event $event, ?EventTicket $t, ?EventSession $s, string $result, ?string $code, ?int $by, string $message, array $extra = []): array
    {
        $row = EventCheckin::create(['event_id' => $event->id, 'ticket_id' => $t?->id, 'session_id' => $s?->id, 'result' => $result, 'code_text' => $code, 'checked_by' => $by, 'note' => mb_substr($message, 0, 200)]);
        $ok = in_array($result, [self::OK, self::MANUAL], true);

        return ['result' => $result, 'ok' => $ok, 'message' => $message, 'checkin_id' => $row->id, 'at' => $row->created_at->format('Y-m-d\TH:i'),
            'ticket' => $t ? ['id' => $t->id, 'reference' => $t->reference, 'holder_name' => $t->holder_name ?: $t->buyer_name, 'type' => $t->type?->name] : null,
            'session' => $s ? ['id' => $s->id, 'label' => $s->label, 'starts_at' => $s->starts_at->format('Y-m-d\TH:i')] : null] + $extra;
    }
}
