<?php

namespace App\Services\Pos;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use App\Models\Customer;
use App\Models\User;
use App\Services\Security\SignInGuard;
use App\Services\Security\SecurityLog;
use Illuminate\Support\Facades\Cache;
use App\Models\Pos\Station;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Self checkout. A customer scans or picks items on a screen opened at a station's secret address. The screen sells for cash only: it pays by an M-Pesa prompt on the customer's phone (the basket waits
 * as an order and becomes the Cash Sale when the money arrives) or it hands the basket to a staff counter, where a cashier recalls it and takes the cash. It makes no invoices, no sales orders for customers,
 * no credit notes, gives no discounts, opens no shift. The screen never carries a staff sign-in and reaches nothing but this class. A supervisor can step in with their email and PIN to cancel a stuck basket.
 */
class SelfCheckoutService
{
    public function __construct(private SaleService $sales, private StationService $stations, private VoucherService $vouchers, private GatewayPaymentService $gateway, private PinService $pins, private ReceiptService $receipts, private HelpService $help)
    {
    }

    public static function installed(): bool
    {
        return SaleService::installed() && Schema::hasTable('pos_self_sessions');
    }

    /** @return array<string, mixed> */
    public function config(Station $s): array
    {
        return ['name' => $s->name, 'business' => CompanyProfile::current()->name ?: config('app.name'), 'idle_seconds' => 90, 'ready' => self::installed(),
            'payment_methods' => PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->orderBy('sort_order')->get(['id', 'name'])->all(),
            'paper' => $this->stations->paperFor($s)];
    }

    /** @return array<int, array<string, mixed>> */
    public function catalogue(Station $s, string $q): array
    {
        $items = array_values(array_filter($this->sales->catalogue($q, 80, (int) $s->location_id), fn ($i) => (float) $i['price'] > 0));   // an item with no price is never offered to a customer

        return array_map(fn ($i) => ['variant_id' => $i['variant_id'], 'name' => $i['name'], 'price' => $i['price'], 'image' => $i['image'] ?? null, 'stock' => min(20, (int) floor($i['stock']))], array_slice($items, 0, 24));
    }

    public function scan(Station $s, string $code): ?array
    {
        $i = $this->sales->scan($code, (int) $s->location_id);

        return $i && (float) $i['price'] > 0 ? ['variant_id' => $i['variant_id'], 'name' => $i['name'], 'price' => $i['price'], 'image' => $i['image'] ?? null, 'stock' => min(20, (int) floor($i['stock']))] : null;
    }

    /** Only whole, sensible quantities of real items. */
    private function clean(array $items): array
    {
        $out = [];
        foreach (array_slice($items, 0, 60) as $i) {
            $q = (int) ($i['quantity'] ?? 0);
            if ($q < 1 || $q > 20 || empty($i['variant_id'])) {
                throw new BooksException('Each item is 1 to 20. Ask a member of staff for more.');
            }
            $out[] = ['variant_id' => (int) $i['variant_id'], 'quantity' => $q];
        }
        if (! $out) {
            throw new BooksException('Your basket is empty.');
        }

        return $out;
    }

    // ── a customer's own account at the screen ────────────────────────────

    /**
     * "Do you have an account with us?" Yes: they sign in with their email and password, which is checked here and nowhere else. Nothing is listed or hinted: a wrong answer says only that the two do not match.
     * What comes back is a short-lived key for this screen (not a staff or customer session) and the first name to greet them with.
     *
     * @return array{token: string, name: string, points: int}
     */
    public function customerLogin(Station $s, string $email, string $password, string $ip): array
    {
        $email = strtolower(trim($email));
        if ($wait = SignInGuard::wait($email, $ip)) {
            throw new BooksException("Too many tries. Please wait {$wait} seconds, or carry on as a guest.");
        }
        $user = User::where('email', $email)->first();
        if (! SignInGuard::check($password, $user?->password)) {
            SignInGuard::failed($email, $ip, request());
            SecurityLog::record('sign_in_failed', $user, request(), ['reason' => 'self_checkout'], SecurityLog::NOTICE, $email);
            throw new BooksException('That email and password do not match.');
        }
        SignInGuard::succeeded($email, $ip);
        $customer = $user->isCustomer() ? $user->customer : null;
        if (! $customer || $customer->status !== 'active' || ! $user->canLogin() || $user->force_password_change) {
            throw new BooksException('We could not sign you in here. Please carry on as a guest, or ask a member of staff.');
        }
        $token = Str::random(40);
        Cache::put($this->tokenKey($token), ['customer' => $customer->id, 'station' => $s->id], now()->addMinutes(20));
        SecurityLog::record('pos_self_sign_in', $user, request(), ['station' => $s->id], SecurityLog::NOTICE, $email);

        return ['token' => $token, 'name' => (string) ($customer->first_name ?: 'there'), 'points' => (int) $customer->loyalty_points];
    }

