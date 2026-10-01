<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BooksException;
use App\Services\Books\ExportService;
use App\Services\Books\QuotationService;
use App\Services\Books\VoucherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Quotations: the admin side (price, send) and the customer side (view, accept, decline, ask for changes). */
class QuotationController extends Controller
{
    public function __construct(private QuotationService $quotes, private VoucherService $vouchers, private ExportService $export) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function quotation($id): Voucher
    {
        $v = Voucher::with('type')->findOrFail($id);
        abort_unless($v->type->base_type === VoucherType::QUOTATION, 404, 'Quotation not found.');

        return $v;
    }

    // ── Admin ────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $q = Voucher::query()->whereHas('type', fn ($t) => $t->where('base_type', VoucherType::QUOTATION))
            ->with(['customer:id,first_name,last_name,email', 'currency:id,code,symbol', 'partyLedger:id,name'])
            ->when($request->filled('doc_status'), fn ($w) => $w->where('doc_status', $request->doc_status))
            ->when($request->filled('search'), function ($w) use ($request) {
                $s = '%' . $request->search . '%';
                $w->where(fn ($x) => $x->where('voucher_number', 'like', $s)->orWhere('reference_no', 'like', $s)->orWhere('narration', 'like', $s));
            })
            ->orderByDesc('id');
        $counts = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::QUOTATION))->where('status', Voucher::POSTED)
            ->selectRaw('doc_status, COUNT(*) c')->groupBy('doc_status')->pluck('c', 'doc_status');

        return response()->json(['quotations' => $q->paginate(min((int) $request->get('per_page', 25), 100)), 'counts' => $counts]);
    }

    public function show($id): JsonResponse
    {
        $this->quotation($id);
        $v = Voucher::with($this->vouchers->relations())->findOrFail($id);
        $out = $v->toArray();
        $out['footer'] = $this->export->footer($v);

        return response()->json($out);
    }

    /** What the shared voucher form needs to price a quotation. */
    public function meta(): JsonResponse
    {
        return response()->json(['type' => VoucherType::byBase(VoucherType::QUOTATION)]);
    }

    public function preview(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $type = VoucherType::byBase(VoucherType::QUOTATION) ?? throw new BooksException('The Quotation voucher type is switched off.');

            return response()->json($this->vouchers->preview(array_merge($request->all(), ['voucher_type_id' => $type->id]), $request->user()));
        });
    }

    public function lookup(Request $request): JsonResponse
    {
        return app(BooksVoucherController::class)->lookup($request);
    }

    /** Price / edit the lines (same payload as the voucher form). */
    public function update(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = $this->quotation($id);
            $data = $request->all();
            $data['doc_status'] = $v->doc_status;
            $v = $this->vouchers->alter($v, $data, $request->user());
            if ($request->filled('valid_until')) {
                $v->update(['valid_until' => $request->valid_until]);
            }

            return response()->json(['message' => "{$v->voucher_number} saved", 'data' => $v->fresh($this->vouchers->relations())]);
        });
    }

    public function send(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = $this->quotes->send($this->quotation($id), $request->user());

            return response()->json(['message' => "{$v->voucher_number} sent to the customer", 'data' => $v]);
        });
    }

    public function withdraw(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->cancel($this->quotation($id), $request->input('reason', 'Withdrawn'), $request->user());

            return response()->json(['message' => "{$v->voucher_number} withdrawn", 'data' => $v]);
        });
    }

    public function export(Request $request, $id)
    {
        return $this->guard(fn () => $this->export->voucher($this->quotation($id), $request->get('format', 'pdf')));
    }

    // ── Customer ─────────────────────────────────────────────────────────

    private function mine(Request $request, $id): Voucher
    {
        $customerId = $request->user()->customer?->id;
        $v = $this->quotation($id);
        abort_unless($customerId && (int) $v->customer_id === (int) $customerId && $v->status === Voucher::POSTED, 404, 'Quotation not found.');

        return $v;
    }

    private function customerView(Voucher $v): array
    {
        $v->load(['items.taxes', 'currency:id,code,symbol', 'children:id,voucher_number,voucher_type_id,source_voucher_id,status']);
        $lines = $v->items->where('is_header', false)->map(fn ($i) => [
            'id' => $i->id, 'description' => $i->description, 'variant_label' => $i->variant_label, 'unit_code' => $i->unit_code, 'quantity' => (float) $i->quantity,
            'rate' => (float) $i->rate, 'amount' => (float) $i->amount, 'tax_amount' => (float) $i->tax_amount, 'notes' => $i->notes, 'pending_price' => (bool) $i->pending_price,
            'is_component' => $i->parent_item_id !== null,
        ])->values();
        $footer = $this->export->footer($v);
        $order = $v->children->first(fn ($c) => $c->status === Voucher::POSTED);

        return [
            'id' => $v->id, 'number' => $v->voucher_number, 'doc_status' => $v->doc_status, 'date' => $v->date?->toDateString(), 'valid_until' => $v->valid_until?->toDateString(),
            'currency' => $v->currency?->only(['code', 'symbol']), 'lines' => $lines, 'subtotal' => (float) $v->subtotal, 'tax_total' => (float) $v->tax_total, 'total' => (float) $v->total_amount,
            'charges' => array_map(fn ($c) => ['description' => $c['description'], 'amount' => $c['amount']], $footer['charges']), 'discount_total' => $footer['discount_total'],
            'narration' => $v->narration, 'response_note' => $v->response_note, 'order' => $order ? ['id' => $order->id, 'number' => $order->voucher_number] : null,
        ];
    }

    /** A customer asks for prices: their list of items (item, variant, quantity) becomes a quotation waiting for the admin's prices. */
    public function request(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => 'required|array|min:1|max:100', 'items.*.product_id' => 'nullable|integer', 'items.*.variant_id' => 'nullable|integer', 'items.*.variant_unit_id' => 'nullable|integer',
            'items.*.service_id' => 'nullable|integer', 'items.*.service_variant_id' => 'nullable|integer', 'items.*.quantity' => 'required|numeric|min:0.0001', 'items.*.notes' => 'nullable|string|max:500',
            'note' => 'nullable|string|max:2000',
        ]);
        $customer = $request->user()->customer;
        abort_unless($customer, 403, 'Only customers can ask for a quotation.');

        return $this->guard(function () use ($request, $data, $customer) {
            $v = $this->quotes->request($customer, $data['items'], $data['note'] ?? null, $request->user());

            return response()->json(['message' => "{$v->voucher_number} sent — we'll price it and let you know", 'data' => ['id' => $v->id, 'number' => $v->voucher_number]], 201);
        });
    }

    public function myIndex(Request $request): JsonResponse
    {
        $customerId = $request->user()->customer?->id;
        $rows = Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::QUOTATION))
            ->where('customer_id', $customerId)->where('status', Voucher::POSTED)->with('currency:id,code,symbol')->orderByDesc('id')->get()
            ->map(fn ($v) => ['id' => $v->id, 'number' => $v->voucher_number, 'doc_status' => $v->doc_status, 'date' => $v->date?->toDateString(), 'valid_until' => $v->valid_until?->toDateString(),
                'currency' => $v->currency?->only(['code', 'symbol']), 'total' => (float) $v->total_amount, 'title' => $v->meta['request']['request_title'] ?? null]);

        return response()->json($rows);
    }

    public function myShow(Request $request, $id): JsonResponse
    {
        return response()->json($this->customerView($this->mine($request, $id)));
    }

    public function accept(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $so = $this->quotes->accept($this->mine($request, $id), $request->user());

            return response()->json(['message' => 'Quotation accepted — your order is ' . $so->voucher_number, 'order' => ['id' => $so->id, 'number' => $so->voucher_number]]);
        });
    }

    public function decline(Request $request, $id): JsonResponse
    {
        $request->validate(['note' => 'nullable|string|max:500']);

        return $this->guard(function () use ($request, $id) {
            $this->quotes->decline($this->mine($request, $id), $request->note);

            return response()->json(['message' => 'Quotation declined']);
        });
    }

    public function revision(Request $request, $id): JsonResponse
    {
        $request->validate(['note' => 'required|string|max:1000']);

        return $this->guard(function () use ($request, $id) {
            $this->quotes->requestRevision($this->mine($request, $id), $request->note);

            return response()->json(['message' => 'We have asked for a revised quotation']);
        });
    }
}
