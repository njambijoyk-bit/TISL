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
use App\Models\Menus\Table;
use App\Models\Menus\Ticket;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The counter (till). A cashier rings up dishes with their choices and either takes the money at once (quick service) or opens a tab that is ordered in rounds and paid at the end.
 * Everything is priced and booked by the books like any other sale (a Cash Sale with the tenders taken); a service charge (dine in, set in Menus settings, the cashier may waive it)
 * and a tip are lines posted to the accounts chosen in the settings. The kitchen gets tickets the moment something is rung up, round by round.
 * A tab is kept here until it is settled: the sale is booked then, so nothing is half-booked if the tab is cancelled.
 */
class CounterService
{
    public const SERVICES = ['dine_in' => 'Dine in', 'take_out' => 'Take out'];

    public function __construct(private MenuOrderService $orders, private VoucherService $vouchers, private CheckoutService $checkout, private KitchenService $kitchen, private FloorService $floor, private GatewayPaymentService $gateway)
    {
    }

    public function channel(string $code = 'counter'): Channel
    {
        $c = Channel::where('code', $code)->first();
        if (! $c || ! $c->is_active) {
            throw new BooksException($code === 'counter' ? 'The counter is not switched on (Menus → Settings → Ways to order).' : 'This way of ordering is not switched on (Menus → Settings → Ways to order).');
        }

        return $c;
    }

    /** @return array{service_charge_pct: float, service_charge_on: bool, tips_on: bool} */
    public function rules(): array
    {
        $s = MenusSettings::all();
        $on = (float) $s['service_charge_pct'] > 0 && $s['service_charge_ledger_id'];

        return ['service_charge_pct' => $on ? (float) $s['service_charge_pct'] : 0.0, 'service_charge_on' => (bool) $on, 'tips_on' => (bool) $s['tip_ledger_id']];
    }

    // ── pricing ──────────────────────────────────────────────────────────

    /**
     * What it comes to, with the service charge and tip, and the Sales Order the books would hold.
     *
     * @return array{payload: array, subtotal: float, service_charge: float, tip: float, tax_total: float, total: float, tax_breakdown: ?array}
     */
    public function price(Location $loc, array $lines, string $service, bool $waive = false, float $tip = 0.0, string $label = ''): array
    {
        $this->service($service);
        $s = MenusSettings::all();
        if ($tip < 0) {
            throw new BooksException('A tip can not be less than nothing.');
        }
        if ($tip > 0 && ! $s['tip_ledger_id']) {
            throw new BooksException('Tips are not set up: choose the account they are booked to under Menus → Settings.');
        }
        $rows = $this->orders->lineRows($lines, $loc);
        $base = ['date' => today()->toDateString(), 'location_id' => $loc->id, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => null, 'channel' => 'admin',
            'narration' => 'Counter'.($label !== '' ? ' — '.$label : ''), 'meta' => ['contact' => ['name' => $label !== '' ? $label : 'Counter'], 'guest' => true, 'menu_order' => true]];
        $food = $this->vouchers->preview($base + ['lines' => $rows], null);
        $rules = $this->rules();
        $svc = ($service === 'dine_in' && ! $waive && $rules['service_charge_on']) ? round((float) $food['subtotal'] * $rules['service_charge_pct'] / 100, 2) : 0.0;
        if ($svc > 0) {
            $rows[] = ['type' => 'charge', 'kind' => 'other', 'description' => 'Service charge', 'ledger_id' => (int) $s['service_charge_ledger_id'], 'amount' => $svc];
        }
        if ($tip > 0) {
            $rows[] = ['type' => 'charge', 'kind' => 'other', 'description' => 'Tip', 'ledger_id' => (int) $s['tip_ledger_id'], 'amount' => round($tip, 2)];
        }
        $pre = ($svc > 0 || $tip > 0) ? $this->vouchers->preview($base + ['lines' => $rows], null) : $food;

        return ['payload' => $base + ['lines' => $rows], 'subtotal' => round((float) $food['subtotal'], 2), 'service_charge' => $svc, 'tip' => round($tip, 2), 'tax_total' => (float) $pre['tax_total'],
            'total' => (float) $pre['total'], 'tax_breakdown' => $pre['tax_breakdown'] ?? null];
    }

