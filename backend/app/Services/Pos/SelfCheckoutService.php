<?php

namespace App\Services\Pos;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
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
        return array_map(fn ($i) => ['variant_id' => $i['variant_id'], 'name' => $i['name'], 'price' => $i['price'], 'stock' => min(20, (int) floor($i['stock']))], $this->sales->catalogue($q, 24, (int) $s->location_id));
    }

    public function scan(Station $s, string $code): ?array
    {
        $i = $this->sales->scan($code, (int) $s->location_id);

        return $i ? ['variant_id' => $i['variant_id'], 'name' => $i['name'], 'price' => $i['price'], 'stock' => min(20, (int) floor($i['stock']))] : null;
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

    /** @return array<string, mixed> */
    public function quote(Station $s, array $items): array
    {
        [, $pre] = $this->sales->priceSelf($s, $this->clean($items));

        return ['lines' => array_map(fn ($l) => ['description' => $l['description'], 'quantity' => $l['quantity'], 'rate' => $l['rate'], 'amount' => $l['amount'], 'tax_amount' => $l['tax_amount'] ?? 0, 'tax_rate_percent' => $l['tax_rate_percent'] ?? null], $pre['lines']),
            'subtotal' => $pre['subtotal'], 'tax_total' => $pre['tax_total'], 'tax_breakdown' => $pre['tax_breakdown'] ?? [], 'total' => $pre['total']];
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
        [$data, $pre] = $this->sales->priceSelf($s, $items);
        $code = $this->code();

        if ($pay === 'counter') {   // a cashier recalls it (by the short code on the screen) and takes the cash
            $short = substr($code, 0, 4);
            $hold = DB::table('pos_holds')->insertGetId(['location_id' => $s->location_id, 'station_id' => $s->id, 'user_id' => 0, 'label' => "Code {$short} · {$s->name}",
                'cart' => json_encode(['items' => array_map(fn ($i, $l) => $i + ['name' => $l['description'], 'discount_pct' => 0], $items, $pre['lines']), 'customer_id' => null, 'mode' => 'cash']), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('pos_self_sessions')->insert(['station_id' => $s->id, 'session_code' => $code, 'pay' => 'counter', 'hold_id' => $hold, 'created_at' => now(), 'updated_at' => now()]);

            return ['session' => $code, 'pay' => 'counter', 'number' => $short, 'total' => (float) $pre['total']];
        }

        $method = ! empty($in['payment_method_id']) ? PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->whereKey((int) $in['payment_method_id'])->first() : null;
        if (! $method) {
            throw new BooksException('Choose M-Pesa.');
        }
        $phone = trim((string) ($in['phone'] ?? ''));
        if ($phone === '') {
            throw new BooksException('Enter your phone number for the M-Pesa prompt.');
        }

        return DB::transaction(function () use ($s, $data, $pre, $code, $method, $phone) {
            $order = $this->vouchers->placeOrder(array_merge($data, ['channel' => 'pos']), null);   // becomes the Cash Sale when the money arrives
            $order->update(['meta' => array_merge($order->meta ?? [], ['pos_self' => ['station_id' => $s->id, 'session' => $code]])]);
            DB::table('vouchers')->where('id', $order->id)->update(['station_id' => $s->id]);
            DB::table('pos_self_sessions')->insert(['station_id' => $s->id, 'session_code' => $code, 'pay' => 'screen', 'voucher_id' => $order->id, 'created_at' => now(), 'updated_at' => now()]);
            $r = $this->gateway->start($order, $method, ['phone' => $phone, 'name' => 'Self checkout '.$code], [], (float) $order->total_amount, null);
            $a = $r['attempt'];

            return ['session' => $code, 'pay' => 'screen', 'total' => (float) $order->total_amount,
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

    /** The customer backs out or the payment fails. Only while it is not paid. */
    public function cancel(Station $s, string $code, ?string $why = null): void
    {
        $row = $this->find($s, $code);
        if ($this->saleOf($row) || $row->status === 'paid') {
            throw new BooksException('This basket is already paid.');
        }
        DB::transaction(function () use ($row, $why) {
            if ($row->hold_id) {
                DB::table('pos_holds')->where('id', $row->hold_id)->delete();
            }
            if ($row->voucher_id && ($order = Voucher::find($row->voucher_id)) && $order->status === Voucher::POSTED) {
                $this->vouchers->cancel($order, $why ?? 'Cancelled at the self checkout', null);
            }
            DB::table('pos_self_sessions')->where('id', $row->id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        });
    }

    /** @return array{open: bool, minutes: ?int, tries: int, max: int} */
    public function callForHelp(Station $s): array
    {
        return $this->help->request($s);
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
