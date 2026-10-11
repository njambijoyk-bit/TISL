<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\Location;
use App\Models\Menus\Channel;
use App\Models\Menus\Dish;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Models\ShippingOption;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Taking a customer's food order, online (pickup or delivery). Anyone can order, signed in or not.
 * The order is checked (the channel is on, the dish is on a menu being served at that time, there is enough to make it, the choices are allowed, the time is one the kitchen can do),
 * priced by the books (an ordinary Sales Order: option prices on the line, a delivery charge line, tax from the dish's account) and, when paying now, the payment goes through
 * the same M-Pesa and card gateways as the shop. When the money is in (see paid()) the kitchen is told. An order paid on collection or delivery is settled by staff at the end.
 */
class MenuOrderService
{
    private const MAX_PER_LINE = 50;

    public function __construct(private VoucherService $vouchers, private GatewayPaymentService $gateway, private DishInfo $info, private DishPricing $pricing,
        private OrderSlots $slots, private MenuOrderNotices $notices)
    {
    }

    // ── checking and pricing ─────────────────────────────────────────────

    /** @return array{channel: Channel, location: Location, at: Carbon, asap: bool, lines: array, payload: array, dishes: array} */
    public function prepare(array $in, ?User $user = null, ?Carbon $now = null): array
    {
        $now ??= now();
        $channel = Channel::where('code', (string) ($in['channel'] ?? ''))->first();
        if (! $channel || ! $channel->is_active || ! in_array($channel->order_type, ['pickup', 'delivery'], true)) {
            throw new BooksException('Ordering this way is not available right now.');
        }
        $location = $this->location($in['location_id'] ?? null);
        [$at, $asap] = $this->when($channel, $in['fulfil'] ?? 'asap', $now);
        $wanted = $this->wanted($in['items'] ?? []);

        $menus = $this->slots->menus($channel)->filter(fn ($m) => MenuSchedule::serving($m, $at))->pluck('id')->all();
        $onMenu = $menus ? DB::table('menus_section_dishes as sd')->join('menus_sections as s', 's.id', '=', 'sd.section_id')->whereIn('s.menu_id', $menus)->pluck('sd.dish_id')->map(fn ($i) => (int) $i)->all() : [];

        $need = [];     // dish id => portions needed in all
        $lines = [];
        $dishes = [];
        foreach ($wanted as $w) {
            $dish = Dish::with('product')->find($w['dish_id']);
            if (! $dish || ! $dish->is_active || ! $dish->variant_id) {
                throw new BooksException('One of the dishes is not available any more.');
            }
            if (! in_array((int) $dish->id, $onMenu, true)) {
                throw new BooksException("{$dish->name} is not on the menu at that time.");
            }
            $dishes[$dish->id] = $dish;
            $p = $this->pricing->resolve($dish, $w['option_ids']);
            $base = $this->info->money($dish, (int) $location->id)['price'];
            if ($base === null) {
                throw new BooksException("{$dish->name} has no price yet.");
            }
            $need[$dish->id] = ($need[$dish->id] ?? 0) + $w['quantity'];
            $linked = [];
            foreach ($p['linked_dishes'] as $lid) {
                $ld = $dishes[$lid] ??= Dish::with('product')->find($lid);
                if (! $ld || ! $ld->is_active || ! $ld->variant_id) {
                    throw new BooksException('One of the set-meal items is not available any more.');
                }
                $need[$ld->id] = ($need[$ld->id] ?? 0) + $w['quantity'];
                $linked[] = $ld;
            }
            $lines[] = ['dish' => $dish, 'quantity' => $w['quantity'], 'base_price' => (float) $base, 'unit_price' => round($base + $p['price_delta'], 2), 'options' => $p['options'], 'uses' => $p['uses'],
                'linked' => $linked, 'note' => $w['note']];
        }
        foreach ($need as $id => $n) {
            $have = $this->info->portions($dishes[$id], (int) $location->id);
            if ($have + 0.00001 < $n) {
                throw new BooksException($have > 0 ? "Only ".(int) floor($have)." of {$dishes[$id]->name} left." : "{$dishes[$id]->name} is sold out.");
            }
        }

        $delivery = $channel->order_type === 'delivery' ? $this->delivery($channel, $in) : null;
        $contact = $this->contact($in, $user);
        $mode = $this->mode($channel, $in);
        $customerId = $user?->customer?->id;

        $payload = $this->payload($channel, $location, $lines, $delivery, $contact, $customerId, $at, $asap, trim((string) ($in['notes'] ?? '')));

        return ['channel' => $channel, 'location' => $location, 'at' => $at, 'asap' => $asap, 'lines' => $lines, 'payload' => $payload, 'dishes' => $dishes, 'delivery' => $delivery, 'contact' => $contact, 'mode' => $mode,
            'customer_id' => $customerId, 'notes' => trim((string) ($in['notes'] ?? '')) ?: null];
    }

    private function location(mixed $id): Location
    {
        $q = Location::query()->sellsToCustomers();
        $loc = $id ? $q->whereKey((int) $id)->first() : Location::defaultSelling();
        if (! $loc) {
            throw new BooksException($id ? 'That branch does not take orders.' : 'No branch takes orders yet.');
        }

        return $loc;
    }

    /** @return array{0: Carbon, 1: bool} the time wanted and whether it is "as soon as possible" */
    private function when(Channel $c, mixed $fulfil, Carbon $now): array
    {
        if ($fulfil === null || $fulfil === '' || $fulfil === 'asap') {
            if (! $c->allow_asap) {
                throw new BooksException('Please choose a time.');
            }
            $at = $this->slots->earliest($c, $now);
            if (! $this->slots->served($this->slots->menus($c), $at)) {
                throw new BooksException('Nothing is being served by then: please choose a time we are open.');
            }

            return [$at, true];
        }
        try {
            $at = Carbon::parse((string) $fulfil);
        } catch (\Throwable) {
            throw new BooksException('That time is not valid.');
        }
        $at->setTimezone($now->getTimezone());
        if (! $this->slots->allows($c, $now, $at)) {
            throw new BooksException('That time can not be chosen: pick one from the list.');
        }

        return [$at, false];
    }

    /** @return array<int, array{dish_id: int, quantity: int, option_ids: int[], note: ?string}> */
    private function wanted(mixed $items): array
    {
        $out = [];
        foreach ((array) $items as $it) {
            $dish = (int) ($it['dish_id'] ?? 0);
            $qty = (int) ($it['quantity'] ?? 0);
            if ($dish <= 0 || $qty <= 0) {
                continue;
            }
            if ($qty > self::MAX_PER_LINE) {
                throw new BooksException('For more than '.self::MAX_PER_LINE.' of one dish, please call us.');
            }
            $note = trim((string) ($it['note'] ?? ''));
            $out[] = ['dish_id' => $dish, 'quantity' => $qty, 'option_ids' => array_map('intval', (array) ($it['option_ids'] ?? [])), 'note' => $note === '' ? null : mb_substr($note, 0, 200)];
        }
        if (! $out) {
            throw new BooksException('Your basket is empty.');
        }

        return $out;
    }

    /** @return array{option: ShippingOption, address: string} */
    private function delivery(Channel $c, array $in): array
    {
        $address = trim((string) ($in['address'] ?? ''));
        if (mb_strlen($address) < 5) {
            throw new BooksException('Enter the address to deliver to.');
        }
        $options = ShippingOption::query()->where('is_active', true)->when($c->shipping_option_ids, fn ($q) => $q->whereIn('ledgers.id', $c->shipping_option_ids))->get();
        $id = (int) ($in['shipping_option_id'] ?? 0);
        $opt = $id ? $options->firstWhere('id', $id) : ($options->count() === 1 ? $options->first() : null);
        if (! $opt) {
            throw new BooksException($options->isEmpty() ? 'Delivery is not set up yet.' : 'Choose how you want it delivered.');
        }

        return ['option' => $opt, 'address' => mb_substr($address, 0, 500)];
    }

    /** @return array{name: string, email: ?string, phone: string} */
    private function contact(array $in, ?User $user): array
    {
        $name = trim((string) ($in['name'] ?? $user?->name ?? ''));
        $phone = trim((string) ($in['phone'] ?? $user?->customer?->phone ?? ''));
        $email = trim((string) ($in['email'] ?? $user?->email ?? ''));
        if ($name === '') {
            throw new BooksException('Enter your name.');
        }
        if ($phone === '') {
            throw new BooksException('Enter your phone number: we call or text if there is a problem with your order.');
        }
        if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new BooksException('That email address does not look right.');
        }

        return ['name' => mb_substr($name, 0, 160), 'email' => $email === '' ? null : $email, 'phone' => mb_substr($phone, 0, 40)];
    }

    /** @return array{mode: string, method: ?PaymentMethod} */
    private function mode(Channel $c, array $in): array
    {
        $mode = (string) ($in['payment_mode'] ?? 'online');
        if (! isset(Channel::PAYMENT_MODES[$mode]) || ! $c->acceptsPayment($mode)) {
            throw new BooksException('Choose how you would like to pay.');
        }
        if ($mode === 'later') {
            return ['mode' => 'later', 'method' => null];
        }
        $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $method) {
            throw new BooksException('Choose how to pay.');
        }
        if (! GatewayPaymentService::isAutomatic($method)) {
            throw new BooksException("{$method->name} can't be charged automatically: choose M-Pesa or a card.");
        }

        return ['mode' => 'online', 'method' => $method];
    }

    /** The Sales Order the books will hold. */
    private function payload(Channel $c, Location $loc, array $lines, ?array $delivery, array $contact, ?int $customerId, Carbon $at, bool $asap, string $notes): array
    {
        $rows = [];
        foreach ($lines as $l) {
            /** @var Dish $d */
            $d = $l['dish'];
            $names = array_map(fn ($o) => $o['name'], $l['options']);
            $row = ['type' => 'product', 'product_id' => $d->product_id, 'variant_id' => $d->variant_id, 'quantity' => $l['quantity'], 'rate' => $l['unit_price'], 'location_id' => $loc->id,
                'notes' => trim(implode(', ', $names).($l['note'] ? ($names ? ' — ' : '').$l['note'] : '')) ?: null];
            if ($l['uses']) {
                $row['menu_uses'] = $l['uses'];
            }
            $rows[] = $row;
            foreach ($l['linked'] as $ld) {   // a set meal's side: its own line at no charge, so its stock is taken
                $rows[] = ['type' => 'product', 'product_id' => $ld->product_id, 'variant_id' => $ld->variant_id, 'quantity' => $l['quantity'], 'rate' => 0, 'location_id' => $loc->id, 'notes' => 'Part of '.$d->name];
            }
        }
        if ($delivery) {
            $rows[] = ['type' => 'charge', 'kind' => 'shipping', 'shipping_option_id' => $delivery['option']->id];
        }

        return ['date' => today()->toDateString(), 'location_id' => $loc->id, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $customerId, 'channel' => 'storefront', 'lines' => $rows,
            'narration' => ($c->order_type === 'delivery' ? 'Delivery' : 'Pickup').' '.($asap ? 'as soon as possible' : $at->format('D j M H:i')).($notes !== '' ? ' — '.$notes : ''),
            'meta' => ['contact' => $contact, 'guest' => $customerId ? null : true, 'menu_order' => true]];
    }

    // ── quote ─────────────────────────────────────────────────────────────

    /**
     * What it comes to, before anything is taken.
     *
     * @return array{subtotal: float, delivery_fee: float, tax_total: float, total: float, currency: ?array, at: string, asap: bool, lines: array}
     */
    public function quote(array $in, ?User $user = null, ?Carbon $now = null): array
    {
        $p = $this->prepare($in, $user, $now);
        $preview = $this->priced($p);

        return ['subtotal' => $preview['subtotal'], 'delivery_fee' => $preview['delivery_fee'], 'tax_total' => $preview['tax_total'], 'total' => $preview['total'],
            'currency' => Currency::getBaseCurrency()?->only(['id', 'code', 'symbol']), 'at' => $p['at']->toIso8601String(), 'asap' => $p['asap'],
            'lines' => array_map(fn ($l) => ['dish_id' => $l['dish']->id, 'name' => $l['dish']->name, 'quantity' => $l['quantity'], 'unit_price' => $l['unit_price'], 'amount' => round($l['unit_price'] * $l['quantity'], 2),
                'options' => array_column($l['options'], 'name')], $p['lines'])];
    }

    /** @return array{subtotal: float, delivery_fee: float, tax_total: float, total: float} the books' own figures; the minimum order is checked on the food alone */
    private function priced(array $p): array
    {
        $pre = $this->vouchers->preview($p['payload'], null);
        $fee = 0.0;
        foreach ($pre['lines'] as $l) {
            if (($l['item_type'] ?? null) === 'charge') {
                $fee += (float) $l['amount'];
            }
        }
        $food = round((float) $pre['subtotal'] - $fee, 2);
        if ($p['channel']->min_order > 0 && $food + 0.004 < (float) $p['channel']->min_order) {
            throw new BooksException('The smallest order is '.number_format((float) $p['channel']->min_order, 2).' before tax and delivery.');
        }

        return ['subtotal' => (float) $pre['subtotal'], 'delivery_fee' => round($fee, 2), 'tax_total' => (float) $pre['tax_total'], 'total' => (float) $pre['total']];
    }

    // ── placing ───────────────────────────────────────────────────────────

    /**
     * Take the order. Paying now: the payment is started and the order waits for the money. Paying later: the order goes straight to the kitchen.
     *
     * @return array{order: MenuOrder, status: string, attempt?: array, redirect_url?: ?string, message: string}
     */
    public function place(array $in, ?User $user = null, ?Carbon $now = null): array
    {
        $p = $this->prepare($in, $user, $now);
        $priced = $this->priced($p);
        $contact = $p['contact'];
        $later = $p['mode']['mode'] === 'later';
        $method = $p['mode']['method'];

        $result = DB::transaction(function () use ($p, $priced, $contact, $later, $method, $user) {
            $voucher = $this->vouchers->placeOrder($p['payload'], null);
            $order = MenuOrder::create([
                'number' => 'MO-'.Str::upper(Str::random(8)), 'track_token' => Str::random(40), 'channel_id' => $p['channel']->id, 'order_type' => $p['channel']->order_type, 'location_id' => $p['location']->id,
                'voucher_id' => $voucher->id, 'customer_id' => $p['customer_id'], 'user_id' => $user?->id, 'name' => $contact['name'], 'email' => $contact['email'], 'phone' => $contact['phone'],
                'status' => 'placed', 'payment' => $later ? 'later' : 'pending', 'payment_method_id' => $method?->id, 'asap' => $p['asap'], 'fulfil_at' => $p['at'],
                'delivery_address' => $p['delivery']['address'] ?? null, 'shipping_option_id' => $p['delivery']['option']->id ?? null, 'delivery_fee' => $priced['delivery_fee'],
                'subtotal' => $priced['subtotal'], 'tax_total' => $priced['tax_total'], 'total' => (float) $voucher->total_amount, 'currency_id' => $voucher->currency_id,
                'notes' => $p['notes'], 'placed_at' => now(),
            ]);
            $order->update(['number' => 'MO-'.str_pad((string) $order->id, 6, '0', STR_PAD_LEFT)]);
            foreach ($p['lines'] as $l) {
                MenuOrderLine::create(['order_id' => $order->id, 'dish_id' => $l['dish']->id, 'variant_id' => $l['dish']->variant_id, 'name' => $l['dish']->name, 'quantity' => $l['quantity'],
                    'base_price' => $l['base_price'], 'unit_price' => $l['unit_price'], 'options' => array_map(fn ($o) => ['id' => $o['id'], 'group' => $o['group'], 'name' => $o['name'], 'price_delta' => $o['price_delta']], $l['options']), 'note' => $l['note']]);
            }
            $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menu_order_id' => $order->id])]);
            if ($later) {
                return ['order' => $order];
            }
            $r = $this->gateway->start($voucher, $method, ['phone' => $contact['phone'], 'email' => $contact['email'], 'name' => $contact['name']], [], (float) $voucher->total_amount, $user);
            $a = $r['attempt'];

            return ['order' => $order, 'attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'gateway' => $a->gateway, 'token' => GatewayPaymentService::returnToken((int) $a->id)],
                'redirect_url' => $r['redirect_url']];
        });

        $order = $result['order'];
        if ($later) {
            $this->notices->placed($order);

            return $result + ['status' => 'placed', 'message' => 'Thank you! Your order is with the kitchen.'];
        }
        $this->notices->placed($order);

        return $result + ['status' => 'awaiting_payment', 'message' => $result['redirect_url'] ? 'Taking you to the secure payment page…' : 'Check your phone and enter your M-Pesa PIN to finish paying.'];
    }

    /** The money is in (called by the payment service): the kitchen can start. Safe to call twice. */
    public function paid(Voucher $order, Voucher $sale): void
    {
        $mo = MenuOrder::where('voucher_id', $order->id)->first();
        if (! $mo || $mo->payment === 'paid') {
            return;
        }
        $mo->update(['payment' => 'paid', 'sale_id' => $sale->id]);
        $this->notices->paid($mo->fresh());
    }

    /** Is this voucher the books side of a food order? */
    public static function isMenuOrder(Voucher $v): bool
    {
        return ! empty($v->meta['menu_order_id']);
    }

    // ── the kitchen's side ────────────────────────────────────────────────

    /** The next steps open from each state. */
    public const NEXT = [
        'placed' => ['accepted', 'preparing', 'ready', 'cancelled'],
        'accepted' => ['preparing', 'ready', 'cancelled'],
        'preparing' => ['ready', 'cancelled'],
        'ready' => ['out', 'completed', 'cancelled'],
        'out' => ['completed', 'cancelled'],
    ];

    /** Move an order along. An order waiting for its money can not be started; "out for delivery" only exists for delivery. */
    public function advance(MenuOrder $o, string $to, ?User $by = null, ?string $reason = null): MenuOrder
    {
        if ($to === 'cancelled') {
            return $this->cancel($o, $reason, $by);
        }
        if (! in_array($to, self::NEXT[$o->status] ?? [], true)) {
            throw new BooksException("An order that is {$o->status} can not become {$to}.");
        }
        if ($o->payment === 'pending') {
            throw new BooksException('This order is still waiting for the customer\'s payment.');
        }
        if ($o->payment === 'failed') {
            throw new BooksException('The payment for this order failed.');
        }
        if ($to === 'out' && $o->order_type !== 'delivery') {
            throw new BooksException('Only a delivery goes out for delivery.');
        }
        if ($to === 'completed' && $o->order_type === 'delivery' && $o->status === 'ready') {
            throw new BooksException('Send it out for delivery first.');
        }
        if ($to === 'completed' && $o->payment === 'later') {
            throw new BooksException('Take the payment first.');
        }
        $at = ['accepted' => 'accepted_at', 'ready' => 'ready_at', 'completed' => 'completed_at'][$to] ?? null;
        $o->update(['status' => $to] + ($at ? [$at => now()] : []));
        if ($to === 'ready') {
            $this->notices->ready($o);
        } elseif ($to === 'out') {
            $this->notices->out($o);
        }

        return $o->fresh();
    }

    /**
     * An order paid at the door: staff take the money and the order closes (becomes a Cash Sale in the books, and the stock goes).
     *
     * @param array<int, array{payment_method_id: int, amount?: float}> $tenders
     */
    public function takePayment(MenuOrder $o, array $tenders, ?User $by = null): MenuOrder
    {
        if ($o->payment !== 'later') {
            throw new BooksException('This order does not wait for payment on collection.');
        }
        if (! $o->open() || ! in_array($o->status, ['ready', 'out'], true)) {
            throw new BooksException('Take the payment when the order is ready.');
        }
        $voucher = Voucher::findOrFail($o->voucher_id);
        $total = (float) $voucher->total_amount;
        $tenders = array_map(fn ($t) => ['payment_method_id' => (int) $t['payment_method_id'], 'amount' => round((float) ($t['amount'] ?? $total), 2), 'reference' => $t['reference'] ?? null], $tenders);
        if (! $tenders || abs(array_sum(array_column($tenders, 'amount')) - $total) > 0.009) {
            throw new BooksException('The payment must come to '.number_format($total, 2).'.');
        }
        $sale = DB::transaction(function () use ($voucher, $tenders, $by, $o) {
            $sale = app(CheckoutService::class)->settle($voucher, $tenders, $by);
            $o->update(['payment' => 'paid', 'sale_id' => $sale->id, 'status' => 'completed', 'completed_at' => now()]);

            return $sale;
        });

        return $o->fresh();
    }

    /**
     * Cancel. Not paid yet: the Sales Order is cancelled with it. Already paid: the order is cancelled and flagged so the refund is made (the money is in the books as a sale).
     */
    public function cancel(MenuOrder $o, ?string $reason = null, ?User $by = null): MenuOrder
    {
        if (! $o->open()) {
            throw new BooksException("An order that is {$o->status} can not be cancelled.");
        }
        $reason = $reason !== null && trim($reason) !== '' ? mb_substr(trim($reason), 0, 300) : null;
        DB::transaction(function () use ($o, $reason, $by) {
            if ($o->payment !== 'paid' && $o->voucher_id) {
                $v = Voucher::find($o->voucher_id);
                if ($v && $v->status !== Voucher::CANCELLED) {
                    $this->vouchers->cancel($v, 'Food order '.$o->number.' cancelled'.($reason ? ": {$reason}" : ''), $by);
                }
            }
            $o->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'cancelled_at' => now()] + ($o->payment === 'pending' ? ['payment' => 'failed'] : []));
        });
        $this->notices->cancelled($o->fresh());

        return $o->fresh();
    }

    /** Orders that never got paid for: cancelled after the wait. @return int how many */
    public function sweep(int $minutes = 30, ?Carbon $now = null): int
    {
        $cut = ($now ?? now())->copy()->subMinutes($minutes);
        $n = 0;
        foreach (MenuOrder::where('payment', 'pending')->where('status', 'placed')->where('created_at', '<', $cut)->get() as $o) {
            try {
                $this->cancel($o, 'The payment did not arrive in time.');
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }
}
