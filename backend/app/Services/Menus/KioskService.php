<?php

namespace App\Services\Menus;

use App\Models\Books\PaymentMethod;
use App\Models\CompanyProfile;
use App\Models\Location;
use App\Models\Menus\Kiosk;
use App\Models\Menus\MenuOrder;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * The self-order kiosk: a screen in the venue where a guest picks dishes with big buttons, chooses dine in or take out and either pays at the screen (an M-Pesa prompt on their phone) or
 * takes a number and pays the cashier (the kitchen starts when the cashier takes the money). No account, no sign-in: the screen is opened at an address with a secret in it.
 * Orders are priced like the counter's (a dine-in service charge if set; no tips at the screen) and carry a session code that is printed on the receipt.
 */
class KioskService
{
    private static ?bool $installed = null;

    public static function installed(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('menus_kiosks') && Schema::hasColumn('menus_orders', 'session_code');
        }

        return self::$installed ??= Schema::hasTable('menus_kiosks') && Schema::hasColumn('menus_orders', 'session_code');
    }

    public function __construct(private CounterService $counter, private MenuOrderService $orders, private VoucherService $vouchers, private GatewayPaymentService $gateway, private PublicMenu $menu)
    {
    }

    // ── set-up (Menus → Settings → Kiosks) ───────────────────────────────

    public function save(array $d, ?int $id = null): Kiosk
    {
        $k = $id ? Kiosk::findOrFail($id) : new Kiosk(['pay_at_screen' => true, 'pay_at_counter' => true, 'idle_seconds' => 60, 'is_active' => true]);
        $name = trim((string) ($d['name'] ?? $k->name));
        if ($name === '') {
            throw new BooksException('Give the kiosk a name.');
        }
        $loc = (int) ($d['location_id'] ?? $k->location_id);
        if (! $loc || ! DB::table('locations')->where('id', $loc)->exists()) {
            throw new BooksException('Choose the branch this kiosk is at.');
        }
        $idle = (int) ($d['idle_seconds'] ?? $k->idle_seconds);
        if ($idle < 15 || $idle > 600) {
            throw new BooksException('The screen resets after 15 to 600 seconds without a touch.');
        }
        $screen = (bool) ($d['pay_at_screen'] ?? $k->pay_at_screen);
        $counter = (bool) ($d['pay_at_counter'] ?? $k->pay_at_counter);
        if (! $screen && ! $counter) {
            throw new BooksException('Let guests pay at the screen, at the counter, or both.');
        }
        $welcome = array_key_exists('welcome', $d) ? mb_substr(trim((string) $d['welcome']), 0, 160) : $k->welcome;
        $k->fill(['name' => $name, 'location_id' => $loc, 'idle_seconds' => $idle, 'pay_at_screen' => $screen, 'pay_at_counter' => $counter, 'welcome' => $welcome === '' ? null : $welcome]
            + (array_key_exists('is_active', $d) ? ['is_active' => (bool) $d['is_active']] : []));
        if (! $k->exists) {
            $k->token = Str::random(32);
        }
        $k->save();

        return $k->fresh();
    }

    /** A new secret: the old address stops working (for a screen that was stolen or an address that was shared). */
    public function renewToken(Kiosk $k): Kiosk
    {
        $k->update(['token' => Str::random(32)]);

        return $k->fresh();
    }

    public function url(Kiosk $k): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/kiosk/'.$k->token;
    }

    // ── the screen ───────────────────────────────────────────────────────

    public function forToken(string $token): Kiosk
    {
        if (! self::installed()) {
            abort(404);
        }

        return Kiosk::where('token', $token)->where('is_active', true)->firstOrFail();
    }

    /** @return array<string, mixed> */
    public function config(Kiosk $k, ?Carbon $now = null): array
    {
        $channel = $this->counter->channel('kiosk');
        $menu = $this->menu->build($now ?? Carbon::now((string) config('app.timezone', 'Africa/Nairobi')), (int) $k->location_id);
        if ($channel->menu_ids) {
            $menu['menus'] = array_values(array_filter($menu['menus'], fn ($m) => in_array($m['id'], $channel->menu_ids, true)));
        }
        $rules = $this->counter->rules();

        return ['name' => $k->name, 'business' => CompanyProfile::current()->name ?: config('app.name'), 'welcome' => $k->welcome, 'idle_seconds' => $k->idle_seconds, 'pay_at_screen' => $k->pay_at_screen, 'pay_at_counter' => $k->pay_at_counter,
            'services' => CounterService::SERVICES, 'service_charge_pct' => $rules['service_charge_on'] ? $rules['service_charge_pct'] : 0, 'menu' => $menu,
            'payment_methods' => $k->pay_at_screen ? PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->orderBy('sort_order')->get(['id', 'name'])->all() : []];
    }

    /** @return array{0: \App\Models\Menus\Channel, 1: Location, 2: array, 3: array} */
    private function lines(Kiosk $k, array $in, ?Carbon $now): array
    {
        $channel = $this->counter->channel('kiosk');
        $loc = Location::findOrFail($k->location_id);
        [$lines] = $this->orders->dishLines($channel, $loc, $now ?? now(), $this->orders->wanted($in['items'] ?? []));
        $service = (string) ($in['service'] ?? '');
        if (! isset(CounterService::SERVICES[$service])) {
            throw new BooksException('Choose dine in or take out.');
        }

        return [$channel, $loc, $lines, $this->counter->price($loc, $lines, $service, false, 0.0, '', app(PackagingCheckout::class)->resolve($lines, $service !== 'dine_in', null))];
    }

    public function quote(Kiosk $k, array $in, ?Carbon $now = null): array
    {
        [, , $lines, $p] = $this->lines($k, $in, $now);

        return ['subtotal' => $p['subtotal'], 'service_charge' => $p['service_charge'], 'tax_total' => $p['tax_total'], 'total' => $p['total'], 'tax_breakdown' => $p['tax_breakdown'],
            'packaging' => app(PackagingCheckout::class)->resolve($lines, (string) ($in['service'] ?? '') !== 'dine_in', null), 'condiments' => app(Condiments::class)->resolve($lines, null)];
    }

    /**
     * The guest is done. Paying at the screen starts the M-Pesa prompt and the order waits for the money; paying at the counter gives a number to take to the cashier.
     *
     * @return array{order: MenuOrder, attempt?: array}
     */
    public function place(Kiosk $k, array $in, ?Carbon $now = null): array
    {
        $pay = (string) ($in['pay'] ?? '');
        if (! in_array($pay, ['screen', 'counter'], true) || ($pay === 'screen' && ! $k->pay_at_screen) || ($pay === 'counter' && ! $k->pay_at_counter)) {
            throw new BooksException('Choose how you would like to pay.');
        }
        $method = null;
        if ($pay === 'screen') {
            $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->whereKey((int) $in['payment_method_id'])->first() : null;
            if (! $method) {
                throw new BooksException('Choose M-Pesa.');
            }
            if (trim((string) ($in['phone'] ?? '')) === '') {
                throw new BooksException('Enter your phone number for the M-Pesa prompt.');
            }
        }
        [$channel, $loc, $lines, $p] = $this->lines($k, $in, $now);
        $service = (string) $in['service'];
        $session = $this->session();

        return DB::transaction(function () use ($k, $channel, $loc, $lines, $p, $pay, $method, $service, $session, $in) {
            $o = $this->counter->create($channel, $loc, $service, null, '', $pay === 'screen' ? 'pending' : 'open', $p, ['kiosk_id' => $k->id, 'session_code' => $session]);
            $this->counter->addLines($o, $lines, 1);
            app(PackagingCheckout::class)->store($o, app(PackagingCheckout::class)->resolve($lines, $service !== 'dine_in', null), null);   // as the rules ask: the cashier may change it when it is paid
            app(Condiments::class)->store($o, app(Condiments::class)->resolve($lines, null), null);
            if ($pay === 'counter') {
                return ['order' => $o->fresh()];
            }
            $voucher = $this->vouchers->placeOrder($p['payload'], null);
            $voucher->update(['meta' => array_merge($voucher->meta ?? [], ['menu_order_id' => $o->id])]);
            $o->update(['voucher_id' => $voucher->id, 'total' => (float) $voucher->total_amount, 'payment_method_id' => $method->id, 'service_charge' => $p['service_charge']]);
            $r = $this->gateway->start($voucher, $method, ['phone' => trim((string) $in['phone']), 'name' => 'Kiosk '.$session], [], (float) $voucher->total_amount, null);
            $a = $r['attempt'];

            return ['order' => $o->fresh(), 'attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'token' => GatewayPaymentService::returnToken((int) $a->id)]];
        });
    }

    private function session(): string
    {
        do {
            $code = Str::upper(Str::random(10));
        } while (MenuOrder::where('session_code', $code)->exists());

        return $code;
    }

    private function find(Kiosk $k, string $session): MenuOrder
    {
        return MenuOrder::where('kiosk_id', $k->id)->where('session_code', $session)->firstOrFail();
    }

    /** @return array<string, mixed> what the screen shows while the guest waits */
    public function status(Kiosk $k, string $session): array
    {
        $o = $this->find($k, $session)->loadMissing('lines');

        return ['number' => $o->short_no, 'session' => $o->session_code, 'status' => $o->status, 'payment' => $o->payment, 'service' => $o->service, 'total' => (float) $o->total,
            'lines' => $o->lines->map(fn ($l) => ['name' => $l->name, 'quantity' => (float) $l->quantity, 'options' => array_column($l->options ?? [], 'name'), 'serving' => $l->serving ?? null, 'sides' => $l->sidesList()])->all()];
    }

    /** The guest backed out, or the payment did not go through. Only while it is not paid. */
    public function cancel(Kiosk $k, string $session): MenuOrder
    {
        $o = $this->find($k, $session);
        if (! in_array($o->payment, ['pending', 'open'], true) || ! $o->open()) {
            throw new BooksException('This order can not be cancelled here.');
        }

        return $this->orders->cancel($o, 'Cancelled at the kiosk');
    }

    public function receipt(Kiosk $k, string $session): array
    {
        return app(ReceiptService::class)->for($this->find($k, $session), 32);
    }

    /** Kiosk orders whose guest never paid the cashier. @return int how many */
    public function sweep(int $minutes = 60): int
    {
        $n = 0;
        foreach (MenuOrder::where('order_type', 'kiosk')->where('payment', 'open')->where('status', 'placed')->where('created_at', '<', now()->subMinutes($minutes))->get() as $o) {
            try {
                $this->orders->cancel($o, 'Not paid at the counter in time');
                $n++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }
}
