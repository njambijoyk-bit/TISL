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
            'preorder' => 'nullable|boolean', 'currency' => 'nullable|string|max:8', 'location_id' => 'nullable|integer|exists:locations,id',
            'delivery_method' => ['nullable', Rule::in(ShippingOption::where('is_active', true)->pluck('code'))],
            'attribution' => 'nullable|array', 'attribution.campaign' => 'nullable|string|max:120', 'attribution.at' => 'nullable|string|max:40',
            'promo_code' => 'nullable|string|max:40', 'use_credit' => 'nullable|array', 'use_credit.*' => 'integer', 'gift_voucher_code' => 'nullable|string|max:60', 'gift_voucher_codes' => 'nullable|array', 'gift_voucher_codes.*' => 'string|max:60',
        ];
    }

    /** Everything the checkout page needs that isn't in the cart. */
    public function options(Request $request): JsonResponse
    {
        $money = app(CurrencyConversionService::class);
        $customer = $request->user('sanctum')?->customer;
        $account = null;
        if ($customer && $customer->has_credit_account && (float) $customer->credit_limit > 0) {
            $ledger = \App\Models\Books\Ledger::where('customer_id', $customer->id)->first();
            $owed = $ledger ? app(LedgerService::class)->balance($ledger->id) : 0.0;
            $limitBase = $money->convert((float) $customer->credit_limit, $money->currencyFrom($customer->credit_currency_id ?? $customer->currency_id), $money->getBaseCurrency());
            $account = ['limit' => (float) $customer->credit_limit, 'terms_days' => (int) ($customer->credit_terms_days ?: 30), 'available_base' => round(max(0, $limitBase - $owed), 2), 'base_currency' => $money->getBaseCurrency()->code];
        }

        return response()->json([
            'payment_methods' => PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway', 'instructions', 'requires_reference']),
            'shipping' => app(ShippingOptionController::class)->publicIndex()->getData(true),
            'branches' => Location::sellsToCustomers()->get(['id', 'name', 'code', 'is_default']),   // customers choose only among branches they can buy from
            'account' => $account,
            'ledger_modes' => app(\App\Services\Books\PaymentModeService::class)->offered(),
            'credits' => $customer ? app(\App\Services\Books\OpenBillsService::class)->forCustomer($customer->id) : [],
            'gift_vouchers_enabled' => PaymentMethod::where('kind', 'gift_voucher')->where('is_active', true)->exists(),
            'base_currency' => $money->getBaseCurrency()->only(['code', 'symbol']),
        ]);
    }

    public function quote(Request $request): JsonResponse
    {
        $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->checkout->quote($request->all(), $request->user('sanctum'))));
    }

    public function place(Request $request): JsonResponse
    {
        $request->validate($this->rules() + [
            'customer_email' => 'required|email', 'customer_phone' => 'required|string', 'shipping_address' => [\Illuminate\Validation\Rule::requiredIf(! empty($request->items)), 'nullable', 'string'],
            'payment_mode' => 'required|in:online,pay_later,account,credit', 'payment_method_id' => 'nullable|integer|exists:payment_methods,id', 'payment_ledger_id' => 'nullable|integer|exists:ledgers,id',
            'phone' => 'nullable|string', 'customer_notes' => 'nullable|string|max:1000',
            'policy_acceptances' => 'nullable|array', 'policy_acceptances.*.key' => 'required_with:policy_acceptances|string',
            'policy_acceptances.*.response' => 'required_with:policy_acceptances|in:accepted,disagreed',
        ]);

        return $this->guard(function () use ($request) {
            $res = $this->checkout->place($request->all(), $request->user('sanctum'));
            $customer = $request->user('sanctum')?->customer;
            foreach ($request->input('policy_acceptances', []) as $pa) {
                $this->logPolicyAcceptance($pa['key'], 'standard_checkout', $pa['response'], $customer, $request->user('sanctum'), null, 'voucher', $res['order']['id'], true, $request);
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
            // an order already charged to the customer's account (an auction registration): the payment settles its invoice
            if ($base === VoucherType::SALES_ORDER && ($inv = $order->children()->with('type')->where('status', Voucher::POSTED)->get()->first(fn ($c) => $c->type?->base_type === VoucherType::SALES && $this->vouchers->outstanding($c) > 0.005))) {
                $order = $inv;
                $base = VoucherType::SALES;
            }
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
            $method = PaymentMethod::offeredAtCheckout()->findOrFail($request->payment_method_id);
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
        $lines = $v->items->map(fn ($i) => [
            'id' => $i->id, 'description' => $i->description, 'variant_label' => $i->variant_label, 'unit_code' => $i->unit_code, 'quantity' => (float) $i->quantity, 'rate' => (float) $i->rate,
            'amount' => (float) $i->amount, 'discount' => (float) $i->discount_amount, 'tax_amount' => (float) $i->tax_amount, 'is_component' => $i->parent_item_id !== null, 'product_id' => $i->product_id, 'variant_id' => $i->variant_id, 'variant_unit_id' => $i->variant_unit_id, 'hamper_id' => $i->is_header ? $i->hamper_id : null,
            'item_type' => $i->item_type, 'delivered' => (float) $i->delivered_quantity,
            'discount_amount' => (float) $i->discount_amount, 'tax_rate_percent' => $i->tax_rate_percent !== null ? (float) $i->tax_rate_percent : null,
            'is_header' => (bool) $i->is_header,
        ])->values();

        return response()->json($this->orderRow($v) + [
            'lines' => $lines, 'subtotal' => (float) $v->subtotal, 'tax_total' => (float) $v->tax_total, 'discount_total' => $footer['discount_total'],
            'charges' => array_map(fn ($c) => ['description' => $c['description'], 'amount' => $c['amount'], 'note' => $c['note']], $footer['charges']),
            'discounts' => array_values($v->meta['discounts'] ?? []), 'tax_breakdown' => array_map(fn ($t) => ['label' => $t['label'], 'percent' => null, 'amount' => round($t['amount'], 2)], $footer['taxes']),
            'contact' => $v->meta['contact'] ?? null, 'branch' => $v->location?->name, 'narration' => $v->narration,
            'gift_vouchers' => \App\Models\Books\GiftVoucher::with('currency:id,code,symbol')->whereIn('issued_voucher_id', $v->children->where('status', Voucher::POSTED)->pluck('id'))
                ->get(['id', 'code', 'currency_id', 'initial_amount', 'balance', 'expires_at', 'status', 'note']),
            'documents' => $this->documentRows($v),
            'payment_intent' => $v->meta['payment_intent'] ?? null,
            'credits' => app(\App\Services\Books\OpenBillsService::class)->forCustomer((int) $v->customer_id), 'use_credit' => array_values((array) ($v->meta['use_credit'] ?? [])),
            'gift_codes_meant' => array_values((array) ($v->meta['gift_codes'] ?? [])),
            'due' => ($inv = $v->children->where('status', Voucher::POSTED)->first(fn ($c) => $c->type?->base_type === VoucherType::SALES)) ? max(0.0, $this->vouchers->outstanding($inv)) : null,   // what is still owed on its invoice
            'registration' => ! empty($v->meta['auction_registration']),
            'editable' => $v->status === Voucher::POSTED && ! $v->children->where('status', Voucher::POSTED)->count(),
        ]);
    }

    public function cancelOrder(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('customer_id', $request->user()?->customer?->id)->findOrFail($id);
            $live = $v->children()->with('type')->where('status', Voucher::POSTED)->get();
            // an auction registration is charged to the account at once; while nothing has been paid, cancelling takes the charge back too
            $unpaidCharge = fn ($c) => $c->type?->base_type === VoucherType::SALES && abs($this->vouchers->outstanding($c) - (float) $c->total_amount) < 0.005;
            if (! empty($v->meta['auction_registration']) && $live->isNotEmpty() && $live->every($unpaidCharge)) {
                foreach ($live as $c) {
                    $this->vouchers->cancel($c, 'Registration cancelled by customer', null);
                }
            } elseif ($live->isNotEmpty()) {
                throw new BooksException('This order has already been paid or delivered, so it can not be cancelled here. Contact us.');
            }
            $this->vouchers->cancel($v, 'Cancelled by customer', null);

            return response()->json(['message' => 'Order cancelled']);
        });
    }

    /** The customer changes their order before it is converted; it is priced again at today's prices. */
    public function updateOrder(Request $request, $id): JsonResponse
    {
        $request->validate($this->rules() + [
            'items' => 'required|array|min:1', 'customer_phone' => 'nullable|string', 'shipping_address' => 'nullable|string', 'customer_notes' => 'nullable|string|max:1000',
        ]);

        return $this->guard(function () use ($request, $id) {
            $v = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('customer_id', $request->user()?->customer?->id)->findOrFail($id);
            $this->checkout->updateOrder($v, $request->only(['items', 'delivery_method', 'promo_code', 'use_credit', 'customer_phone', 'shipping_address', 'customer_notes']), $request->user());

            return response()->json(['message' => 'Order updated — prices were worked out again at today\'s prices.']);
        });
    }

    /** The customer asks staff to look at a posted invoice or cash sale. Staff see it as a help-desk ticket and on the voucher. */
    public function reviewDocument(Request $request, $id): JsonResponse
    {
        $data = $request->validate(['note' => 'required|string|max:2000']);

        return $this->guard(function () use ($request, $id, $data) {
            $customer = $request->user()?->customer;
            $v = Voucher::whereHas('type', fn ($t) => $t->whereIn('base_type', [VoucherType::SALES, VoucherType::CASH_SALE]))->where('customer_id', $customer?->id)
                ->where('status', Voucher::POSTED)->findOrFail($id);
            $prefix = 'TKT-' . now()->format('Y') . '-';
            $last = \App\Models\Ticket::withTrashed()->where('ticket_number', 'like', $prefix . '%')->orderByDesc('id')->value('ticket_number');
            $ticket = \App\Models\Ticket::create([
                'ticket_number' => $prefix . str_pad($last ? ((int) substr($last, strlen($prefix))) + 1 : 1, 5, '0', STR_PAD_LEFT), 'customer_id' => $customer->id,
                'subject' => "Review requested: {$v->voucher_number}", 'description' => $data['note'], 'priority' => 'medium', 'category' => 'billing', 'status' => 'open',
            ]);
            $meta = $v->meta ?? [];
            $meta['review_requests'][] = ['at' => now()->toDateTimeString(), 'note' => $data['note'], 'ticket' => $ticket->ticket_number];
            $v->meta = $meta;
            $v->save();

            return response()->json(['message' => "We have your request ({$ticket->ticket_number}) and will get back to you."], 201);
        });
    }

    /**
     * The documents made from an order, with where any review request on each stands. The latest request's ticket decides: still open → "review
     * requested"; resolved or closed → "resolved", with the ticket to open and the chance to ask again; deleted (or never made) → as if never asked.
     */
    private function documentRows(Voucher $v): \Illuminate\Support\Collection
    {
        $docs = $v->children->where('status', Voucher::POSTED);
        $numbers = $docs->flatMap(fn ($c) => collect($c->meta['review_requests'] ?? [])->pluck('ticket'))->filter()->unique()->all();
        $tickets = $numbers ? \App\Models\Ticket::whereIn('ticket_number', $numbers)->where('customer_id', $v->customer_id)->get()->keyBy('ticket_number') : collect();   // a deleted ticket is simply not found

        return $docs->map(function ($c) use ($tickets) {
            $latest = collect($c->meta['review_requests'] ?? [])->last();
            $t = $latest ? $tickets->get($latest['ticket'] ?? null) : null;
            $state = ! $t ? null : (in_array($t->status, ['resolved', 'closed'], true) ? 'resolved' : 'requested');

            return ['id' => $c->id, 'number' => $c->voucher_number, 'type' => $c->type?->name, 'base_type' => $c->type?->base_type, 'total' => (float) $c->total_amount,
                'review_requested' => $state === 'requested', 'review_state' => $state, 'review_ticket' => $t ? ['id' => $t->id, 'number' => $t->ticket_number] : null];
        })->values();
    }

    private function orderRow(Voucher $v): array
    {
        return app(\App\Services\Books\OrderSummaryService::class)->row($v);
    }
}
