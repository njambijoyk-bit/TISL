<?php

namespace App\Services\Events;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\PaymentModeService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * Selling at the door or the box office. Staff with `events.sell` can sell for cash (or a bank / till account of their choice), which is booked as an ordinary Cash Sale, or hand out
 * complimentary tickets that cost nothing. The tickets are valid at once and, when an email is given, sent. The seat rules still hold: a sold-out ticket can not be sold here either.
 */
final class EventBoxOffice
{
    public function __construct(private EventCheckout $checkout, private TicketHolds $holds, private TicketIssuer $issuer, private EventNotices $notices, private VoucherService $vouchers, private CheckoutService $books, private PaymentModeService $modes)
    {
    }

    /** The cash and bank accounts a sale can be taken into. @return array<int, array{id: int, name: string}> */
    public function ledgers(): array
    {
        $ids = LedgerGroup::whereIn('name', ['Cash-in-hand', 'Bank Accounts'])->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return Ledger::whereIn('group_id', $ids)->where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->all();
    }

    /**
     * @param  array<int, array{ticket_type_id?: int|string, quantity?: int|string}>  $items
     * @param  array{name?: ?string, email?: ?string, phone?: ?string}  $buyer
     * @param  'cash'|'comp'  $mode
     * @param  string[]  $holders
     * @return array{status: string, tickets: array, order?: array, message: string}
     */
    public function sell(Event $event, array $items, array $buyer, User $staff, string $mode, ?int $ledgerId, array $holders = []): array
    {
        $wanted = $this->checkout->wanted($items);
        $types = $this->checkout->types($event, $wanted);
        $lines = $mode === 'comp' ? [] : $this->checkout->lines($event, $wanted, $types);
        $buyer = ['name' => trim((string) ($buyer['name'] ?? '')) ?: 'Walk-in', 'email' => trim((string) ($buyer['email'] ?? '')) ?: null, 'phone' => trim((string) ($buyer['phone'] ?? '')) ?: null];
        if ($buyer['email'] && ! filter_var($buyer['email'], FILTER_VALIDATE_EMAIL)) {
            throw new EventException('That email address does not look right.');
        }
        if ($lines && ! in_array($ledgerId, array_column($this->ledgers(), 'id'), true)) {
            throw new EventException('Choose the cash or bank account the money goes into.');
        }

        $tickets = $this->holds->hold($event, $wanted, $buyer + ['customer_id' => null], $staff->id);   // staff may sell outside the online sale window; the seat rules still hold
        foreach ($tickets->values() as $i => $t) {
            $name = isset($holders[$i]) ? trim((string) $holders[$i]) : '';
            $t->update(['holder_name' => $name !== '' ? mb_substr($name, 0, 160) : $buyer['name']] + ($mode === 'comp' ? ['price' => 0] : []));
        }
        $summary = fn ($ts) => $ts->map(fn ($t) => ['id' => $t->id, 'reference' => $t->reference, 'type' => $types[$t->ticket_type_id]->name, 'holder_name' => $t->holder_name, 'state' => $t->state, 'price' => (float) $t->price,
            'code' => $t->state === EventTicket::VALID ? TicketCodes::code($t) : null])->values()->all();

        if (! $lines) {   // complimentary, or only free tickets: nothing to take
            $made = $this->holds->issueTickets($tickets);
            DB::afterCommit(fn () => $made->first()?->buyer_email ? $this->notices->ticketsIssued($made) : null);

            return ['status' => 'issued', 'tickets' => $summary($tickets->map->fresh()), 'message' => $mode === 'comp' ? 'Complimentary tickets are ready.' : 'The tickets are ready.'];
        }

        try {
            return DB::transaction(function () use ($event, $lines, $buyer, $staff, $ledgerId, $tickets, $summary) {
                $order = $this->vouchers->placeOrder($this->checkout->payload($event, $lines, [
                    'contact' => ['name' => $buyer['name'], 'email' => $buyer['email'], 'phone' => $buyer['phone']], 'guest' => true, 'box_office' => $staff->id,
                    'event' => ['id' => $event->id, 'ticket_ids' => $tickets->pluck('id')->all(), 'lines' => array_map(fn ($l) => ['ticket_type_id' => $l['ticket_type_id'], 'description' => $l['description']], $lines)],
                ], null, 'Box office tickets: ' . $event->title, 'admin'), null);
                $total = (float) $order->total_amount;
                $method = $this->modes->methodFor((int) $ledgerId);
                $sale = $this->books->settle($order, [['payment_method_id' => $method->id, 'amount' => $total, 'reference' => 'Box office']], $staff);
                $this->issuer->orderPaid($order, $sale);

                return ['status' => 'issued', 'tickets' => $summary(EventTicket::whereIn('id', $tickets->pluck('id'))->orderBy('id')->get()), 'order' => ['id' => $order->id, 'number' => $order->voucher_number, 'total' => $total, 'currency' => $order->currency?->code],
                    'message' => 'Sold: ' . number_format($total, 2) . ' taken into the account.'];
            });
        } catch (\Throwable $e) {
            $this->holds->release($tickets);   // nothing was taken, so the seats go back at once
            throw $e instanceof BooksException ? new EventException($e->getMessage(), previous: $e) : $e;
        }
    }
}