    public function customerLogout(?string $token): void
    {
        if ($token) {
            Cache::forget($this->tokenKey($token));
        }
    }

    private function tokenKey(string $token): string
    {
        return 'pos:self:customer:'.hash('sha256', $token);
    }

    /** The customer who signed in at this screen, or null for a guest. A token that is not good any more is an error: say so, so they sign in again. */
    private function customerFor(Station $s, ?string $token): ?Customer
    {
        if (! $token) {
            return null;
        }
        $k = $this->tokenKey($token);
        $a = Cache::get($k);
        $customer = $a && (int) $a['station'] === (int) $s->id ? Customer::active()->find($a['customer']) : null;
        if (! $customer) {
            throw new BooksException('Your sign-in has timed out. Please sign in again, or carry on as a guest.');
        }
        Cache::put($k, $a, now()->addMinutes(20));   // stays open while they are using the screen

        return $customer;
    }

    /**
     * What the codes they typed take off, one after another until the total is covered. Only for a signed-in customer.
     *
     * @return array<int, array{code: string, balance: float, applied: float}>
     */
    private function gifts(array $codes, float $total, ?Customer $customer): array
    {
        $codes = array_values(array_unique(array_filter(array_map(fn ($c) => trim((string) $c), $codes))));
        if (! $codes) {
            return [];
        }
        if (! $customer) {
            throw new BooksException('Sign in to use a gift voucher.');
        }
        $out = [];
        $left = $total;
        foreach (array_slice($codes, 0, 3) as $code) {
            $g = $this->sales->giftInfo($code, $customer);
            $applied = round(min($g['balance'], max($left, 0)), 2);
            $out[] = ['code' => $g['code'], 'balance' => $g['balance'], 'applied' => $applied];
            $left = round($left - $applied, 2);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function quote(Station $s, array $items, ?string $token = null, ?string $promo = null, array $giftCodes = []): array
    {
        $customer = $this->customerFor($s, $token);
        [, $pre] = $this->sales->priceSelf($s, $this->clean($items), $customer, $promo);
        $total = (float) $pre['total'];
        $gifts = $this->gifts($giftCodes, $total, $customer);
        $applied = round(array_sum(array_column($gifts, 'applied')), 2);

        return ['lines' => array_map(fn ($l) => ['description' => $l['description'], 'quantity' => $l['quantity'], 'rate' => $l['rate'], 'amount' => $l['amount'], 'discount' => $l['discount_amount'] ?? 0, 'tax_amount' => $l['tax_amount'] ?? 0, 'tax_rate_percent' => $l['tax_rate_percent'] ?? null], $pre['lines']),
            'subtotal' => $pre['subtotal'], 'discount' => round(array_sum(array_map(fn ($l) => (float) ($l['discount_amount'] ?? 0), $pre['lines'])), 2), 'tax_total' => $pre['tax_total'], 'tax_breakdown' => $pre['tax_breakdown'] ?? [],
            'total' => $total, 'gifts' => $gifts, 'gift_applied' => $applied, 'to_pay' => round(max(0, $total - $applied), 2),
            'customer' => $customer ? ['name' => (string) $customer->first_name, 'points' => (int) $customer->loyalty_points] : null];
    }

    /** The customer is done. @return array{session: string, pay: string, total: float, attempt?: array} */
    public function place(Station $s, array $in): array
    {
        if (! self::installed()) {
            throw new BooksException('Self checkout is not set up yet. Please ask a member of staff.');
        }
        $pay = (string) ($in['pay'] ?? '');
        if (! in_array($pay, ['screen', 'counter'], true)) {
            throw new BooksException('Choose how you would like to pay.');
        }
        $items = $this->clean((array) ($in['items'] ?? []));
        $customer = $this->customerFor($s, $in['customer_token'] ?? null);
        $promo = trim((string) ($in['promo_code'] ?? ''));
        [$data, $pre] = $this->sales->priceSelf($s, $items, $customer, $promo);
        $total = (float) $pre['total'];
        $gifts = $this->gifts((array) ($in['gift_codes'] ?? []), $total, $customer);
        $giftApplied = round(array_sum(array_column($gifts, 'applied')), 2);
        $code = $this->code();

        if ($pay === 'counter') {   // a cashier recalls it (by the short code on the screen) and takes the cash
            if ($gifts) {
                throw new BooksException('Gift vouchers are used at the till: give the code to the cashier, or pay with M-Pesa here.');
            }
            $short = substr($code, 0, 4);
            $hold = DB::table('pos_holds')->insertGetId(['location_id' => $s->location_id, 'station_id' => $s->id, 'user_id' => 0, 'label' => "Code {$short} · {$s->name}",
                'cart' => json_encode(['items' => array_map(fn ($i, $l) => $i + ['name' => $l['description'], 'discount_pct' => 0], $items, $pre['lines']), 'customer_id' => $customer?->id, 'customer_name' => $customer?->full_name,
                    'promo_code' => $promo !== '' ? $promo : null, 'mode' => 'cash']), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('pos_self_sessions')->insert(['station_id' => $s->id, 'session_code' => $code, 'pay' => 'counter', 'hold_id' => $hold, 'created_at' => now(), 'updated_at' => now()]);

            return ['session' => $code, 'pay' => 'counter', 'number' => $short, 'total' => $total];
        }

        $due = round($total - $giftApplied, 2);
        $method = null;
        $phone = '';
        if ($due > 0.005) {
            $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->whereKey((int) $in['payment_method_id'])->first() : null;
            if (! $method) {
                throw new BooksException('Choose M-Pesa.');
            }
            $phone = trim((string) ($in['phone'] ?? ''));
            if ($phone === '') {
                throw new BooksException('Enter your phone number for the M-Pesa prompt.');
            }
        }
        $tenders = [];
        if ($gifts) {
            $giftMethod = PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->first() ?? throw new BooksException('Gift vouchers are not set up yet.');
            foreach ($gifts as $g) {
                if ($g['applied'] > 0) {
                    $tenders[] = ['payment_method_id' => $giftMethod->id, 'amount' => $g['applied'], 'gift_voucher_code' => $g['code']];
                }
            }
        }

        return DB::transaction(function () use ($s, $data, $code, $method, $phone, $due, $tenders, $total) {
            $order = $this->vouchers->placeOrder(array_merge($data, ['channel' => 'pos']), null);   // becomes the Cash Sale when the money arrives
            $order->update(['meta' => array_merge($order->meta ?? [], ['pos_self' => ['station_id' => $s->id, 'session' => $code]])]);
            DB::table('vouchers')->where('id', $order->id)->update(['station_id' => $s->id]);
            DB::table('pos_self_sessions')->insert(['station_id' => $s->id, 'session_code' => $code, 'pay' => 'screen', 'voucher_id' => $order->id, 'created_at' => now(), 'updated_at' => now()]);
            if ($due <= 0.005) {   // gift vouchers cover all of it: paid now, no prompt on a phone
                $sale = app(\App\Services\Books\CheckoutService::class)->settle($order, $tenders, null);
                DB::table('vouchers')->where('id', $sale->id)->update(['station_id' => $s->id]);
                $sale->update(['channel' => 'pos', 'meta' => array_merge($sale->meta ?? [], ['pos' => ['station_id' => $s->id, 'cashier' => 'Self checkout']])]);
                DB::table('pos_self_sessions')->where('session_code', $code)->update(['status' => 'paid', 'updated_at' => now()]);

                return ['session' => $code, 'pay' => 'screen', 'paid' => true, 'number' => $sale->voucher_number, 'total' => $total];
            }
            $r = $this->gateway->start($order, $method, ['phone' => $phone, 'name' => 'Self checkout '.$code], $tenders, $due, null);
            $a = $r['attempt'];

            return ['session' => $code, 'pay' => 'screen', 'total' => $total, 'due' => $due,
                'attempt' => ['id' => $a->id, 'status' => $a->status, 'amount' => (float) $a->amount, 'token' => GatewayPaymentService::returnToken((int) $a->id)]];
        });
    }

    private function code(): string
    {
        do {
            $c = Str::upper(Str::random(10));
        } while (DB::table('pos_self_sessions')->where('session_code', $c)->exists());

        return $c;
    }

    private function find(Station $s, string $code): object
    {
        return DB::table('pos_self_sessions')->where('station_id', $s->id)->where('session_code', $code)->first() ?? throw new BooksException('That basket was not found.');
    }

    /** The cash sale this basket became, once paid. */
    private function saleOf(object $row): ?Voucher
    {
        if (! $row->voucher_id) {
            return null;
        }

        return Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::CASH_SALE))->where('source_voucher_id', $row->voucher_id)->where('status', Voucher::POSTED)->first();
    }

    /** @return array<string, mixed> */
    public function status(Station $s, string $code): array
    {
        $row = $this->find($s, $code);
        $sale = $this->saleOf($row);
        if ($sale && $row->status !== 'paid') {
            DB::table('pos_self_sessions')->where('id', $row->id)->update(['status' => 'paid', 'updated_at' => now()]);
        }

        return ['session' => $row->session_code, 'pay' => $row->pay, 'status' => $sale ? 'paid' : $row->status, 'number' => $sale?->voucher_number, 'total' => $sale ? (float) $sale->total_amount : null];
    }

    /**
     * The customer backs out, the screen gives up, or a supervisor clears it. The screen is released at once, but an M-Pesa order is only cancelled in the books when no payment can still arrive for it:
     * the customer may be typing their PIN right now. If Daraja says it is paid, the basket is paid (the screen is told). If the prompt is still open, the order stays live until it resolves or the sweep
     * (pos:sweep-self) closes it; a payment that lands after the screen was cleared is booked as a sale and staff are told.
     */
    public function cancel(Station $s, string $code, ?string $why = null): void
    {
        $row = $this->find($s, $code);
        if ($this->saleOf($row) || $row->status === 'paid') {
            throw new BooksException('This basket is already paid.');
        }
        $order = $row->voucher_id ? Voucher::find($row->voucher_id) : null;
        $live = $order && $order->status === Voucher::POSTED;
        $attempt = null;
        if ($live) {
            $attempt = \App\Models\Books\PaymentAttempt::where('voucher_id', $order->id)->orderByDesc('id')->first();
            if ($attempt && $attempt->status === \App\Models\Books\PaymentAttempt::PENDING) {
                try {
                    $attempt = $this->gateway->refresh($attempt);   // ask Daraja now: perhaps they have just paid
                } catch (\Throwable $e) {
                    report($e);
                }
                if ($this->saleOf($row) || $attempt->status === \App\Models\Books\PaymentAttempt::CONFIRMED) {
                    throw new BooksException('This basket has just been paid.');
                }
            }
        }
        DB::transaction(function () use ($row, $why, $order, $live, $attempt) {
            if ($row->hold_id) {
                DB::table('pos_holds')->where('id', $row->hold_id)->delete();
            }
            $stillOpen = isset($attempt) && $attempt && $attempt->status === \App\Models\Books\PaymentAttempt::PENDING;
            if ($live && ! $stillOpen) {
                $this->vouchers->cancel($order, $why ?? 'Cancelled at the self checkout', null);
            }
            DB::table('pos_self_sessions')->where('id', $row->id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        });
    }

    /** Close the orders of screens that were cleared while a payment prompt was open, once the prompt has had time to resolve. @return int how many */
    public function sweep(int $minutes = 15): int
    {
        if (! self::installed()) {
            return 0;
        }
        $n = 0;
        foreach (DB::table('pos_self_sessions')->where('pay', 'screen')->whereIn('status', ['pending', 'cancelled'])->where('created_at', '<', now()->subMinutes($minutes))->whereNotNull('voucher_id')->get() as $row) {
            try {
                if ($this->saleOf($row)) {
                    DB::table('pos_self_sessions')->where('id', $row->id)->update(['status' => 'paid', 'updated_at' => now()]);
                    continue;
                }
                $order = Voucher::find($row->voucher_id);
                if ($order && $order->status === Voucher::POSTED) {
                    $attempt = \App\Models\Books\PaymentAttempt::where('voucher_id', $order->id)->orderByDesc('id')->first();
                    if ($attempt && $attempt->status === \App\Models\Books\PaymentAttempt::PENDING) {
                        $attempt = $this->gateway->refresh($attempt);
                        if ($attempt->status === \App\Models\Books\PaymentAttempt::CONFIRMED) {
                            continue;   // it settled: the sale is made
                        }
                    }
                    $this->vouchers->cancel($order, 'Not paid at the self checkout', null);
                    $n++;
                }
                DB::table('pos_self_sessions')->where('id', $row->id)->update(['status' => 'cancelled', 'updated_at' => now()]);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $n;
    }

    /** @return array{open: bool, minutes: ?int, tries: int, max: int} */
    public function callForHelp(Station $s): array
    {
        return $this->help->request($s);
    }

    public function cancelHelp(Station $s): void
    {
        $this->help->cancel($s);
    }

    /** @return array{open: bool, minutes: ?int, tries: int, max: int} */
    public function helpStatus(Station $s): array
    {
        return $this->help->status($s);
    }

    /** A supervisor clears a stuck basket with their email and PIN. */
    public function assist(Station $s, string $code, string $email, string $pin): void
    {
        $sup = $this->pins->assist($s, $email, $pin, 'void', ['session' => $code]);
        $this->cancel($s, $code, "Cleared by supervisor {$sup->name} at the self checkout");
    }

    /** The customer copy of the receipt of a paid basket. @return array<string, mixed> */
    public function receipt(Station $s, string $code): array
    {
        $sale = $this->saleOf($this->find($s, $code)) ?? throw new BooksException('There is no receipt yet: the basket is not paid.');

        return $this->receipts->data($sale, null, false, 1);
    }
}
