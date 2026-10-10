<?php

namespace App\Services\Events;

use App\Models\Books\Voucher;
use App\Models\Events\Event;
use App\Models\Events\EventCheckin;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventTicket;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * Getting money back for a ticket. A buyer asks (until the event's cut-off date, and always when staff cancelled or postponed the event); staff decide. Approving cancels the ticket (its QR stops
 * working, the seat is free again) and writes a credit note against the sale for that ticket alone, with the money going back from the bank or till staff choose. For a card that money is
 * returned from the provider's dashboard by hand: the books record that it left the account. A free ticket needs no money back, so the holder cancels it themselves.
 */
final class EventRefunds
{
    public function __construct(private TicketHolds $holds, private VoucherService $vouchers, private EventNotices $notices)
    {
    }

    /** May tickets of this event be handed back right now? Always when staff cancelled or postponed it; otherwise until the cut-off, and never once it is over. */
    public static function open(Event $e): bool
    {
        if (in_array($e->status, [Event::CANCELLED, Event::POSTPONED], true)) {
            return true;
        }

        return ! $e->isOver() && $e->refundOpen();
    }

    /** @return array{can_request: bool, can_cancel: bool, state: ?string, note: ?string, reason: ?string} what the holder may do about this ticket */
    public function eligibility(EventTicket $t, Event $e): array
    {
        $req = EventRefundRequest::where('ticket_id', $t->id)->orderByDesc('id')->first();
        $state = $req?->status;
        $out = fn (bool $request, bool $cancel, ?string $reason) => ['can_request' => $request, 'can_cancel' => $cancel, 'state' => $state, 'note' => $state === EventRefundRequest::DECLINED ? $req->decision_note : null, 'reason' => $reason];

        if ($t->state !== EventTicket::VALID) {
            return $out(false, false, $state === EventRefundRequest::APPROVED ? 'refunded' : 'not_valid');
        }
        if ($state === EventRefundRequest::PENDING) {
            return $out(false, false, 'requested');
        }
        if (! self::open($e)) {
            return $out(false, false, 'closed');
        }
        if (! in_array($e->status, [Event::CANCELLED, Event::POSTPONED], true) && EventCheckin::where('ticket_id', $t->id)->whereIn('result', [CheckIn::OK, CheckIn::MANUAL])->exists()) {
            return $out(false, false, 'used');
        }

        return (float) $t->price <= 0 ? $out(false, true, null) : $out(true, false, null);
    }

    /**
     * The holder hands a ticket back. Paid: a request for staff. Free: cancelled at once.
     *
     * @return array{cancelled: bool, request: ?EventRefundRequest, message: string}
     */
    public function request(EventTicket $t, string $reason, ?string $by = null): array
    {
        return DB::transaction(function () use ($t, $reason, $by) {
            $t = EventTicket::whereKey($t->id)->lockForUpdate()->firstOrFail();
            $e = Event::withTrashed()->with('sessions')->findOrFail($t->event_id);
            $el = $this->eligibility($t, $e);
            if (! $el['can_request'] && ! $el['can_cancel']) {
                throw new EventException(match ($el['reason']) {
                    'requested' => 'You have already asked for a refund for this ticket. We will get back to you.',
                    'refunded' => 'This ticket has already been refunded.',
                    'not_valid' => 'This ticket is not valid, so there is nothing to refund.',
                    'used' => 'This ticket has already been used to get in.',
                    default => 'The time to ask for a refund for this event is over.' . ($e->refund_until ? ' It closed on ' . $e->refund_until->format('j M Y, H:i') . '.' : ''),
                });
            }
            if ($el['can_cancel']) {
                $this->holds->cancel($t, 'Cancelled by the holder');

                return ['cancelled' => true, 'request' => null, 'message' => 'Your ticket is cancelled. The seat is free for someone else.'];
            }
            $req = EventRefundRequest::create(['event_id' => $t->event_id, 'ticket_id' => $t->id, 'status' => EventRefundRequest::PENDING, 'reason' => mb_substr(trim($reason), 0, 300) ?: null, 'amount' => $t->price, 'requested_by' => $by ?: ($t->buyer_email ?: 'buyer')]);
            DB::afterCommit(fn () => $this->notices->refundRequested($req->fresh(), $t, $e));

            return ['cancelled' => false, 'request' => $req, 'message' => 'We have your request. Staff will look at it and tell you what they decide.'];
        });
    }

