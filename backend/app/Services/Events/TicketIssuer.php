<?php

namespace App\Services\Events;

use App\Models\Books\Voucher;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventTicket;
use Illuminate\Support\Facades\Log;

/**
 * The money for an event order has arrived: its held tickets become valid. If the hold had already run out, the seats are taken again when they are still free; when they are not
 * (somebody else bought them in the meantime) the payment is real but there is nothing to give, so a refund request is opened for staff at once rather than the money sitting unnoticed.
 */
final class TicketIssuer
{
    public function __construct(private TicketHolds $holds)
    {
    }

    /** The tickets an order was for. @return \Illuminate\Support\Collection<int, EventTicket> */
    public function ticketsOf(Voucher $order): \Illuminate\Support\Collection
    {
        $ids = (array) ($order->meta['event']['ticket_ids'] ?? []);

        return $ids ? EventTicket::whereIn('id', $ids)->orderBy('id')->get() : collect();
    }

    /** Is this an order for tickets? */
    public function isEventOrder(Voucher $order): bool
    {
        return ! empty($order->meta['event']['ticket_ids']);
    }

    /**
     * @return array{issued: int, short: bool}  `short` is true when the seats were gone and a refund was opened instead
     */
    public function orderPaid(Voucher $order, ?Voucher $sale = null): array
    {
        $tickets = $this->ticketsOf($order);
        if ($tickets->isEmpty()) {
            return ['issued' => 0, 'short' => false];
        }
        if (! $this->holds->reclaim($tickets)) {
            $this->noSeats($order, $tickets);

            return ['issued' => 0, 'short' => true];
        }

        return ['issued' => $this->holds->issue($tickets->map->fresh(), $order->id, $sale?->id), 'short' => false];
    }

    /** Paid, but the seats are gone: one refund request per ticket, for the staff to settle. */
    private function noSeats(Voucher $order, \Illuminate\Support\Collection $tickets): void
    {
        $meta = $order->meta ?? [];
        $meta['event']['problem'] = 'seats_gone';
        $order->meta = $meta;
        $order->save();
        foreach ($tickets as $t) {
            if (! EventRefundRequest::where('ticket_id', $t->id)->exists()) {
                EventRefundRequest::create(['event_id' => $t->event_id, 'ticket_id' => $t->id, 'status' => EventRefundRequest::PENDING, 'amount' => $t->price,
                    'reason' => 'The payment arrived after the seats were released and they had been sold to someone else.', 'requested_by' => 'system']);
            }
        }
        Log::warning('Events: a payment arrived for seats that are gone', ['order' => $order->id, 'tickets' => $tickets->pluck('id')->all()]);
    }
}
