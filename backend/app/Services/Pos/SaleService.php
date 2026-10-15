<?php

namespace App\Services\Pos;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Books\Ledger;
use App\Models\Currency;
use App\Models\Customer;
use App\Models\Location;
use App\Models\Pos\Station;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Books\TenderCheck;
use App\Services\Books\VoucherService;
use App\Services\Stock\StockJobService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The cashier's checkout. The till sends what is in the basket (variants and quantities), never prices: the books price it, tax it and post it as a Cash Sale like any other, with the cashier as
 * its maker and the station on it. Each sale carries a key made by the till, so a double tap or a retry finds the sale already made instead of making another.
 */
class SaleService
{
    /** What the till can make: a cash sale, an invoice on the customer's account, a sales order (with or without a deposit). */
    public const MODES = ['cash' => ['base' => VoucherType::CASH_SALE, 'perm' => 'pos.sell'], 'invoice' => ['base' => VoucherType::SALES, 'perm' => 'pos.invoice'], 'order' => ['base' => VoucherType::SALES_ORDER, 'perm' => 'pos.order']];

    public function __construct(private VoucherService $vouchers, private TenderCheck $tenders, private StationService $stations)
    {
    }

    public static function installed(): bool
    {
        return StationService::installed() && Schema::hasTable('pos_holds') && Schema::hasTable('pos_sale_keys') && Schema::hasColumn('vouchers', 'station_id');
    }

    // ── what the till needs to start ──────────────────────────────────────