    /**
     * Staff approve a request: the ticket is cancelled and the money goes back in the books.
     *
     * @return ?Voucher the credit note (null for a ticket that cost nothing)
     */
    public function approve(EventRefundRequest $request, ?int $refundLedgerId, ?string $note, ?User $by): ?Voucher
    {
        try {
            return DB::transaction(function () use ($request, $refundLedgerId, $note, $by) {
                $r = EventRefundRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
                if ($r->status !== EventRefundRequest::PENDING) {
                    throw new EventException('That request has already been decided.');
                }
                $t = EventTicket::whereKey($r->ticket_id)->lockForUpdate()->firstOrFail();
                if ($t->state !== EventTicket::VALID) {
                    throw new EventException('That ticket is no longer valid, so there is nothing to refund.');
                }
                $credit = (float) $t->price > 0 ? $this->creditNote($t, $refundLedgerId, $by) : null;
                $this->holds->cancel($t, 'Refunded');
                $r->update(['status' => EventRefundRequest::APPROVED, 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => $note ? mb_substr($note, 0, 300) : null, 'amount' => $credit ? (float) $credit->total_amount : 0]);
                $fresh = $r->fresh();
                DB::afterCommit(fn () => $this->notices->refundDecided($fresh, true, $credit?->meta['refunded_to'] ?? null));

                return $credit;
            });
        } catch (BooksException $e) {
            throw new EventException($e->getMessage(), previous: $e);
        }
    }

    public function decline(EventRefundRequest $request, string $note, ?User $by): void
    {
        if (trim($note) === '') {
            throw new EventException('Say why, so the buyer understands.');
        }
        DB::transaction(function () use ($request, $note, $by) {
            $r = EventRefundRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($r->status !== EventRefundRequest::PENDING) {
                throw new EventException('That request has already been decided.');
            }
            $r->update(['status' => EventRefundRequest::DECLINED, 'decided_by' => $by?->id, 'decided_at' => now(), 'decision_note' => mb_substr(trim($note), 0, 300)]);
            $fresh = $r->fresh();
            DB::afterCommit(fn () => $this->notices->refundDecided($fresh, false, null));
        });
    }

    /** Staff hand a ticket back on the buyer's behalf (they phoned): a request and its approval in one step. */
    public function refundNow(EventTicket $t, ?int $refundLedgerId, ?string $note, ?User $by): ?Voucher
    {
        if ($t->state !== EventTicket::VALID) {
            throw new EventException('That ticket is not valid, so there is nothing to refund.');
        }
        $req = EventRefundRequest::where('ticket_id', $t->id)->where('status', EventRefundRequest::PENDING)->first()
            ?? EventRefundRequest::create(['event_id' => $t->event_id, 'ticket_id' => $t->id, 'status' => EventRefundRequest::PENDING, 'reason' => 'Refunded by staff', 'amount' => $t->price, 'requested_by' => 'staff' . ($by ? " #{$by->id}" : '')]);

        return $this->approve($req, $refundLedgerId, $note, $by);
    }

    /** The event was cancelled: every paid ticket gets a refund request waiting for staff (nobody has to ask, and none is missed). @return int how many were opened */
    public function openForEvent(Event $event): int
    {
        $n = 0;
        foreach (EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->where('price', '>', 0)->get() as $t) {
            if (! EventRefundRequest::where('ticket_id', $t->id)->where('status', EventRefundRequest::PENDING)->exists()) {
                EventRefundRequest::create(['event_id' => $event->id, 'ticket_id' => $t->id, 'status' => EventRefundRequest::PENDING, 'reason' => 'The event was cancelled', 'amount' => $t->price, 'requested_by' => 'system']);
                $n++;
            }
        }
        foreach (EventTicket::where('event_id', $event->id)->where('state', EventTicket::VALID)->where('price', '<=', 0)->get() as $free) {
            $this->holds->cancel($free, 'The event was cancelled');   // nothing to pay back: a free ticket just stops being valid
        }

        return $n;
    }

