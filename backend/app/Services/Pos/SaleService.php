<?php

namespace App\Services\Pos;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Currency;
use App\Models\Location;
use App\Models\Pos\Station;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
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
            'can' => ['sell' => $access->allows($u, 'pos.sell'), 'discount' => $access->allows($u, 'pos.discount'), 'void' => $access->allows($u, 'pos.void'), 'hold' => $access->allows($u, 'pos.sell')]];
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

    private function base(User $u, Station $station, ?int $customerId, array $meta = []): array
    {
        $type = VoucherType::byBase(VoucherType::CASH_SALE) ?? throw new BooksException('Cash sales are switched off (the Cash Sale voucher type is off).');

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
        $customerId = ! empty($in['customer_id']) ? (int) $in['customer_id'] : null;
        $data = $this->base($u, $station, $customerId);
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
     * Take the money and post the Cash Sale. $in: key, items, tenders, station_id?, customer_id?
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
        $station = $this->station($u, isset($in['station_id']) ? (int) $in['station_id'] : null);
        [$data, $pre] = $this->priced($u, $station, $in);
        $paid = $this->tenders->check((array) ($in['tenders'] ?? []), (float) $pre['total']);

        try {
            $voucher = DB::transaction(function () use ($u, $key, $station, $data, $paid) {
                DB::table('pos_sale_keys')->insert(['user_id' => $u->id, 'sale_key' => $key, 'created_at' => now(), 'updated_at' => now()]);
                $v = $this->post($data + ['tenders' => $paid['tenders']], $u);
                DB::table('vouchers')->where('id', $v->id)->update(['station_id' => $station->id]);
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

        return $this->summary($voucher->fresh(), $paid, false) + ['lines' => $pre['lines'], 'tax_breakdown' => $pre['tax_breakdown']];
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

        return ['replayed' => $replayed, 'id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'total' => (float) $v->total_amount, 'tax_total' => (float) $v->tax_total,
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
            'customer_id' => ! empty($in['customer_id']) ? (int) $in['customer_id'] : null];
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
