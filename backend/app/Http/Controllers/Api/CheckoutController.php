<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Traits\LogsPolicyAcceptances;
use App\Http\Controllers\Controller;
use App\Models\Books\GiftVoucher;
use App\Models\Books\LedgerGroup;
use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Location;
use App\Models\ShippingOption;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\LedgerService;
use App\Services\Books\VoucherService;
use App\Services\CurrencyConversionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The storefront checkout, on the books. */
class CheckoutController extends Controller
{
    use LogsPolicyAcceptances;

    public function __construct(private CheckoutService $checkout, private GatewayPaymentService $gateway, private VoucherService $vouchers) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function rules(): array
    {
        return [
            'items' => 'required_without:gift_vouchers|array', 'items.*.quantity' => 'required|numeric|min:0.01',
            'gift_vouchers' => 'nullable|array|max:10', 'gift_vouchers.*.amount' => 'required|numeric|min:1|max:1000000', 'gift_vouchers.*.recipient_name' => 'nullable|string|max:120',
            'gift_vouchers.*.recipient_email' => 'nullable|email', 'gift_vouchers.*.message' => 'nullable|string|max:300',
            'items.*.product_id' => 'nullable|integer|exists:products,id', 'items.*.hamper_id' => 'nullable|integer|exists:hampers,id',
            'items.*.variant_id' => 'nullable|integer', 'items.*.variant_unit_id' => 'nullable|integer',
            'currency' => 'nullable|string|max:8', 'location_id' => 'nullable|integer|exists:locations,id',
            'delivery_method' => ['nullable', Rule::in(ShippingOption::where('is_active', true)->pluck('code'))],
            'promo_code' => 'nullable|string|max:40', 'gift_voucher_code' => 'nullable|string|max:60', 'gift_voucher_codes' => 'nullable|array', 'gift_voucher_codes.*' => 'string|max:60',
        ];
    }

    /** Everything the checkout page needs that isn't in the cart. */
    public function options(Request $request): JsonResponse
    {
        $money = app(CurrencyConversionService::class);
        $customer = $request->user()?->customer;
        $account = null;
        if ($customer && $customer->has_credit_account && (float) $customer->credit_limit > 0) {
            $ledger = \App\Models\Books\Ledger::where('customer_id', $customer->id)->first();
            $owed = $ledger ? app(LedgerService::class)->balance($ledger->id) : 0.0;
            $limitBase = $money->convert((float) $customer->credit_limit, $money->currencyFrom($customer->credit_currency_id ?? $customer->currency_id), $money->getBaseCurrency());
            $account = ['limit' => (float) $customer->credit_limit, 'terms_days' => (int) ($customer->credit_terms_days ?: 30), 'available_base' => round(max(0, $limitBase - $owed), 2), 'base_currency' => $money->getBaseCurrency()->code];
        }

        return response()->json([
            'payment_methods' => PaymentMethod::where('is_active', true)->where('is_online', true)->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway', 'instructions', 'requires_reference']),
            'shipping' => app(ShippingOptionController::class)->publicIndex()->getData(true),
            'branches' => Location::where('is_active', true)->get(['id', 'name', 'code', 'is_default']),
            'account' => $account,
            'gift_vouchers_enabled' => PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->exists(),
            'base_currency' => $money->getBaseCurrency()->only(['code', 'symbol']),
        ]);
    }