    /** @return array<string, mixed> */
    public function context(User $u, ?int $stationId = null): array
    {
        $choices = $this->stations->choicesFor($u);
        $station = $this->stations->resolveFor($u, null, $stationId);
        $branch = $station ? $this->stations->branch((int) $station->location_id) : null;
        $methods = PaymentMethod::where('is_active', true)->where('is_online', false)->where('kind', '!=', 'gift_voucher')->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'kind', 'requires_reference'])   // paid at the till: cash, or a card / mobile payment the cashier sees confirmed
            ->map(fn ($m) => ['id' => $m->id, 'name' => $m->name, 'kind' => $m->kind, 'requires_reference' => (bool) $m->requires_reference])->values();
        $cur = Currency::getBaseCurrency();
        $access = app(Authorizer::class);

        return ['stations' => $choices, 'station' => $station ? ['id' => $station->id, 'name' => $station->name, 'code' => $station->code, 'location_id' => (int) $station->location_id,
            'location' => Location::whereKey($station->location_id)->value('name'), 'paper' => $this->stations->paperFor($station)] : null,
            'branch' => $branch, 'methods' => $methods, 'currency' => $cur ? ['code' => $cur->code, 'symbol' => $cur->symbol ?? $cur->code] : null,
            'can' => ['sell' => $access->allows($u, 'pos.sell'), 'invoice' => $access->allows($u, 'pos.invoice'), 'order' => $access->allows($u, 'pos.order'), 'discount' => $access->allows($u, 'pos.discount'), 'void' => $access->allows($u, 'pos.void'), 'hold' => $access->allows($u, 'pos.sell')]];
    }

    // ── the catalogue ─────────────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> */
    public function catalogue(string $q = '', int $limit = 30): array
    {
        $q = trim($q);
        $like = '%'.$q.'%';
        $vars = ProductVariant::with('product:id,name,sku,status,is_for_sale')->where('status', ProductVariant::STATUS_ACTIVE)
            ->whereHas('product', fn ($p) => $p->where('status', 'active')->where('is_for_sale', true))
            ->when($q !== '', fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like)->orWhere('barcode', $q)
                ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $like)->orWhere('sku', 'like', $like))))
            ->orderBy('product_id')->orderByDesc('is_default')->limit($limit)->get();

        return $vars->map(fn ($v) => $this->row($v))->values()->all();
    }

    /** One scan: the variant whose barcode (or SKU) it is, or null. */
    public function scan(string $code): ?array
    {
        $code = trim($code);
        if ($code === '') {
            return null;
        }
        $tries = [$code];
        if (ctype_digit($code) && strlen($code) === 12) {
            $tries[] = '0'.$code;
        } elseif (ctype_digit($code) && strlen($code) === 13 && $code[0] === '0') {
            $tries[] = substr($code, 1);
        }
        $base = fn () => ProductVariant::with('product:id,name,sku,status,is_for_sale')->where('status', ProductVariant::STATUS_ACTIVE)
            ->whereHas('product', fn ($p) => $p->where('status', 'active')->where('is_for_sale', true));
        $v = $base()->whereIn('barcode', $tries)->first() ?? $base()->whereRaw('LOWER(sku) = ?', [strtolower($code)])->first();

        return $v ? $this->row($v) : null;
    }

    private function row(ProductVariant $v): array
    {
        $name = (string) $v->product?->name;
        $vn = trim((string) $v->name);

        return ['variant_id' => $v->id, 'product_id' => $v->product_id, 'name' => $vn !== '' && strcasecmp($vn, $name) !== 0 && strcasecmp($vn, 'Standard') !== 0 ? "{$name} — {$vn}" : $name,
            'sku' => $v->sku, 'barcode' => $v->barcode, 'price' => app(StockJobService::class)->systemPrice((int) $v->id)];
    }

    // ── pricing ───────────────────────────────────────────────────────────

    /** The lines the books price, from the basket. Each item: variant_id, quantity, discount_pct?. */
    private function lines(User $u, array $items, int $locationId): array
    {
        if (! $items) {
            throw new BooksException('The basket is empty.');
        }
        $canDiscount = app(Authorizer::class)->allows($u, 'pos.discount');
        $ids = array_map(fn ($i) => (int) ($i['variant_id'] ?? 0), $items);
        $vars = ProductVariant::with('product:id,name,is_for_sale,status')->whereIn('id', $ids)->get()->keyBy('id');
        $rows = [];
        foreach ($items as $i) {
            $v = $vars[(int) ($i['variant_id'] ?? 0)] ?? throw new BooksException('One of the items is not in the catalogue any more.');
            if (! $v->product || ! $v->product->is_for_sale || $v->status !== ProductVariant::STATUS_ACTIVE) {
                throw new BooksException("{$v->product?->name} is not for sale.");
            }
            $qty = round((float) ($i['quantity'] ?? 0), 4);
            if ($qty <= 0) {
                throw new BooksException("Give a quantity for {$v->product->name}.");
            }
            $pct = (float) ($i['discount_pct'] ?? 0);
            if ($pct < 0 || $pct > 100) {
                throw new BooksException('A discount is between 0 and 100 percent.');
            }
            if ($pct > 0 && ! $canDiscount) {
                throw new BooksException('You may not give discounts.');
            }
            $rows[] = ['type' => 'product', 'product_id' => (int) $v->product_id, 'variant_id' => (int) $v->id, 'quantity' => $qty, 'location_id' => $locationId, '_pct' => $pct];
        }

        return $rows;
    }

    private function mode(User $u, array $in): string
    {
        $mode = (string) ($in['mode'] ?? 'cash');
        if (! isset(self::MODES[$mode])) {
            throw new BooksException('Choose a cash sale, an invoice or a sales order.');
        }
        if (! app(Authorizer::class)->allows($u, self::MODES[$mode]['perm'])) {
            throw new BooksException('You may not make '.['cash' => 'cash sales', 'invoice' => 'invoices', 'order' => 'sales orders'][$mode].'.');
        }

        return $mode;
    }

    private function customer(array $in, string $mode): ?Customer
    {
        if (empty($in['customer_id'])) {
            if ($mode !== 'cash') {
                throw new BooksException('Choose the customer: '.($mode === 'invoice' ? 'an invoice' : 'a sales order').' is made out to someone.');
            }

            return null;
        }

        return Customer::active()->find((int) $in['customer_id']) ?? throw new BooksException('That customer is not available.');
    }

    private function base(User $u, Station $station, ?int $customerId, string $mode = 'cash', array $meta = []): array
    {
        $type = VoucherType::byBase(self::MODES[$mode]['base']) ?? throw new BooksException('That kind of document is switched off in Books.');

        return ['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'location_id' => (int) $station->location_id, 'currency_id' => Currency::getBaseCurrency()?->id, 'customer_id' => $customerId,
            'channel' => 'pos', 'narration' => 'Point of sale — '.$station->name,
            'meta' => ['pos' => ['station_id' => $station->id, 'station' => $station->name, 'cashier' => $u->name]] + ($customerId ? [] : ['guest' => true, 'contact' => ['name' => 'Walk-in']]) + $meta];
    }

    private function station(User $u, ?int $stationId): Station
    {
        return $this->stations->resolveFor($u, null, $stationId) ?? throw new BooksException('You have no station to sell from. Ask a manager to add one at your branch.');
    }

    /** Price the basket without posting: lines, tax and the total, as the books will post them. @return array<string, mixed> */
    public function price(User $u, array $in): array
    {
        $station = $this->station($u, isset($in['station_id']) ? (int) $in['station_id'] : null);
        [$data, $pre] = $this->priced($u, $station, $in);

        return ['station_id' => $station->id, 'lines' => $pre['lines'], 'subtotal' => $pre['subtotal'], 'tax_total' => $pre['tax_total'], 'tax_breakdown' => $pre['tax_breakdown'], 'total' => $pre['total'], 'warnings' => $pre['warnings'] ?? []];
    }

    /** @return array{0: array, 1: array} the data to post, and its preview */
    private function priced(User $u, Station $station, array $in): array
    {
        $rows = $this->lines($u, (array) ($in['items'] ?? []), (int) $station->location_id);
        $mode = $this->mode($u, $in);
        $customerId = $this->customer($in, $mode)?->id;
        $data = $this->base($u, $station, $customerId, $mode);
        $clean = fn (array $rs) => array_map(fn ($r) => array_diff_key($r, ['_pct' => 1]), $rs);
        $pre = $this->vouchers->preview($data + ['lines' => $clean($rows)], $u);
        if (array_filter(array_column($rows, '_pct'))) {   // a percentage comes off each line's price: worked out from the price the books gave it
            foreach ($rows as $k => $r) {
                if ($r['_pct'] > 0) {
                    $gross = round((float) $pre['lines'][$k]['quantity'] * (float) $pre['lines'][$k]['rate'], 2);
                    $rows[$k]['discount'] = round($gross * $r['_pct'] / 100, 2);
                }
            }
            $pre = $this->vouchers->preview($data + ['lines' => $clean($rows)], $u);
        }
        $data['lines'] = $clean($rows);

        return [$data, $pre];
    }

    // ── selling ───────────────────────────────────────────────────────────

    /**
     * Post what the basket comes to. $in: key, mode (cash | invoice | order), items, station_id?, customer_id?, tenders?
     *   cash     paid in full at the till (tenders needed); a Cash Sale
     *   invoice  put on the customer's account within their credit limit (tenders, if any, are a part payment made now)
     *   order    a Sales Order for the customer (tenders, if any, are a deposit, kept as the customer's advance and used when the order is invoiced)
     *
     * @return array<string, mixed>
     */
    public function sell(User $u, array $in): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 170_pos_sales.sql first.');
        }
        $key = trim((string) ($in['key'] ?? ''));
        if ($key === '' || strlen($key) > 64) {
            throw new BooksException('The sale has no key: reload the till and try again.');
        }
        $seen = DB::table('pos_sale_keys')->where('user_id', $u->id)->where('sale_key', $key)->first();
        if ($seen) {
            return $this->replay($seen);
        }
        $mode = $this->mode($u, $in);
        $customer = $this->customer($in, $mode);
        $station = $this->station($u, isset($in['station_id']) ? (int) $in['station_id'] : null);
        [$data, $pre] = $this->priced($u, $station, $in);
        $total = (float) $pre['total'];
        $paid = null;
        $now = null;   // money taken now on an invoice or an order
        if ($mode === 'cash') {
            $paid = $this->tenders->check((array) ($in['tenders'] ?? []), $total);
            $data['tenders'] = $paid['tenders'];
        } else {
            $this->creditCheck($mode, $customer, $total);
            if ($mode === 'invoice') {
                $data['due_date'] = today()->addDays((int) ($customer->credit_terms_days ?: 30))->toDateString();
            }
            $given = array_values(array_filter((array) ($in['tenders'] ?? []), fn ($t) => (float) ($t['amount'] ?? 0) > 0));
            if ($given) {
                $now = $this->tenders->check($given, round(array_sum(array_map(fn ($t) => (float) $t['amount'], $given)), 2));   // exact: no change on a part payment
                if ($now['tendered'] - $total > 0.004 && $mode === 'invoice') {
                    throw new BooksException('That is more than the invoice. Take the exact amount, or make it a cash sale.');
                }
            }
        }

        try {
            $voucher = DB::transaction(function () use ($u, $key, $station, $data, $mode, $customer, $now) {
                DB::table('pos_sale_keys')->insert(['user_id' => $u->id, 'sale_key' => $key, 'created_at' => now(), 'updated_at' => now()]);
                $v = $this->post($data, $u);
                DB::table('vouchers')->where('id', $v->id)->update(['station_id' => $station->id]);
                if ($now && $mode === 'invoice') {
                    $this->vouchers->receive($v, ['tenders' => $now['tenders'], 'amount' => $now['tendered'], 'channel' => 'pos', 'narration' => "Paid at the till — {$v->voucher_number}"], $u);
                } elseif ($now && $mode === 'order') {
                    $this->deposit($v, $customer, $now, $station, $u);
                }
                DB::table('pos_sale_keys')->where('user_id', $u->id)->where('sale_key', $key)->update(['voucher_id' => $v->id, 'updated_at' => now()]);

                return $v;
            });
        } catch (QueryException $e) {
            $seen = DB::table('pos_sale_keys')->where('user_id', $u->id)->where('sale_key', $key)->first();
            if ($seen) {   // the same sale arrived twice at once: the other one won
                return $this->replay($seen);
            }
            throw $e;
        }

        return $this->summary($voucher->fresh(), $paid, false) + ['mode' => $mode, 'paid_now' => $now ? $now['tendered'] : null, 'lines' => $pre['lines'], 'tax_breakdown' => $pre['tax_breakdown']];
    }

    /** An invoice or an order is only made out for a customer who may have it: an invoice needs a credit account with room left. */
    private function creditCheck(string $mode, Customer $customer, float $total): void
    {
        if ($mode !== 'invoice') {
            return;
        }
        $limit = (float) ($customer->credit_limit ?? 0);
        if (! $customer->has_credit_account || $limit <= 0) {
            throw new BooksException("{$customer->full_name} has no credit account: make this a cash sale, or ask a manager to open one.");
        }
        $money = app(\App\Services\CurrencyConversionService::class);
        $ledger = Ledger::where('customer_id', $customer->id)->first();
        $owed = $ledger ? app(LedgerService::class)->balance($ledger->id) : 0.0;   // what they owe, in the base currency
        $limitBase = $money->convert($limit, $money->currencyFrom($customer->credit_currency_id ?? $customer->currency_id), $money->getBaseCurrency());
        if ($owed + $total - $limitBase > 0.005) {
            $room = max(0.0, round($limitBase - $owed, 2));
            throw new BooksException("This would take {$customer->full_name} over their credit limit (room left: ".number_format($room, 2).'). Take part payment, or ask a manager.');
        }
    }

    /** A deposit on an order is a receipt kept as the customer's advance, tied to the order by its number. */
    private function deposit(Voucher $order, Customer $customer, array $paid, Station $station, User $u): void
    {
        $type = VoucherType::byBase(VoucherType::RECEIPT) ?? throw new BooksException('The Receipt voucher type is switched off.');
        $receipt = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'location_id' => $order->location_id, 'customer_id' => $customer->id, 'currency_id' => $order->currency_id,
            'tenders' => $paid['tenders'], 'amount' => $paid['tendered'], 'is_advance' => true, 'advance_for' => "Deposit for {$order->voucher_number}", 'source_voucher_id' => $order->id, 'channel' => 'pos',
            'narration' => "Deposit for {$order->voucher_number}"], $u);
        DB::table('vouchers')->where('id', $receipt->id)->update(['station_id' => $station->id]);
        $order->update(['meta' => array_merge($order->meta ?? [], ['pos_deposit' => ['receipt_id' => $receipt->id, 'receipt' => $receipt->voucher_number, 'amount' => $paid['tendered']]])]);
    }

    /** Matching customers for an invoice or an order, with what they may owe. @return array<int, array<string, mixed>> */
    public function customers(string $q): array
    {
        $q = trim($q);
        if (strlen($q) < 2) {
            return [];
        }
        $money = app(\App\Services\CurrencyConversionService::class);
        $rows = Customer::active()->search($q)->orderBy('first_name')->limit(15)->get();
        $ledgers = Ledger::whereIn('customer_id', $rows->pluck('id'))->pluck('id', 'customer_id');

        return $rows->map(function (Customer $c) use ($ledgers, $money) {
            $credit = $c->has_credit_account && (float) $c->credit_limit > 0;
            $room = null;
            if ($credit) {
                $owed = isset($ledgers[$c->id]) ? app(LedgerService::class)->balance($ledgers[$c->id]) : 0.0;
                $limit = $money->convert((float) $c->credit_limit, $money->currencyFrom($c->credit_currency_id ?? $c->currency_id), $money->getBaseCurrency());
                $room = max(0.0, round($limit - $owed, 2));
            }

            return ['id' => $c->id, 'name' => $c->full_name, 'company' => $c->company_name, 'phone' => $c->phone, 'email' => $c->email, 'credit' => $credit, 'credit_room' => $room];
        })->values()->all();
    }

    /** Post it; when the shelf shows too little stock the sale still goes through (the stock is marked pending) rather than losing a customer at the till. */
    private function post(array $data, User $u): Voucher
    {
        try {
            return $this->vouchers->create($data, $u);
        } catch (BooksException $e) {
            if (! str_contains(strtolower($e->getMessage()), 'stock')) {
                throw $e;
            }

            $data['moves_stock'] = false;
            $data['meta'] = array_merge($data['meta'] ?? [], ['stock_pending' => true]);

            return $this->vouchers->create($data, $u);
        }
    }

    private function replay(object $seen): array
    {
        if (! $seen->voucher_id) {
            throw new BooksException('This sale is still being posted: wait a moment and look in today\'s sales.');
        }
        $v = Voucher::findOrFail($seen->voucher_id);

        return $this->summary($v, null, true);
    }

    /** @return array<string, mixed> */
    public function summary(Voucher $v, ?array $paid, bool $replayed): array
    {
        $tenders = DB::table('voucher_tenders as t')->leftJoin('payment_methods as m', 'm.id', '=', 't.payment_method_id')->where('t.voucher_id', $v->id)->orderBy('t.id')
            ->get(['m.name', 't.amount', 't.reference'])->map(fn ($t) => ['method' => $t->name, 'amount' => (float) $t->amount, 'reference' => $t->reference])->all();

        return ['replayed' => $replayed, 'type' => $v->type?->name, 'id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'total' => (float) $v->total_amount, 'tax_total' => (float) $v->tax_total,
            'tendered' => $paid['tendered'] ?? array_sum(array_column($tenders, 'amount')), 'change' => $paid['change'] ?? 0.0, 'tenders' => $tenders,
            'station_id' => $v->station_id ?? DB::table('vouchers')->where('id', $v->id)->value('station_id'), 'cashier' => $v->creator?->name ?? null];
    }

    /** The cashier's own sales of today, newest first. @return array<int, array<string, mixed>> */
    public function mine(User $u, int $limit = 30): array
    {
        return Voucher::where('created_by', $u->id)->where('channel', 'pos')->whereDate('date', today())->orderByDesc('id')->limit($limit)->get()
            ->map(fn (Voucher $v) => ['id' => $v->id, 'number' => $v->voucher_number, 'total' => (float) $v->total_amount, 'status' => $v->status, 'at' => $v->posted_at?->toIso8601String()])->all();
    }

    // ── hold and recall ───────────────────────────────────────────────────

    /** The branches this person may take holds from. */
    private function holdScope(User $u): ?array
    {
        return app(Authorizer::class)->locationIds($u);
    }

    public function hold(User $u, array $in): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 170_pos_sales.sql first.');
        }
        $station = $this->station($u, isset($in['station_id']) ? (int) $in['station_id'] : null);
        $items = array_values(array_filter((array) ($in['items'] ?? []), fn ($i) => (float) ($i['quantity'] ?? 0) > 0 && ! empty($i['variant_id'])));
        if (! $items) {
            throw new BooksException('There is nothing in the basket to hold.');
        }
        $cart = ['items' => array_map(fn ($i) => ['variant_id' => (int) $i['variant_id'], 'quantity' => (float) $i['quantity'], 'name' => mb_substr((string) ($i['name'] ?? ''), 0, 120), 'discount_pct' => (float) ($i['discount_pct'] ?? 0)], $items),
            'customer_id' => ! empty($in['customer_id']) ? (int) $in['customer_id'] : null, 'customer_name' => mb_substr((string) ($in['customer_name'] ?? ''), 0, 120) ?: null, 'mode' => isset(self::MODES[$in['mode'] ?? '']) ? $in['mode'] : 'cash'];
        $id = DB::table('pos_holds')->insertGetId(['location_id' => $station->location_id, 'station_id' => $station->id, 'user_id' => $u->id, 'label' => mb_substr(trim((string) ($in['label'] ?? '')), 0, 80) ?: null,
            'cart' => json_encode($cart), 'created_at' => now(), 'updated_at' => now()]);

        return ['id' => $id];
    }

    /** @return array<int, array<string, mixed>> */
    public function holds(User $u): array
    {
        if (! self::installed()) {
            return [];
        }
        $scope = $this->holdScope($u);
        $names = DB::table('users')->pluck('name', 'id');

        return DB::table('pos_holds')->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->orderByDesc('id')->limit(50)->get()->map(function ($h) use ($names) {
            $cart = json_decode((string) $h->cart, true) ?: [];

            return ['id' => (int) $h->id, 'label' => $h->label, 'by' => $names[$h->user_id] ?? null, 'at' => $h->created_at, 'lines' => count($cart['items'] ?? []),
                'quantity' => array_sum(array_column($cart['items'] ?? [], 'quantity'))];
        })->all();
    }

    /** Take a held sale back: it leaves the shelf and comes to the till. */
    public function recall(User $u, int $id): array
    {
        $scope = $this->holdScope($u);

        return DB::transaction(function () use ($u, $id, $scope) {
            $h = DB::table('pos_holds')->where('id', $id)->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->lockForUpdate()->first()
                ?? throw new BooksException('That held sale is gone (someone else may have recalled it).');
            DB::table('pos_holds')->where('id', $id)->delete();

            return ['label' => $h->label] + (json_decode((string) $h->cart, true) ?: []);
        });
    }

    public function dropHold(User $u, int $id): void
    {
        $scope = $this->holdScope($u);
        DB::table('pos_holds')->where('id', $id)->when($scope !== null, fn ($q) => $q->whereIn('location_id', $scope ?: [0]))->delete();
    }
}
