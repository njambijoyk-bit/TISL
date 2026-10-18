<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\Menus\Area;
use App\Models\Menus\Channel;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Table;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use Illuminate\Support\Carbon;

/**
 * What a guest can do from the table's QR code, with no sign-in: read the menu, order (onto the table's tab, which staff opened or, if allowed in settings, a scan opens),
 * ask for the bill and pay the tab by M-Pesa or card from the phone. The code in the QR is the only key: it can be renewed if it leaks.
 */
class TableGuest
{
    public function __construct(private CounterService $counter, private FloorService $floor, private PublicMenu $menu)
    {
    }

    public function table(string $qr): Table
    {
        if (! FloorService::installed()) {
            abort(404);
        }

        return Table::where('qr_token', $qr)->where('is_active', true)->firstOrFail();
    }

    /** Can this table be ordered from right now, and if not why. @return array{ok: bool, why: ?string} */
    public function allowed(Table $t): array
    {
        $s = MenusSettings::all();
        if (! $s['qr_ordering']) {
            return ['ok' => false, 'why' => 'Ordering from the table is not switched on: please ask a member of staff.'];
        }
        $ch = Channel::where('code', 'counter')->first();
        if (! $ch || ! $ch->is_active) {
            return ['ok' => false, 'why' => 'We are not taking orders from the tables right now.'];
        }
        $primary = $t->merged_into ? Table::find($t->merged_into) : $t;
        $tab = $this->floor->tabOf($primary);
        if ($tab && $tab->payment === 'pending') {
            return ['ok' => false, 'why' => 'The bill is being paid.'];
        }
        if (! $tab && $primary->state !== 'seated' && ! $s['qr_open_by_scan']) {
            return ['ok' => false, 'why' => 'Your table has not been opened yet: please ask a member of staff.'];
        }

        return ['ok' => true, 'why' => null];
    }

    /** @return array<string, mixed> */
    public function show(string $qr, ?Carbon $now = null): array
    {
        $t = $this->table($qr);
        $primary = $t->merged_into ? Table::find($t->merged_into) : $t;
        $tab = $this->floor->tabOf($primary);
        $loc = $this->floor->locationOf($primary);
        $menu = $this->menu->build($now ?? Carbon::now((string) config('app.timezone', 'Africa/Nairobi')), $loc);
        if (($ids = Channel::where('code', 'counter')->value('menu_ids'))) {
            $ids = is_array($ids) ? $ids : json_decode((string) $ids, true);
            $menu['menus'] = array_values(array_filter($menu['menus'], fn ($m) => in_array($m['id'], (array) $ids, true)));
        }
        $rules = $this->counter->rules();

        return ['table' => ['name' => $primary->name], 'allowed' => $this->allowed($t), 'menu' => $menu, 'bill_asked' => (bool) $primary->bill_asked_at,
            'tab' => $tab ? ['total' => (float) $tab->total, 'payment' => $tab->payment, 'lines' => $tab->lines->map(fn ($l) => ['name' => $l->name, 'quantity' => (float) $l->quantity, 'options' => array_column($l->options ?? [], 'name'), 'serving' => $l->serving ?? null, 'sides' => $l->sidesList(), 'amount' => round((float) $l->unit_price * (float) $l->quantity, 2)])->values()->all(),
                'service_charge_pct' => $rules['service_charge_on'] ? $rules['service_charge_pct'] : 0, 'paid' => false] : null,
            'tips_on' => $rules['tips_on'], 'payment_methods' => PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values()->all()];
    }

    public function order(string $qr, array $items, ?int $guests = null): MenuOrder
    {
        $t = $this->table($qr);
        $a = $this->allowed($t);
        if (! $a['ok']) {
            throw new BooksException((string) $a['why']);
        }
        $primary = $t->merged_into ? Table::find($t->merged_into) : $t;
        $tab = $this->floor->tabOf($primary);

        return $tab ? $this->counter->addToTab($tab, ['items' => $items]) : $this->counter->openTab(['table_id' => $primary->id, 'items' => $items, 'service' => 'dine_in', 'guests' => $guests]);
    }

    public function askBill(string $qr): Table
    {
        $t = $this->table($qr);
        $primary = $t->merged_into ? Table::find($t->merged_into) : $t;

        return $this->floor->askBill($primary);
    }

    /** @return array{order: MenuOrder, attempt: array, redirect_url: ?string} */
    public function pay(string $qr, PaymentMethod $method, string $phone, float $tip = 0.0): array
    {
        $t = $this->table($qr);
        $primary = $t->merged_into ? Table::find($t->merged_into) : $t;
        $tab = $this->floor->tabOf($primary) ?? throw new BooksException('There is nothing to pay yet.');
        if ($tip > 0 && ! $this->counter->rules()['tips_on']) {
            $tip = 0.0;
        }

        return $this->counter->startPhonePayment($tab, $method, $phone, ['tip' => $tip]);
    }
}
