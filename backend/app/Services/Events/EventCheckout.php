<?php

namespace App\Services\Events;

use App\Models\Books\PaymentMethod;
use App\Models\Currency;
use App\Models\Events\Event;
use App\Models\Events\EventTicket;
use App\Models\Events\EventTicketType;
use App\Models\Location;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Buying tickets. Anyone can buy, signed in or not. Seats are held first (so two buyers can never get the last one), then, for a paid purchase, the books get an ordinary Sales Order
 * (one income line per ticket type, taxed by the account it is booked to) and the payment goes through the same M-Pesa and card gateways as the shop. The tickets become valid when the
 * payment is confirmed (see TicketIssuer). A free purchase has no order: the tickets are valid at once.
 */
final class EventCheckout
{
    public function __construct(private TicketHolds $holds, private EventEditor $editor, private VoucherService $vouchers, private GatewayPaymentService $gateway, private EventNotices $notices)
    {
    }

    /**
     * @param  array<int, array{ticket_type_id?: int|string, quantity?: int|string}>  $items
     * @return array<int, int> ticket type id => how many (the same type listed twice is added up)
     */
    public function wanted(array $items): array
    {
        $out = [];
        foreach ($items as $it) {
            $id = (int) ($it['ticket_type_id'] ?? 0);
            $n = (int) ($it['quantity'] ?? 0);
            if ($id > 0 && $n > 0) {
                $out[$id] = ($out[$id] ?? 0) + $n;
            }
        }
        if (! $out) {
            throw new EventException('Choose how many tickets you want.');
        }

        return $out;
    }

    /** @param array<int, int> $wanted @return Collection<int, EventTicketType> keyed by id */
    public function types(Event $event, array $wanted): Collection
    {
        $types = EventTicketType::where('event_id', $event->id)->whereIn('id', array_keys($wanted))->get()->keyBy('id');
        if ($types->count() !== count($wanted)) {
            throw new EventException('One of those ticket types is not part of this event.');
        }

        return $types;
    }

    private function currency(Event $event): ?Currency
    {
        return $event->currency_id ? Currency::find($event->currency_id) : null;
    }

    /** The books order's lines for what is wanted: one income line per ticket type that costs something. Free types are not on the order. */
    public function lines(Event $event, array $wanted, Collection $types): array
    {
        $ledger = $this->editor->salesLedgerId($event);
        $lines = [];
        foreach ($wanted as $id => $n) {
            $t = $types[$id];
            if ((float) $t->price <= 0) {
                continue;
            }
            if (! $ledger) {
                throw new EventException('This event is not ready to sell tickets: no income account is set.');
            }
            $line = ['type' => 'custom', 'description' => $event->title . ' — ' . $t->name, 'ledger_id' => $ledger, 'quantity' => $n, 'rate' => (float) $t->price, 'ticket_type_id' => $id];
            if ($event->tax_rate_id) {
                $line['tax_rate_id'] = $event->tax_rate_id;
            }
            $lines[] = $line;
        }

        return $lines;
    }

    /** @param array<int, array<string, mixed>> $lines */
    public function payload(Event $event, array $lines, array $meta = [], ?int $customerId = null, ?string $narration = null, string $channel = 'storefront'): array
    {
        $locationId = $event->location_id ?: (Location::defaultSelling()?->id ?? Location::default()?->id);

        return ['date' => today()->toDateString(), 'location_id' => $locationId, 'currency_id' => $event->currency_id, 'customer_id' => $customerId, 'channel' => $channel,
            'lines' => $lines, 'narration' => $narration, 'meta' => $meta];
    }

    /**
     * What the tickets cost, with tax, before anything is held or charged.
     *
     * @return array{free: bool, currency: ?array, lines: array, subtotal: float, tax_total: float, total: float}
     */
    public function quote(Event $event, array $items, ?User $user = null): array
    {
        $wanted = $this->wanted($items);
        $types = $this->types($event, $wanted);
        $rows = [];
        foreach ($wanted as $id => $n) {
            $rows[] = ['ticket_type_id' => $id, 'name' => $types[$id]->name, 'quantity' => $n, 'price' => (float) $types[$id]->price, 'amount' => round((float) $types[$id]->price * $n, 2)];
        }
        $lines = $this->lines($event, $wanted, $types);
        $currency = $this->currency($event);
        if (! $lines) {
            return ['free' => true, 'currency' => $currency?->only(['id', 'code', 'symbol']), 'lines' => $rows, 'subtotal' => 0.0, 'tax_total' => 0.0, 'total' => 0.0];
        }
        try {
            $p = $this->vouchers->preview($this->payload($event, $lines, [], $user?->customer?->id), null);
        } catch (BooksException $e) {
            throw new EventException($e->getMessage());
        }

        return ['free' => false, 'currency' => $currency?->only(['id', 'code', 'symbol']), 'lines' => $rows, 'subtotal' => (float) $p['subtotal'], 'tax_total' => (float) $p['tax_total'], 'total' => (float) $p['total']];
    }