    private function service(string $s): void
    {
        if (! isset(self::SERVICES[$s])) {
            throw new BooksException('Choose dine in or take out.');
        }
    }

    /** @return array{0: Channel, 1: Location, 2: array, 3: array} */
    private function prepare(array $in, ?Carbon $now = null): array
    {
        $now ??= now();
        $channel = $this->channel();
        $loc = $this->orders->location($in['location_id'] ?? null);
        [$lines, $dishes] = $this->orders->dishLines($channel, $loc, $now, $this->orders->wanted($in['items'] ?? []));

        return [$channel, $loc, $lines, $dishes];
    }

    public function quote(array $in, ?Carbon $now = null): array
    {
        [, $loc, $lines] = $this->prepare($in, $now);
        $p = $this->price($loc, $lines, (string) ($in['service'] ?? ''), (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), $this->label($in));

        return ['subtotal' => $p['subtotal'], 'service_charge' => $p['service_charge'], 'tip' => $p['tip'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown'],
            'currency' => Currency::getBaseCurrency()?->only(['id', 'code', 'symbol'])];
    }

    /** What a tab comes to now, with the service charge and the tip asked for. */
    public function quoteTab(MenuOrder $o, array $in): array
    {
        $this->assertTab($o);
        $p = $this->price(Location::findOrFail($o->location_id), $this->rebuild($o), (string) $o->service, (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), (string) $o->label);

        return ['subtotal' => $p['subtotal'], 'service_charge' => $p['service_charge'], 'tip' => $p['tip'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown'],
            'currency' => Currency::getBaseCurrency()?->only(['id', 'code', 'symbol'])];
    }

    private function label(array $in): string
    {
        return mb_substr(trim((string) ($in['label'] ?? '')), 0, 80);
    }

    // ── money ────────────────────────────────────────────────────────────

    /**
     * What was handed over, checked against what is owed. Cash may be more (the change is given back); the other ways must not be.
     *
     * @return array{tenders: array, tendered: float, change: float, record: array}
     */
    public function tenders(array $given, float $total): array
    {
        return app(\App\Services\Books\TenderCheck::class)->check($given, $total);
    }

    // ── selling ──────────────────────────────────────────────────────────

    /**
     * Ring up and take the money at once.
     *
     * @param array{items: array, service: string, tenders: array, tip?: float, waive_service?: bool, label?: string, location_id?: int} $in
     */
    public function sell(array $in, ?User $by = null, ?Carbon $now = null): MenuOrder
    {
        [$channel, $loc, $lines] = $this->prepare($in, $now);
        $service = (string) ($in['service'] ?? '');
        $p = $this->price($loc, $lines, $service, (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), $this->label($in));
        $paid = $this->tenders((array) ($in['tenders'] ?? []), $p['total']);

        $order = DB::transaction(function () use ($channel, $loc, $lines, $service, $p, $paid, $by, $in) {
            $order = $this->create($channel, $loc, $service, $by, $this->label($in), 'paid', $p);
            $this->addLines($order, $lines, 1);
            $this->book($order, $p, $paid, $by);

            return $order;
        });
        $this->fire($order);

        return $order->fresh();
    }

    /** A tab: ordered and sent to the kitchen, paid at the end. */
    public function openTab(array $in, ?User $by = null, ?Carbon $now = null): MenuOrder
    {
        $table = ! empty($in['table_id']) ? $this->tableFor((int) $in['table_id']) : null;
        if ($table) {   // a tab at a table: sold at the table's branch, dine in, named after the table
            $in['location_id'] = $this->floor->locationOf($table);
            $in['label'] = trim((string) ($in['label'] ?? '')) !== '' ? $in['label'] : $table->name;
            $in['service'] = $in['service'] ?? 'dine_in';
        }
        [$channel, $loc, $lines] = $this->prepare($in, $now);
        $service = (string) ($in['service'] ?? '');
        $label = $this->label($in);
        if ($label === '') {
            throw new BooksException('Give the tab a name (a table, a person) so it can be found again.');
        }
        $p = $this->price($loc, $lines, $service, true, 0.0, $label);   // a tab's running total leaves out the service charge and tip: they are settled at the end
        $order = DB::transaction(function () use ($channel, $loc, $lines, $service, $by, $label, $p, $table, $in) {
            $order = $this->create($channel, $loc, $service, $by, $label, 'open', $p, $table ? ['table_id' => $table->id, 'guests' => ! empty($in['guests']) ? (int) $in['guests'] : $table->guests] : []);
            $this->addLines($order, $lines, 1);
            if ($table && $table->state === 'free') {
                $table->update(['state' => 'seated', 'seated_at' => now(), 'guests' => ! empty($in['guests']) ? (int) $in['guests'] : $table->guests]);
            }

            return $order;
        });
        $this->fire($order);

        return $order->fresh();
    }

    public function addToTab(MenuOrder $o, array $in, ?User $by = null, ?Carbon $now = null): MenuOrder
    {
        $this->assertTab($o);
        $channel = $this->channel();
        $loc = Location::findOrFail($o->location_id);
        [$lines] = $this->orders->dishLines($channel, $loc, $now ?? now(), $this->orders->wanted($in['items'] ?? []));
        DB::transaction(function () use ($o, $lines) {
            $this->addLines($o, $lines, (int) $o->lines()->max('round') + 1);
            $this->retotal($o);
        });
        $this->fire($o);

        return $o->fresh();
    }

    /** Take a dish off a tab: only before the kitchen has started it. */
    public function voidLine(MenuOrder $o, int $lineId): MenuOrder
    {
        $this->assertTab($o);
        $line = $o->lines()->whereKey($lineId)->firstOrFail();
        $ticket = $line->ticket_id ? Ticket::find($line->ticket_id) : null;
        if ($ticket && $ticket->status !== 'new') {
            throw new BooksException("{$line->name} has already been started in the kitchen: ask a manager.");
        }
        if ($o->lines()->count() <= 1) {
            throw new BooksException('That is the only dish on the tab: cancel the tab instead.');
        }
        DB::transaction(function () use ($o, $line, $ticket) {
            $line->delete();
            if ($ticket && ! MenuOrderLine::where('ticket_id', $ticket->id)->exists()) {
                $ticket->delete();
            }
            $this->retotal($o);
        });

        return $o->fresh();
    }

    /** Pay the tab and close it: the whole tab becomes one sale in the books. */
    public function settleTab(MenuOrder $o, array $in, ?User $by = null): MenuOrder
    {
        $this->assertTab($o);
        $loc = Location::findOrFail($o->location_id);
        $lines = $this->rebuild($o);
        $p = $this->price($loc, $lines, (string) $o->service, (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), (string) $o->label);
        $paid = $this->tenders((array) ($in['tenders'] ?? []), $p['total']);
        DB::transaction(function () use ($o, $p, $paid, $by) {
            $this->book($o, $p, $paid, $by);
            $this->closeTab($o);
        });

        return $o->fresh();
    }

    /** A tab was paid: if everything was served it is complete, and its table is to be cleaned. */
    private function closeTab(MenuOrder $o): void
    {
        $o->refresh();
        if (! Ticket::where('order_id', $o->id)->whereIn('status', ['new', 'started'])->exists()) {
            $o->update(['status' => 'completed', 'completed_at' => now()]);   // everything was served: the table is done
        }
        $this->afterTab($o, 'cleaning');
    }

    /** The table of a tab that is over goes to "cleaning" (paid) or "free" (cancelled), unless another tab (a split bill) is still open there. */
    private function afterTab(MenuOrder $o, string $state): void
    {
        if (! $o->table_id || ! FloorService::installed() || ! ($t = Table::find($o->table_id))) {
            return;
        }
        if (! $this->floor->tabOf($t)) {
            $t->update(['state' => $state, 'bill_asked_at' => null] + ($state === 'free' ? ['guests' => null, 'seated_at' => null] : []));
        }
    }

    private function tableFor(int $id): Table
    {
        if (! FloorService::installed()) {
            throw new BooksException('Tables are not set up: run database script 139_menus_floor.sql.');
        }
        $t = Table::find($id) ?? throw new BooksException('That table does not exist.');
        $this->floor->assertUsable($t);
        if ($this->floor->tabOf($t)) {
            throw new BooksException("{$t->name} already has a tab: add to it.");
        }

        return $t;
    }

    /** Move a tab to another (empty) table. */
    public function moveTab(MenuOrder $o, int $toId): MenuOrder
    {
        $this->assertTab($o);
        $to = $this->tableFor($toId);
        if (! $o->table_id) {
            throw new BooksException('This tab is not at a table.');
        }
        if ($this->floor->locationOf($to) !== (int) $o->location_id) {
            throw new BooksException("{$to->name} is at another branch.");
        }
        $from = Table::find($o->table_id);
        DB::transaction(function () use ($o, $to, $from) {
            $o->update(['table_id' => $to->id, 'label' => $o->label === $from?->name ? $to->name : $o->label, 'name' => $o->label === $from?->name ? $to->name : $o->name]);
            $to->update(['state' => 'seated', 'guests' => $from?->guests, 'seated_at' => $from?->seated_at ?? now(), 'bill_asked_at' => $from?->bill_asked_at]);
            if ($from) {
                $from->update(['state' => 'free', 'guests' => null, 'seated_at' => null, 'bill_asked_at' => null]);
            }
        });

        return $o->fresh();
    }

    /**
     * Split the bill by dish: the chosen dishes move to a new tab at the same table, which is paid on its own. (The kitchen's tickets stay with the first tab.)
     *
     * @param int[] $lineIds
     */
    public function splitTab(MenuOrder $o, array $lineIds): MenuOrder
    {
        $this->assertTab($o);
        $moving = $o->lines()->whereIn('id', $lineIds)->get();
        if ($moving->isEmpty()) {
            throw new BooksException('Choose the dishes that go on the new bill.');
        }
        if ($moving->count() === $o->lines()->count()) {
            throw new BooksException('That is the whole tab: pay it instead.');
        }
        $new = DB::transaction(function () use ($o, $moving) {
            $n = MenuOrder::where('table_id', $o->table_id)->whereNotNull('table_id')->whereIn('payment', ['open', 'pending'])->whereNotIn('status', ['cancelled'])->count() + 1;
            $label = trim(($o->label ?? 'Tab').' ('.$n.')');
            $new = $this->create($this->channel(), Location::findOrFail($o->location_id), (string) $o->service, null, $label, 'open', ['subtotal' => 0, 'tax_total' => 0, 'total' => 0, 'tax_breakdown' => null],
                ['table_id' => $o->table_id, 'guests' => $o->guests]);
            MenuOrderLine::whereIn('id', $moving->pluck('id'))->update(['order_id' => $new->id]);
            $new->update(['status' => 'preparing']);
            $this->retotal($o);
            $this->retotal($new);

            return $new;
        });

        return $new->fresh();
    }

    // ── paying a tab from the phone (the table's QR page) ───────────────

    /**
     * Start an M-Pesa (or card) payment for the whole tab. The tab waits as "pending" until the money arrives (tabPaid) or the payment fails (phoneFailed).
     *
     * @return array{order: MenuOrder, attempt: array, redirect_url: ?string}
     */
    public function startPhonePayment(MenuOrder $o, PaymentMethod $method, string $phone, array $in = []): array
    {
        $this->assertTab($o);
        if (! PaymentMethod::offeredAtCheckout()->whereKey($method->id)->exists() || ! GatewayPaymentService::isAutomatic($method)) {
            throw new BooksException('Choose M-Pesa or a card.');
        }
        if (trim($phone) === '') {
            throw new BooksException('Enter your phone number.');
        }
        $p = $this->price(Location::findOrFail($o->location_id), $this->rebuild($o), (string) $o->service, (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), (string) $o->label);

        return DB::transaction(function () use ($o, $method, $phone, $p) {
            $voucher = $this->vouchers->placeOrder($p['payload'], null);
            $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menu_order_id' => $o->id])]);
            $o->update(['voucher_id' => $voucher->id, 'payment' => 'pending', 'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => (float) $voucher->total_amount, 'tax_breakdown' => $p['tax_breakdown'],
                'service_charge' => $p['service_charge'], 'tip' => $p['tip'], 'payment_method_id' => $method->id]);
            $r = $this->gateway->start($voucher, $method, ['phone' => $phone, 'name' => (string) $o->label], [], (float) $voucher->total_amount, null);
            $a = $r['attempt'];

            return ['order' => $o->fresh(), 'attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'token' => GatewayPaymentService::returnToken((int) $a->id)], 'redirect_url' => $r['redirect_url']];
        });
    }

    /** The payment did not go through: the tab is open again and can be added to or paid another way. */
    public function phoneFailed(MenuOrder $o): MenuOrder
    {
        if ($o->order_type !== 'counter' || $o->payment !== 'pending') {
            return $o;
        }
        DB::transaction(function () use ($o) {
            $v = $o->voucher_id ? Voucher::find($o->voucher_id) : null;
            if ($v && $v->status !== Voucher::CANCELLED) {
                $this->vouchers->cancel($v, 'Payment for the tab did not go through', null);
            }
            $o->update(['voucher_id' => null, 'payment' => 'open', 'payment_method_id' => null, 'service_charge' => 0, 'tip' => 0]);
            $this->retotal($o);
        });

        return $o->fresh();
    }

    /** The money for a tab came in by phone (called when the payment is confirmed). */
    public function tabPaid(MenuOrder $o): void
    {
        $method = $o->payment_method_id ? PaymentMethod::find($o->payment_method_id) : null;
        $o->update(['tendered' => $o->total, 'change_due' => 0, 'tenders' => [['method' => $method?->name ?? 'M-Pesa', 'amount' => (float) $o->total, 'reference' => null]], 'settled_at' => now()]);
        $this->closeTab($o);
    }

    /** Phone payments that never finished: give the tabs back. @return int how many */
    public function sweepPhone(int $minutes = 10): int
    {
        $n = 0;
        foreach (MenuOrder::where('order_type', 'counter')->where('payment', 'pending')->where('updated_at', '<', now()->subMinutes($minutes))->get() as $o) {
            try {
                $this->phoneFailed($o);
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }

    /** A guest ordered at the kiosk and chose to pay at the counter: the cashier takes the money, the sale is booked and only then does the kitchen get the ticket. */
    public function settleKiosk(MenuOrder $o, array $in, ?User $by = null): MenuOrder
    {
        if ($o->order_type !== 'kiosk' || $o->payment !== 'open' || ! $o->open()) {
            throw new BooksException('That is not a kiosk order waiting to be paid.');
        }
        $p = $this->price(Location::findOrFail($o->location_id), $this->rebuild($o), (string) $o->service, (bool) ($in['waive_service'] ?? false), (float) ($in['tip'] ?? 0), '');
        $paid = $this->tenders((array) ($in['tenders'] ?? []), $p['total']);
        DB::transaction(fn () => $this->book($o, $p, $paid, $by));
        $this->fire($o);

        return $o->fresh();
    }

    public function cancelTab(MenuOrder $o, ?string $reason, ?User $by = null): MenuOrder
    {
        $this->assertTab($o);

        $r = $this->orders->cancel($o, $reason, $by);
        $this->afterTab($o, 'free');

        return $r;
    }

    /** Tabs still open, kiosk orders waiting for their payment, and paid orders waiting to be handed over. @return array{tabs: Collection, kiosk: Collection, ready: Collection} */
    public function board(): array
    {
        return ['tabs' => MenuOrder::with('lines')->where('order_type', 'counter')->where('payment', 'open')->whereNotIn('status', ['cancelled', 'completed'])->orderBy('id')->get(),
            'kiosk' => MenuOrder::with('lines')->where('order_type', 'kiosk')->where('payment', 'open')->where('status', 'placed')->orderBy('id')->get(),
            'ready' => MenuOrder::with('lines')->whereIn('order_type', ['counter', 'kiosk'])->where('payment', 'paid')->whereIn('status', ['placed', 'accepted', 'preparing', 'ready'])->orderBy('id')->get()];
    }

    // ── inside ───────────────────────────────────────────────────────────

    private function assertTab(MenuOrder $o): void
    {
        if ($o->order_type !== 'counter' || ! $o->isTab() || ! $o->open()) {
            throw new BooksException('That is not an open tab.');
        }
    }

    public function create(Channel $channel, Location $loc, string $service, ?User $by, string $label, string $payment, array $p, array $extra = []): MenuOrder
    {
        $today = today();
        $next = (int) MenuOrder::whereIn('order_type', ['counter', 'kiosk'])->where('location_id', $loc->id)->where('created_at', '>=', $today)->max('short_no') + 1;
        $o = MenuOrder::create($extra + ['number' => 'MO-'.Str::upper(Str::random(8)), 'track_token' => Str::random(40), 'channel_id' => $channel->id, 'order_type' => $channel->order_type === 'kiosk' ? 'kiosk' : 'counter', 'service' => $service, 'location_id' => $loc->id,
            'name' => $label !== '' ? $label : ($channel->order_type === 'kiosk' ? 'Kiosk' : 'Counter'), 'label' => $label !== '' ? $label : null, 'cashier_id' => $by?->id, 'status' => 'placed', 'payment' => $payment, 'asap' => true, 'fulfil_at' => now(), 'short_no' => $next,
            'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown'], 'currency_id' => Currency::getBaseCurrency()?->id, 'placed_at' => now()]);
        $o->update(['number' => 'MO-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT)]);

        return $o;
    }

    public function addLines(MenuOrder $o, array $lines, int $round): void
    {
        foreach ($lines as $l) {
            MenuOrderLine::create(['order_id' => $o->id, 'dish_id' => $l['dish']->id, 'name' => $l['dish']->name, 'quantity' => $l['quantity'], 'base_price' => $l['base_price'], 'unit_price' => $l['unit_price'],
                'options' => array_map(fn ($x) => ['id' => $x['id'], 'group' => $x['group'], 'name' => $x['name'], 'price_delta' => $x['price_delta']], $l['options']), 'note' => $l['note'], 'round' => $round,
                'uses' => $l['uses'] ?: null, 'linked' => array_map(fn ($d) => $d->id, $l['linked']) ?: null]);
        }
    }

    /** The lines of a tab as the pricing wants them again. */
    public function rebuild(MenuOrder $o): array
    {
        $out = [];
        foreach ($o->lines()->get() as $l) {
            $dish = Dish::find($l->dish_id) ?? throw new BooksException("{$l->name} is not on the menu any more: ask a manager.");
            $out[] = ['dish' => $dish, 'quantity' => (float) $l->quantity, 'base_price' => (float) $l->base_price, 'unit_price' => (float) $l->unit_price, 'options' => $l->options ?? [], 'uses' => $l->uses ?? [],
                'linked' => array_values(array_filter(array_map(fn ($id) => Dish::find($id), $l->linked ?? []))), 'note' => $l->note];
        }

        return $out;
    }

    public function retotal(MenuOrder $o): void
    {
        $p = $this->price(Location::findOrFail($o->location_id), $this->rebuild($o), (string) $o->service, true, 0.0, (string) $o->label);
        $o->update(['subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown']]);
    }

    /** The sale goes into the books and the order records how it was paid. */
    public function book(MenuOrder $o, array $p, array $paid, ?User $by): void
    {
        $voucher = $this->vouchers->placeOrder($p['payload'], $by);
        $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menu_order_id' => $o->id])]);
        $sale = $this->checkout->settle($voucher, $paid['tenders'], $by);
        $o->update(['voucher_id' => $voucher->id, 'sale_id' => $sale->id, 'payment' => 'paid', 'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => (float) $voucher->total_amount,
            'tax_breakdown' => $p['tax_breakdown'], 'service_charge' => $p['service_charge'], 'tip' => $p['tip'], 'tendered' => $paid['tendered'], 'change_due' => $paid['change'], 'tenders' => $paid['record'],
            'payment_method_id' => $paid['tenders'][0]['payment_method_id'] ?? null, 'settled_at' => now()]);
    }

    public function fire(MenuOrder $o): void
    {
        try {
            $this->kitchen->fire($o);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
