<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;

/**
 * Orders are Sales Order vouchers. This is the one place that says what an order looks like in a list (its number, date, total, whether it is
 * paid and delivered, judged from the documents made from it), and that lists or counts a customer's orders, for the checkout, the customer
 * screen in admin and the project order pickers.
 */
class OrderSummaryService
{
    public function __construct(private VoucherService $vouchers) {}

    /** The sales orders only, cancelled ones included unless asked. */
    public function query(bool $withCancelled = true)
    {
        return Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))
            ->when(! $withCancelled, fn ($q) => $q->where('status', '!=', Voucher::CANCELLED));
    }

    /** One order as a list row. The voucher needs its `currency` and `children.type` loaded. */
    public function row(Voucher $v): array
    {
        $live = $v->children->where('status', Voucher::POSTED);
        $paid = $live->contains(fn ($c) => $c->type?->base_type === VoucherType::CASH_SALE);
        $invoice = $live->first(fn ($c) => $c->type?->base_type === VoucherType::SALES);
        if ($invoice) {
            $paid = $this->vouchers->outstanding($invoice) <= 0.005;
        }
        $delivered = $live->contains(fn ($c) => $c->type?->base_type === VoucherType::DELIVERY_NOTE) || ($v->fulfilment_status === 'closed');
        $pre = null;
        if (! empty($v->meta['preorder'])) {
            // paid in full and invoiced does not mean delivered: a preorder is delivered when every line has gone out
            $t = \Illuminate\Support\Facades\DB::table('voucher_items')->where('voucher_id', $v->id)->where('is_header', 0)->whereNotNull('variant_id')
                ->selectRaw('COALESCE(SUM(quantity), 0) AS q, COALESCE(SUM(delivered_quantity), 0) AS d')->first();
            $promised = \Illuminate\Support\Facades\Schema::hasTable('preorder_lines') ? \Illuminate\Support\Facades\DB::table('preorder_lines')->where('voucher_id', $v->id)->max('promised_date') : null;
            $pre = ['ordered' => (float) $t->q, 'delivered' => (float) $t->d, 'promised' => $promised];
            $delivered = $pre['ordered'] > 0 && $pre['delivered'] + 0.00005 >= $pre['ordered'];
        }

        return [
            'id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'currency' => $v->currency?->only(['code', 'symbol']), 'total' => (float) $v->total_amount,
            'status' => ($v->status === Voucher::CANCELLED || ($v->meta['cancel_request']['status'] ?? null) === 'approved') ? 'cancelled' : ($delivered ? 'delivered' : ($paid ? 'paid' : 'placed')),
            'payment' => $paid ? 'paid' : ($invoice ? 'invoiced' : 'unpaid'), 'stock_pending' => (bool) ($v->meta['stock_pending'] ?? false),
            'preorder' => $pre,
        ];
    }

    /** A page of one customer's orders, newest first, with the number of lines on each. */
    public function pageForCustomer(int $customerId, int $perPage = 15)
    {
        $rows = $this->query()->where('customer_id', $customerId)
            ->with(['currency:id,code,symbol', 'children.type:id,base_type'])->withCount('items')->orderByDesc('id')->paginate(min(max($perPage, 1), 50));
        $rows->getCollection()->transform(fn (Voucher $v) => $this->row($v) + ['items_count' => (int) $v->items_count]);

        return $rows;
    }

    /** What a customer has ordered, in the books' own currency, cancelled orders left out. */
    public function statsForCustomer(int $customerId): array
    {
        $q = $this->query(false)->where('customer_id', $customerId);
        $n = (clone $q)->count();
        $spent = (float) (clone $q)->sum('base_total');

        return [
            'total_orders' => $n,
            'total_spent' => round($spent, 2),
            'average_order_value' => $n ? round($spent / $n, 2) : 0.0,
            'first_order_date' => (clone $q)->min('date'),
            'last_order_date' => (clone $q)->max('date'),
        ];
    }

    /** Orders by id for the project screens: number, status, customer. Keyed by id. */
    public function summaries(iterable $ids)
    {
        return $this->query()->whereIn('id', collect($ids)->all())->with(['customer:id,first_name,last_name', 'currency:id,code,symbol', 'children.type:id,base_type'])->get()
            ->keyBy('id')->map(fn (Voucher $v) => [
                'number' => $v->voucher_number, 'status' => $this->row($v)['status'], 'customer_id' => $v->customer_id,
                'customer_name' => $v->customer ? trim($v->customer->first_name . ' ' . $v->customer->last_name) : ($v->party_name ?: null),
            ]);
    }

    /** Orders to pick from (project links and tasks): by number, narrowed to a customer when given. */
    public function options(?string $search, ?int $customerId = null, int $limit = 30): array
    {
        return $this->query(false)->with(['customer:id,first_name,last_name', 'currency:id,code,symbol', 'children.type:id,base_type'])
            ->when($customerId, fn ($q) => $q->where('customer_id', $customerId))
            ->when($search, fn ($q) => $q->where('voucher_number', 'like', '%' . $search . '%'))
            ->orderByDesc('id')->limit($limit)->get()
            ->map(fn (Voucher $v) => ['id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'total' => (float) $v->total_amount, 'status' => $this->row($v)['status'],
                'customer_id' => $v->customer_id, 'customer' => trim(($v->customer?->first_name ?? '') . ' ' . ($v->customer?->last_name ?? '')) ?: ($v->party_name ?? null)])->all();
    }
}
