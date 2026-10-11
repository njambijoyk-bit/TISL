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
use App\Models\Menus\Ticket;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
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

    public function __construct(private MenuOrderService $orders, private VoucherService $vouchers, private CheckoutService $checkout, private KitchenService $kitchen)
    {
    }

    public function channel(): Channel
    {
        $c = Channel::where('code', 'counter')->first();
        if (! $c || ! $c->is_active) {
            throw new BooksException('The counter is not switched on (Menus → Settings → Ways to order).');
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
        $given = array_values(array_filter($given, fn ($t) => (float) ($t['amount'] ?? 0) > 0));
        if (! $given) {
            throw new BooksException('Enter how it was paid.');
        }
        $methods = PaymentMethod::where('is_active', true)->whereIn('id', array_map(fn ($t) => (int) ($t['payment_method_id'] ?? 0), $given))->get()->keyBy('id');
        $rows = [];
        $handed = 0.0;
        $cash = 0.0;
        foreach ($given as $t) {
            $m = $methods[(int) $t['payment_method_id']] ?? throw new BooksException('That way of paying is not available.');
            $amount = round((float) $t['amount'], 2);
            $handed += $amount;
            $cash += $m->kind === 'cash' ? $amount : 0;
            $rows[] = ['payment_method_id' => $m->id, 'amount' => $amount, 'reference' => ($t['reference'] ?? null) ?: null, 'name' => $m->name, 'cash' => $m->kind === 'cash'];
        }
        $handed = round($handed, 2);
        if ($handed + 0.004 < $total) {
            throw new BooksException('The payment is short by '.number_format($total - $handed, 2).'.');
        }
        $change = round($handed - $total, 2);
        if ($change > $cash + 0.004) {
            throw new BooksException('Only cash can be over what is owed (the change is given from it).');
        }
        for ($i = count($rows) - 1; $i >= 0 && $change > 0; $i--) {   // the change comes off the cash that was handed over
            if ($rows[$i]['cash']) {
                $take = min($change, $rows[$i]['amount']);
                $rows[$i]['amount'] = round($rows[$i]['amount'] - $take, 2);
                $change = round($change - $take, 2);
            }
        }

        return ['tenders' => array_map(fn ($r) => ['payment_method_id' => $r['payment_method_id'], 'amount' => $r['amount'], 'reference' => $r['reference']], array_values(array_filter($rows, fn ($r) => $r['amount'] > 0))),
            'tendered' => $handed, 'change' => round($handed - $total, 2), 'record' => array_map(fn ($r) => ['method' => $r['name'], 'amount' => $r['amount'], 'reference' => $r['reference']], array_values(array_filter($rows, fn ($r) => $r['amount'] > 0)))];
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
        [$channel, $loc, $lines] = $this->prepare($in, $now);
        $service = (string) ($in['service'] ?? '');
        $label = $this->label($in);
        if ($label === '') {
            throw new BooksException('Give the tab a name (a table, a person) so it can be found again.');
        }
        $p = $this->price($loc, $lines, $service, true, 0.0, $label);   // a tab's running total leaves out the service charge and tip: they are settled at the end
        $order = DB::transaction(function () use ($channel, $loc, $lines, $service, $by, $label, $p) {
            $order = $this->create($channel, $loc, $service, $by, $label, 'open', $p);
            $this->addLines($order, $lines, 1);

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
            $o->refresh();
            if (! Ticket::where('order_id', $o->id)->whereIn('status', ['new', 'started'])->exists()) {
                $o->update(['status' => 'completed', 'completed_at' => now()]);   // everything was served: the table is done
            }
        });

        return $o->fresh();
    }

    public function cancelTab(MenuOrder $o, ?string $reason, ?User $by = null): MenuOrder
    {
        $this->assertTab($o);

        return $this->orders->cancel($o, $reason, $by);
    }

    /** Tabs still open, and paid orders waiting to be handed over. @return array{tabs: Collection, ready: Collection} */
    public function board(): array
    {
        return ['tabs' => MenuOrder::with('lines')->where('order_type', 'counter')->where('payment', 'open')->whereNotIn('status', ['cancelled', 'completed'])->orderBy('id')->get(),
            'ready' => MenuOrder::with('lines')->where('order_type', 'counter')->where('payment', 'paid')->whereIn('status', ['placed', 'accepted', 'preparing', 'ready'])->orderBy('id')->get()];
    }

    // ── inside ───────────────────────────────────────────────────────────

    private function assertTab(MenuOrder $o): void
    {
        if ($o->order_type !== 'counter' || ! $o->isTab() || ! $o->open()) {
            throw new BooksException('That is not an open tab.');
        }
    }

    private function create(Channel $channel, Location $loc, string $service, ?User $by, string $label, string $payment, array $p): MenuOrder
    {
        $today = today();
        $next = (int) MenuOrder::where('order_type', 'counter')->where('location_id', $loc->id)->where('created_at', '>=', $today)->max('short_no') + 1;
        $o = MenuOrder::create(['number' => 'MO-'.Str::upper(Str::random(8)), 'track_token' => Str::random(40), 'channel_id' => $channel->id, 'order_type' => 'counter', 'service' => $service, 'location_id' => $loc->id,
            'name' => $label !== '' ? $label : 'Counter', 'label' => $label !== '' ? $label : null, 'cashier_id' => $by?->id, 'status' => 'placed', 'payment' => $payment, 'asap' => true, 'fulfil_at' => now(), 'short_no' => $next,
            'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown'], 'currency_id' => Currency::getBaseCurrency()?->id, 'placed_at' => now()]);
        $o->update(['number' => 'MO-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT)]);

        return $o;
    }

    private function addLines(MenuOrder $o, array $lines, int $round): void
    {
        foreach ($lines as $l) {
            MenuOrderLine::create(['order_id' => $o->id, 'dish_id' => $l['dish']->id, 'variant_id' => $l['dish']->variant_id, 'name' => $l['dish']->name, 'quantity' => $l['quantity'], 'base_price' => $l['base_price'], 'unit_price' => $l['unit_price'],
                'options' => array_map(fn ($x) => ['id' => $x['id'], 'group' => $x['group'], 'name' => $x['name'], 'price_delta' => $x['price_delta']], $l['options']), 'note' => $l['note'], 'round' => $round,
                'uses' => $l['uses'] ?: null, 'linked' => array_map(fn ($d) => $d->id, $l['linked']) ?: null]);
        }
    }

    /** The lines of a tab as the pricing wants them again. */
    private function rebuild(MenuOrder $o): array
    {
        $out = [];
        foreach ($o->lines()->get() as $l) {
            $dish = Dish::with('product')->find($l->dish_id) ?? throw new BooksException("{$l->name} is not on the menu any more: ask a manager.");
            $out[] = ['dish' => $dish, 'quantity' => (float) $l->quantity, 'base_price' => (float) $l->base_price, 'unit_price' => (float) $l->unit_price, 'options' => $l->options ?? [], 'uses' => $l->uses ?? [],
                'linked' => array_values(array_filter(array_map(fn ($id) => Dish::with('product')->find($id), $l->linked ?? []))), 'note' => $l->note];
        }

        return $out;
    }

    private function retotal(MenuOrder $o): void
    {
        $p = $this->price(Location::findOrFail($o->location_id), $this->rebuild($o), (string) $o->service, true, 0.0, (string) $o->label);
        $o->update(['subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown']]);
    }

    /** The sale goes into the books and the order records how it was paid. */
    private function book(MenuOrder $o, array $p, array $paid, ?User $by): void
    {
        $voucher = $this->vouchers->placeOrder($p['payload'], $by);
        $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menu_order_id' => $o->id])]);
        $sale = $this->checkout->settle($voucher, $paid['tenders'], $by);
        $o->update(['voucher_id' => $voucher->id, 'sale_id' => $sale->id, 'payment' => 'paid', 'subtotal' => $p['subtotal'], 'tax_total' => $p['tax_total'], 'total' => (float) $voucher->total_amount,
            'tax_breakdown' => $p['tax_breakdown'], 'service_charge' => $p['service_charge'], 'tip' => $p['tip'], 'tendered' => $paid['tendered'], 'change_due' => $paid['change'], 'tenders' => $paid['record'],
            'payment_method_id' => $paid['tenders'][0]['payment_method_id'] ?? null, 'settled_at' => now()]);
    }

    private function fire(MenuOrder $o): void
    {
        try {
            $this->kitchen->fire($o);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