    /**
     * Approve every request still waiting for one event (after a cancellation), each on its own so one problem does not stop the rest.
     *
     * @return array{done: int, failed: array<int, array{ticket: string, message: string}>}
     */
    public function approveAll(Event $event, ?int $refundLedgerId, ?User $by): array
    {
        $done = 0;
        $failed = [];
        foreach (EventRefundRequest::where('event_id', $event->id)->where('status', EventRefundRequest::PENDING)->orderBy('id')->get() as $r) {
            try {
                $this->approve($r, $refundLedgerId, null, $by);
                $done++;
            } catch (EventException $e) {
                $failed[] = ['ticket' => EventTicket::whereKey($r->ticket_id)->value('reference') ?? (string) $r->ticket_id, 'message' => $e->getMessage()];
            }
        }

        return ['done' => $done, 'failed' => $failed];
    }

    /** What staff see: requests (waiting by default), with the ticket, the buyer and where the money can go back from. @return array<int, array<string, mixed>> */
    public function list(?string $status = EventRefundRequest::PENDING, ?int $eventId = null): array
    {
        $rows = EventRefundRequest::query()->when($status, fn ($q, $s) => $q->where('status', $s))->when($eventId, fn ($q, $i) => $q->where('event_id', $i))->orderBy('id')->limit(300)->get();
        $tickets = EventTicket::with('type')->whereIn('id', $rows->pluck('ticket_id'))->get()->keyBy('id');
        $events = Event::withTrashed()->whereIn('id', $rows->pluck('event_id'))->get()->keyBy('id');
        $out = [];
        foreach ($rows as $r) {
            $t = $tickets[$r->ticket_id] ?? null;
            $e = $events[$r->event_id] ?? null;
            $refund = null;
            if ($r->status === EventRefundRequest::PENDING && $t && (float) $t->price > 0 && $t->sale_id && ($sale = Voucher::with('type')->find($t->sale_id)) && $this->vouchers->paidAtOnce($sale)) {
                $refund = $this->vouchers->returnable($sale)['refund'];   // {ledgers, default_id}
            }
            $out[] = ['id' => $r->id, 'status' => $r->status, 'reason' => $r->reason, 'amount' => (float) $r->amount, 'requested_by' => $r->requested_by, 'at' => $r->created_at?->format('Y-m-d\TH:i'),
                'decided_at' => $r->decided_at?->format('Y-m-d\TH:i'), 'decision_note' => $r->decision_note,
                'event' => $e ? ['id' => $e->id, 'title' => $e->title, 'status' => $e->status] : null,
                'ticket' => $t ? ['id' => $t->id, 'reference' => $t->reference, 'holder_name' => $t->holder_name, 'type' => $t->type?->name, 'state' => $t->state, 'buyer_name' => $t->buyer_name, 'buyer_email' => $t->buyer_email, 'buyer_phone' => $t->buyer_phone] : null,
                'refund' => $refund, 'blocked' => $r->status === EventRefundRequest::PENDING && $t && (float) $t->price > 0 && ! $t->sale_id ? 'There is no paid sale behind this ticket: refund it by hand.' : null];
        }

        return $out;
    }

    /** The credit note for one ticket: one unit of the order line its ticket type was sold on, at the original price and tax. */
    private function creditNote(EventTicket $t, ?int $refundLedgerId, ?User $by): Voucher
    {
        $sale = $t->sale_id ? Voucher::with('type')->find($t->sale_id) : null;
        if (! $sale) {
            throw new EventException('There is no paid sale behind this ticket: refund it by hand.');
        }
        $event = Event::withTrashed()->findOrFail($t->event_id);
        $order = $t->order_id ? Voucher::find($t->order_id) : null;
        $description = collect($order?->meta['event']['lines'] ?? [])->firstWhere('ticket_type_id', $t->ticket_type_id)['description'] ?? ($event->title . ' — ' . ($t->type?->name ?? ''));
        $ret = $this->vouchers->returnable($sale);
        $line = collect($ret['lines'])->first(fn ($l) => $l['item_type'] === 'custom' && $l['description'] === $description && $l['available_quantity'] >= 0.9999)
            ?? throw new EventException('The sale has nothing left of this ticket to give back (it may already have been credited).');
        $opts = ['lines' => [['item_id' => $line['id'], 'mode' => 'return', 'quantity' => 1]], 'reason' => 'Event ticket refunded', 'narration' => "Ticket {$t->reference} for {$event->title} refunded"];
        if ($this->vouchers->paidAtOnce($sale)) {
            $opts['refund_ledger_id'] = $refundLedgerId ?: ($ret['refund']['default_id'] ?? null) ?: throw new EventException('Choose where the refund is paid from.');
        }

        return $this->vouchers->createReturn($sale, $opts, $by);
    }
}