    /**
     * Take the seats and, for a paid purchase, start the payment.
     *
     * @param  array<int, array{ticket_type_id?: int|string, quantity?: int|string}>  $items
     * @param  array{name?: ?string, email?: ?string, phone?: ?string}  $buyer
     * @param  string[]  $holders  the name on each ticket in turn (empty = the buyer's own)
     * @return array{status: string, tickets: array, order?: array, attempt?: array, redirect_url?: ?string, message: string, hold_minutes?: int}
     */
    public function place(Event $event, array $items, array $buyer, ?User $user, ?PaymentMethod $method, array $holders = []): array
    {
        $wanted = $this->wanted($items);
        $types = $this->types($event, $wanted);
        $lines = $this->lines($event, $wanted, $types);
        $customer = $user?->customer;
        $buyer = array_map(fn ($v) => is_string($v) ? trim($v) : $v, $buyer);
        if (($buyer['name'] ?? '') === '') {
            throw new EventException('Enter your name.');
        }
        if (! filter_var($buyer['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
            throw new EventException('Enter an email address: your tickets are sent there.');
        }
        if ($lines && ($buyer['phone'] ?? '') === '') {
            throw new EventException('Enter your phone number.');
        }
        if ($lines) {
            if (! $method || ! PaymentMethod::offeredAtCheckout()->whereKey($method->id)->exists()) {
                throw new EventException('Choose how to pay.');
            }
            if (! GatewayPaymentService::isAutomatic($method)) {
                throw new EventException("{$method->name} can't be charged automatically: choose M-Pesa or a card.");
            }
        }

        $tickets = $this->holds->hold($event, $wanted, $buyer + ['customer_id' => $customer?->id]);   // committed on its own: the seats are safe whatever happens next
        foreach ($tickets->values() as $i => $t) {
            if (! empty($holders[$i]) && trim((string) $holders[$i]) !== '') {
                $t->update(['holder_name' => mb_substr(trim((string) $holders[$i]), 0, 160)]);
            }
        }
        $minutes = (int) EventSettings::all()['hold_minutes'];
        $summary = fn ($ts) => $ts->map(fn ($t) => ['id' => $t->id, 'reference' => $t->reference, 'type' => $types[$t->ticket_type_id]->name, 'holder_name' => $t->holder_name, 'state' => $t->state, 'code' => $t->state === EventTicket::VALID ? TicketCodes::code($t) : null])->values()->all();

        if (! $lines) {   // free: no order, no payment
            $made = $this->holds->issueTickets($tickets);
            $this->notices->ticketsIssued($made);

            return ['status' => 'issued', 'tickets' => $summary($tickets->map->fresh()), 'message' => $tickets->count() === 1 ? 'You are in! Your ticket is below.' : 'You are in! Your tickets are below.'];
        }

        try {
            return DB::transaction(function () use ($event, $lines, $buyer, $customer, $user, $method, $tickets, $summary, $minutes) {
                $order = $this->vouchers->placeOrder($this->payload($event, $lines, [
                    'contact' => ['name' => $buyer['name'], 'email' => $buyer['email'], 'phone' => $buyer['phone']], 'guest' => $customer ? null : true,
                    'event' => ['id' => $event->id, 'ticket_ids' => $tickets->pluck('id')->all(), 'lines' => array_map(fn ($l) => ['ticket_type_id' => $l['ticket_type_id'], 'description' => $l['description']], $lines)],   // which line of the order each ticket type is, for a refund
                ], $customer?->id, 'Tickets: ' . $event->title), null);
                EventTicket::whereIn('id', $tickets->pluck('id'))->update(['order_id' => $order->id]);
                $total = (float) $order->total_amount;
                $r = $this->gateway->start($order, $method, ['phone' => $buyer['phone'], 'email' => $buyer['email'], 'name' => $buyer['name']], [], $total, $user);
                $a = $r['attempt'];

                return ['status' => 'awaiting_payment', 'tickets' => $summary($tickets->map->fresh()), 'hold_minutes' => $minutes,
                    'order' => ['id' => $order->id, 'number' => $order->voucher_number, 'total' => $total, 'currency' => $order->currency?->code],
                    'attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)],
                    'redirect_url' => $r['redirect_url'],
                    'message' => $r['redirect_url'] ? 'Taking you to the secure payment page…' : 'Check your phone and enter your M-Pesa PIN to finish paying. Your seats are kept for ' . $minutes . ' minutes.'];
            });
        } catch (\Throwable $e) {
            $this->holds->release($tickets);   // the payment could not even start: the seats go back on sale at once
            if ($e instanceof BooksException) {
                throw new EventException($e->getMessage(), previous: $e);
            }
            throw $e;
        }
    }
}
