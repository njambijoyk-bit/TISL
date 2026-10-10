<?php

namespace App\Services\Events;

use App\Models\Books\Voucher;
use App\Models\Events\EventTicket;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Housekeeping for unpaid purchases, run every minute. A hold that ran out is marked released. The order behind it is NOT cancelled yet: a card page can still be completed a
 * little later, and that payment should still get the tickets (TicketIssuer takes the seats again when they are free). A day later nobody is coming, so the order is cancelled and the
 * books are not cluttered with orders that were never paid.
 */
final class HoldReaper
{
    public const CANCEL_AFTER_HOURS = 24;

    public function __construct(private TicketHolds $holds, private VoucherService $vouchers)
    {
    }

    /** @return array{released: int, cancelled: int} */
    public function run(): array
    {
        if (! Schema::hasTable('event_tickets')) {
            return ['released' => 0, 'cancelled' => 0];
        }
        $before = EventTicket::where('state', EventTicket::RELEASED)->count();
        $this->holds->releaseExpired();

        return ['released' => EventTicket::where('state', EventTicket::RELEASED)->count() - $before, 'cancelled' => $this->cancelStaleOrders()];
    }

    private function cancelStaleOrders(): int
    {
        $cancelled = 0;
        $orderIds = EventTicket::where('state', EventTicket::RELEASED)->whereNotNull('order_id')->where('updated_at', '<', now()->subHours(self::CANCEL_AFTER_HOURS))->distinct()->pluck('order_id');
        foreach ($orderIds as $id) {
            if (EventTicket::where('order_id', $id)->where('state', '!=', EventTicket::RELEASED)->exists()) {
                continue;   // something of it was paid or is still held
            }
            $order = Voucher::with('type')->find($id);
            if (! $order || $order->status !== Voucher::POSTED || $order->type?->base_type !== 'sales_order' || $order->children()->where('status', Voucher::POSTED)->exists()) {
                continue;
            }
            try {
                $this->vouchers->cancel($order, 'The tickets were not paid for in time.', null);
                $cancelled++;
            } catch (BooksException $e) {
                Log::warning('Events: an unpaid ticket order could not be cancelled', ['order' => $id, 'error' => $e->getMessage()]);
            }
        }

        return $cancelled;
    }
}