    public function quote(Request $request): JsonResponse
    {
        $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->checkout->quote($request->all(), $request->user())));
    }

    public function place(Request $request): JsonResponse
    {
        $request->validate($this->rules() + [
            'customer_email' => 'required|email', 'customer_phone' => 'required|string', 'shipping_address' => [\Illuminate\Validation\Rule::requiredIf(! empty($request->items)), 'nullable', 'string'],
            'payment_mode' => 'required|in:online,pay_later,account', 'payment_method_id' => 'nullable|integer|exists:payment_methods,id',
            'phone' => 'nullable|string', 'customer_notes' => 'nullable|string|max:1000',
            'policy_acceptances' => 'nullable|array', 'policy_acceptances.*.key' => 'required_with:policy_acceptances|string',
            'policy_acceptances.*.response' => 'required_with:policy_acceptances|in:accepted,disagreed',
        ]);

        return $this->guard(function () use ($request) {
            $res = $this->checkout->place($request->all(), $request->user());
            $customer = $request->user()?->customer;
            foreach ($request->input('policy_acceptances', []) as $pa) {
                $this->logPolicyAcceptance($pa['key'], 'standard_checkout', $pa['response'], $customer, $request->user(), null, 'voucher', $res['order']['id'], true, $request);
            }

            return response()->json($res, 201);
        });
    }

    /** Poll after the M-Pesa prompt. ?check=1 also asks Daraja. */
    public function attempt(Request $request, $id): JsonResponse
    {
        $a = PaymentAttempt::findOrFail($id);
        abort_unless((int) $a->customer_id === (int) $request->user()?->customer?->id, 404);
        if ($request->boolean('check')) {
            $a = $this->gateway->refresh($a);
        }

        return response()->json(['id' => $a->id, 'status' => $a->status, 'failure_reason' => $a->failure_reason, 'receipt' => $a->receipt_number, 'order_id' => $a->voucher_id, 'settled_id' => $a->settled_voucher_id]);
    }

    /** Pay an unpaid order later (M-Pesa prompt, optionally with a gift voucher). */
    public function payOrder(Request $request, $id): JsonResponse
    {
        $request->validate(['payment_method_id' => 'required|integer|exists:payment_methods,id', 'phone' => 'required|string', 'gift_voucher_code' => 'nullable|string']);

        return $this->guard(function () use ($request, $id) {
            $customerId = $request->user()?->customer?->id;
            $order = Voucher::with('type')->where('customer_id', $customerId)->whereKey($id)->firstOrFail();
            $base = $order->type->base_type;
            if (! in_array($base, [VoucherType::SALES_ORDER, VoucherType::SALES], true) || $order->status !== Voucher::POSTED) {
                throw new BooksException('That order can not be paid now.');
            }
            $due = $base === VoucherType::SALES ? $this->vouchers->outstanding($order) : (float) $order->total_amount;
            if ($base === VoucherType::SALES_ORDER && $order->children()->where('status', Voucher::POSTED)->exists()) {
                throw new BooksException('This order has already moved on — see its invoice.');
            }
            $tenders = [];
            if ($request->filled('gift_voucher_code')) {
                $gv = GiftVoucher::with('currency')->where('code', trim($request->gift_voucher_code))->first() ?? throw new BooksException('That gift voucher code was not found.');
                $money = app(CurrencyConversionService::class);
                $here = $money->convert((float) $gv->balance, $gv->currency, $money->currencyFrom($order->currency_id));
                $use = round(min($due, $here), 2);
                $giftMethod = PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->first() ?? throw new BooksException('Gift vouchers are not set up yet.');
                $tenders[] = ['payment_method_id' => $giftMethod->id, 'amount' => $use, 'gift_voucher_code' => $gv->code];
                $due = round($due - $use, 2);
            }
            $method = PaymentMethod::where('is_active', true)->where('is_online', true)->findOrFail($request->payment_method_id);
            $attempt = $this->gateway->initiateMpesa($order, $method, $request->phone, $tenders, $due, $request->user());

            return response()->json(['attempt' => ['id' => $attempt->id, 'status' => $attempt->status, 'amount' => (float) $attempt->amount], 'message' => 'Check your phone and enter your M-Pesa PIN.']);
        });
    }

    // ── The customer's orders (sales orders and what they became) ─────────

    public function orders(Request $request): JsonResponse
    {
        $customerId = $request->user()?->customer?->id;
        $rows = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('customer_id', $customerId)
            ->with(['currency:id,code,symbol', 'children.type:id,base_type'])->orderByDesc('id')->paginate(min((int) $request->get('per_page', 15), 50));
        $rows->getCollection()->transform(fn ($v) => $this->orderRow($v));

        return response()->json($rows);
    }

    public function order(Request $request, $id): JsonResponse
    {
        $v = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('customer_id', $request->user()?->customer?->id)
            ->with(['currency:id,code,symbol', 'items.taxes', 'children.type:id,base_type,name', 'location:id,name'])->findOrFail($id);
        $footer = app(\App\Services\Books\ExportService::class)->footer($v);
        $lines = $v->items->where('is_header', false)->map(fn ($i) => [
            'id' => $i->id, 'description' => $i->description, 'variant_label' => $i->variant_label, 'unit_code' => $i->unit_code, 'quantity' => (float) $i->quantity, 'rate' => (float) $i->rate,
            'amount' => (float) $i->amount, 'discount' => (float) $i->discount_amount, 'tax_amount' => (float) $i->tax_amount, 'is_component' => $i->parent_item_id !== null,
            'item_type' => $i->item_type, 'delivered' => (float) $i->delivered_quantity,
        ])->values();

        return response()->json($this->orderRow($v) + [
            'lines' => $lines, 'subtotal' => (float) $v->subtotal, 'tax_total' => (float) $v->tax_total, 'discount_total' => $footer['discount_total'],
            'charges' => array_map(fn ($c) => ['description' => $c['description'], 'amount' => $c['amount'], 'note' => $c['note']], $footer['charges']),
            'contact' => $v->meta['contact'] ?? null, 'branch' => $v->location?->name, 'narration' => $v->narration,
            'gift_vouchers' => \App\Models\Books\GiftVoucher::with('currency:id,code,symbol')->whereIn('issued_voucher_id', $v->children->where('status', Voucher::POSTED)->pluck('id'))
                ->get(['id', 'code', 'currency_id', 'initial_amount', 'balance', 'expires_at', 'status', 'note']),
            'documents' => $v->children->where('status', Voucher::POSTED)->map(fn ($c) => ['id' => $c->id, 'number' => $c->voucher_number, 'type' => $c->type?->name, 'total' => (float) $c->total_amount])->values(),
        ]);
    }

    public function cancelOrder(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('customer_id', $request->user()?->customer?->id)->findOrFail($id);
            if ($v->children()->where('status', Voucher::POSTED)->exists()) {
                throw new BooksException('This order has already been paid or delivered, so it can not be cancelled here. Contact us.');
            }
            $this->vouchers->cancel($v, 'Cancelled by customer', null);

            return response()->json(['message' => 'Order cancelled']);
        });
    }

    private function orderRow(Voucher $v): array
    {
        $live = $v->children->where('status', Voucher::POSTED);
        $paid = $live->contains(fn ($c) => $c->type?->base_type === VoucherType::CASH_SALE);
        $invoice = $live->first(fn ($c) => $c->type?->base_type === VoucherType::SALES);
        if ($invoice) {
            $paid = $this->vouchers->outstanding($invoice) <= 0.005;
        }
        $delivered = $live->contains(fn ($c) => $c->type?->base_type === VoucherType::DELIVERY_NOTE) || ($v->fulfilment_status === 'closed');

        return [
            'id' => $v->id, 'number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'currency' => $v->currency?->only(['code', 'symbol']), 'total' => (float) $v->total_amount,
            'status' => $v->status === Voucher::CANCELLED ? 'cancelled' : ($delivered ? 'delivered' : ($paid ? 'paid' : 'placed')),
            'payment' => $paid ? 'paid' : ($invoice ? 'invoiced' : 'unpaid'), 'stock_pending' => (bool) ($v->meta['stock_pending'] ?? false),
        ];
    }
}
