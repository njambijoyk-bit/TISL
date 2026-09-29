<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BooksException;
use App\Services\Books\BooksReportService;
use App\Services\Books\ExportService;
use App\Services\Books\VoucherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vouchers, their chain actions, exports and the reports. */
class BooksVoucherController extends Controller
{
    public function __construct(private VoucherService $vouchers, private BooksReportService $reports, private ExportService $export) {}

    private function guard(callable $fn)
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $q = Voucher::query()->with(['type:id,code,name,base_type', 'partyLedger:id,name', 'location:id,name,code', 'currency:id,code,symbol'])
            ->when($request->filled('type'), fn ($q) => $q->whereHas('type', fn ($t) => $t->where('base_type', $request->type)->orWhere('code', $request->type)))
            ->when($request->filled('voucher_type_id'), fn ($q) => $q->where('voucher_type_id', $request->voucher_type_id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('location_id'), fn ($q) => $q->where('location_id', $request->location_id))
            ->when($request->filled('party_ledger_id'), fn ($q) => $q->where('party_ledger_id', $request->party_ledger_id))
            ->when($request->filled('from'), fn ($q) => $q->where('date', '>=', $request->from))
            ->when($request->filled('to'), fn ($q) => $q->where('date', '<=', $request->to))
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = '%' . $request->search . '%';
                $q->where(fn ($w) => $w->where('voucher_number', 'like', $s)->orWhere('reference_no', 'like', $s)->orWhere('narration', 'like', $s)
                    ->orWhereHas('partyLedger', fn ($l) => $l->where('name', 'like', $s)));
            })
            ->orderByDesc('date')->orderByDesc('id');

        return response()->json($q->paginate(min((int) $request->get('per_page', 25), 200)));
    }

    public function show($id): JsonResponse
    {
        $v = Voucher::with($this->vouchers->relations())->findOrFail($id);
        $out = $v->toArray();
        $out['footer'] = $this->export->footer($v);
        $out['outstanding'] = in_array($v->type->base_type, [VoucherType::SALES, VoucherType::DEBIT_NOTE], true) ? $this->vouchers->outstanding($v) : null;

        return response()->json($out);
    }

    public function preview(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->vouchers->preview($request->all(), $request->user())));
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $v = $this->vouchers->create($request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} saved", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    public function update(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->alter(Voucher::findOrFail($id), $request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} updated", 'data' => $v->load($this->vouchers->relations())]);
        });
    }

    public function cancel(Request $request, $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->cancel(Voucher::findOrFail($id), $request->reason, $request->user());

            return response()->json(['message' => "{$v->voucher_number} cancelled", 'data' => $v->load($this->vouchers->relations())]);
        });
    }

    /** Sales order → delivery note / invoice / cash sale, etc. */
    public function convert(Request $request, $id): JsonResponse
    {
        $data = $request->validate([
            'to' => 'required|string', 'date' => 'nullable|date', 'payment_method_id' => 'nullable|integer',
            'lines' => 'nullable|array', 'tenders' => 'nullable|array', 'reference_no' => 'nullable|string|max:100', 'narration' => 'nullable|string',
        ]);

        return $this->guard(function () use ($request, $id, $data) {
            $v = $this->vouchers->convert(Voucher::findOrFail($id), $data['to'], $request->except('to'), $request->user());

            return response()->json(['message' => "{$v->voucher_number} created", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    /** Record a receipt against an invoice. */
    public function receive(Request $request, $id): JsonResponse
    {
        $request->validate(['payment_method_id' => 'required_without:tenders|nullable|integer|exists:payment_methods,id', 'tenders' => 'nullable|array', 'withholding' => 'nullable|array', 'withholding.tax_rate_id' => 'required_with:withholding|integer|exists:tax_rates,id', 'amount' => 'nullable|numeric|min:0.01', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->receive(Voucher::findOrFail($id), $request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} recorded", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    /** Send the customer an M-Pesa prompt for an invoice's balance (or an order's total). */
    public function requestPayment(Request $request, $id): JsonResponse
    {
        $request->validate(['payment_method_id' => 'required|integer|exists:payment_methods,id', 'phone' => 'required|string', 'amount' => 'nullable|numeric|min:1']);

        return $this->guard(function () use ($request, $id) {
            $v = Voucher::with('type')->findOrFail($id);
            $method = PaymentMethod::where('gateway', 'mpesa_stk')->findOrFail($request->payment_method_id);
            $due = $v->type->base_type === VoucherType::SALES ? $this->vouchers->outstanding($v) : (float) $v->total_amount;
            $amount = $request->filled('amount') ? min((float) $request->amount, $due) : $due;
            $a = app(\App\Services\Books\GatewayPaymentService::class)->initiateMpesa($v, $method, $request->phone, [], $amount, $request->user());

            return response()->json(['message' => 'Payment request sent to the customer\'s phone.', 'attempt' => ['id' => $a->id, 'status' => $a->status]], 201);
        });
    }

    public function export(Request $request, $id)
    {
        return $this->guard(fn () => $this->export->voucher(Voucher::findOrFail($id), $request->get('format', 'pdf')));
    }

    /** Vouchers register as a file. */
    public function exportList(Request $request)
    {
        return $this->guard(function () use ($request) {
            $book = $this->reports->dayBook($request->from, $request->to, $request->filled('voucher_type_id') ? (int) $request->voucher_type_id : null, $request->filled('location_id') ? (int) $request->location_id : null);

            return $this->export->table([
                'title' => 'Vouchers', 'subtitle' => trim(($request->from ?? '') . ' – ' . ($request->to ?? ''), ' –'),
                'columns' => ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Type', 'party' => 'Party', 'status' => 'Status', 'narration' => 'Narration', 'total' => 'Total'],
                'rows' => $book['rows'], 'totals' => ['narration' => 'Posted total', 'total' => $book['total']],
            ], $request->get('format', 'csv'), 'vouchers');
        });
    }

    /** Ready-made numbers for a form: next number per type, payment methods, etc. */
    public function nextNumber(Request $request): JsonResponse
    {
        $request->validate(['voucher_type_id' => 'required|integer|exists:voucher_types,id']);

        return $this->guard(function () use ($request) {
            $type = VoucherType::findOrFail($request->voucher_type_id);
            $series = app(\App\Services\Books\NumberingService::class);
            $date = \Carbon\Carbon::parse($request->get('date', today()));
            $out = \App\Models\Books\VoucherSeries::where('voucher_type_id', $type->id)->where('is_active', true)->get()
                ->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'location_id' => $s->location_id, 'is_default' => $s->is_default, 'allow_manual' => $s->allow_manual, 'next' => $series->preview($s, $date, $request->location_id ? (int) $request->location_id : null)]);

            return response()->json($out);
        });
    }

    /** Pickers for the voucher form: kind = product | service | hamper | customer, q = search text. */
    public function lookup(Request $request): JsonResponse
    {
        $kind = $request->get('kind');
        $q = trim((string) $request->get('q', ''));
        $like = '%' . $q . '%';
        $out = [];

        if ($kind === 'product') {
            $variants = \App\Models\ProductVariant::with(['product:id,name,sku,status', 'units.unit:id,code,name'])
                ->whereHas('product', fn ($p) => $p->where('status', 'active')->when($request->get('purpose') !== 'purchase', fn ($x) => $x->where('is_for_sale', true)))
                ->when($q !== '', fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like)->orWhereHas('product', fn ($p) => $p->where('name', 'like', $like)->orWhere('sku', 'like', $like))))
                ->orderBy('product_id')->limit(30)->get();
            foreach ($variants as $v) {
                $units = $v->units->map(function ($u) use ($v) {
                    $u->setRelation('variant', $v);

                    return ['id' => $u->id, 'code' => $u->unit?->code, 'role' => $u->role, 'sellable' => (bool) $u->is_sellable, 'is_default_sale' => (bool) $u->is_default_sale, 'price' => $u->effectivePrice()];
                })->values();
                $out[] = ['type' => 'product', 'variant_id' => $v->id, 'product_id' => $v->product_id, 'product' => $v->product?->name, 'variant' => $v->name, 'sku' => $v->sku, 'units' => $units];
            }
        } elseif ($kind === 'service') {
            $variants = \App\Models\ServiceVariant::with('service:id,name,status')
                ->whereHas('service', fn ($s) => $s->where('status', 'active'))
                ->when($q !== '', fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', $like)->orWhereHas('service', fn ($s) => $s->where('name', 'like', $like))))
                ->orderBy('service_id')->limit(30)->get();
            foreach ($variants as $v) {
                $out[] = ['type' => 'service', 'service_id' => $v->service_id, 'service_variant_id' => $v->id, 'service' => $v->service?->name, 'package' => $v->name, 'price' => $v->price !== null ? (float) $v->price : null];
            }
        } elseif ($kind === 'hamper') {
            $h = \App\Models\Hamper::where('status', 'active')->when($q !== '', fn ($w) => $w->where('name', 'like', $like))->limit(30)->get(['id', 'name', 'price', 'location_id']);
            foreach ($h as $x) {
                $out[] = ['type' => 'hamper', 'hamper_id' => $x->id, 'name' => $x->name, 'price' => (float) $x->price, 'location_id' => $x->location_id];
            }
        } elseif ($kind === 'customer') {
            $c = \App\Models\Customer::when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)))
                ->orderBy('first_name')->limit(30)->get(['id', 'first_name', 'last_name', 'email']);
            foreach ($c as $x) {
                $out[] = ['type' => 'customer', 'customer_id' => $x->id, 'name' => trim($x->first_name . ' ' . $x->last_name), 'email' => $x->email];
            }
        } else {
            return response()->json(['message' => 'kind must be product, service, hamper or customer.'], 422);
        }

        return response()->json($out);
    }

    public function paymentMethods(): JsonResponse
    {
        return response()->json(PaymentMethod::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get());
    }

    // ── Reports ──────────────────────────────────────────────────────────

    /** Refund (part of) a Credit Note as a gift voucher. */
    public function refundToGiftVoucher(Request $request, $id)
    {
        $d = $request->validate(['amount' => 'nullable|numeric|min:0.01', 'expires_at' => 'nullable|date|after:today']);

        return $this->guard(function () use ($request, $id, $d) {
            $gv = app(\App\Services\Books\GiftVoucherService::class)->issueFromCreditNote(Voucher::findOrFail($id), isset($d['amount']) ? (float) $d['amount'] : null, $d['expires_at'] ?? null, $request->user());

            return response()->json(['message' => "Gift voucher {$gv->code} issued", 'data' => $gv->load('currency:id,code,symbol')], 201);
        });
    }

    /** Post the one-off Journal that brings the Loyalty Points Liability in line with the points customers hold. */
    public function loyaltyTrueUp(Request $request)
    {
        return $this->guard(function () use ($request) {
            $v = app(\App\Services\Books\RewardService::class)->trueUpLiability($request->user());

            return response()->json($v
                ? ['message' => "Posted {$v->voucher_number}", 'voucher_id' => $v->id]
                : ['message' => 'The liability already agrees with the points held.']);
        });
    }

    public function report(Request $request, string $name)
    {
        return $this->guard(function () use ($request, $name) {
            [$data, $table] = $this->buildReport($request, $name);
            if ($request->filled('format')) {
                return $this->export->table($table, $request->format, $name);
            }

            return response()->json($data);
        });
    }

    /** @return array{0: array, 1: array} the report and its flat export table */
    private function buildReport(Request $r, string $name): array
    {
        $from = $r->from;
        $to = $r->to;
        $period = trim(($from ?? 'start') . ' to ' . ($to ?? 'today'));
        switch ($name) {
            case 'day-book':
                $d = $this->reports->dayBook($from, $to, $r->filled('voucher_type_id') ? (int) $r->voucher_type_id : null, $r->filled('location_id') ? (int) $r->location_id : null);

                return [$d, ['title' => 'Day Book', 'subtitle' => $period, 'columns' => ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Type', 'party' => 'Party', 'status' => 'Status', 'total' => 'Total'], 'rows' => $d['rows'], 'totals' => ['status' => 'Posted total', 'total' => $d['total']]]];
            case 'ledger':
                $d = $this->reports->ledgerStatement((int) $r->ledger_id, $from, $to);
                $rows = array_merge([['date' => $from, 'voucher_number' => '', 'type' => 'Opening balance', 'debit' => '', 'credit' => '', 'balance' => $d['opening']]], $d['rows']);

                return [$d, ['title' => 'Ledger: ' . $d['ledger']['name'], 'subtitle' => $period, 'columns' => ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Type', 'debit' => 'Debit', 'credit' => 'Credit', 'balance' => 'Balance (Dr +)'], 'rows' => $rows, 'totals' => ['type' => 'Totals', 'debit' => $d['debit'], 'credit' => $d['credit'], 'balance' => $d['closing']]]];
            case 'trial-balance':
                $d = $this->reports->trialBalance($from, $to);

                return [$d, ['title' => 'Trial Balance', 'subtitle' => $period, 'columns' => ['group' => 'Group', 'ledger' => 'Ledger', 'opening' => 'Opening', 'debit' => 'Debit', 'credit' => 'Credit', 'closing' => 'Closing (Dr +)'], 'rows' => $d['rows'], 'totals' => ['ledger' => 'Totals (closing Dr / Cr)', 'debit' => $d['total_debit'], 'credit' => $d['total_credit']]]];
            case 'profit-loss':
                $d = $this->reports->profitLoss($from, $to);
                $rows = [];
                foreach (['income_direct' => 'Direct income', 'expense_direct' => 'Direct expenses', 'income_indirect' => 'Indirect income', 'expense_indirect' => 'Indirect expenses'] as $k => $label) {
                    foreach ($d['sections'][$k] as $x) {
                        $rows[] = ['section' => $label, 'ledger' => $x['ledger'], 'amount' => $x['amount']];
                    }
                }

                return [$d, ['title' => 'Profit & Loss', 'subtitle' => $period, 'columns' => ['section' => 'Section', 'ledger' => 'Ledger', 'amount' => 'Amount'], 'rows' => $rows, 'totals' => ['ledger' => 'Net profit', 'amount' => $d['totals']['net_profit']]]];
            case 'balance-sheet':
                $d = $this->reports->balanceSheet($to);
                $rows = [];
                foreach ($d['assets'] as $x) {
                    $rows[] = ['side' => 'Assets', 'ledger' => $x['ledger'], 'amount' => $x['amount']];
                }
                foreach ($d['liabilities'] as $x) {
                    $rows[] = ['side' => 'Liabilities & Capital', 'ledger' => $x['ledger'], 'amount' => $x['amount']];
                }

                return [$d, ['title' => 'Balance Sheet', 'subtitle' => 'As of ' . ($to ?? 'today'), 'columns' => ['side' => 'Side', 'ledger' => 'Ledger', 'amount' => 'Amount'], 'rows' => $rows, 'totals' => ['ledger' => 'Assets / Liabilities', 'amount' => $d['total_assets']]]];
            case 'receivables':
            case 'payables':
                $d = $this->reports->ageing($name, $to);

                return [$d, ['title' => ucfirst($name) . ' ageing', 'subtitle' => 'As of ' . $d['as_of'], 'columns' => ['party' => 'Party', 'current' => 'Current', 'd1_30' => '1–30', 'd31_60' => '31–60', 'd61_90' => '61–90', 'd90_plus' => '90+', 'total' => 'Total'], 'rows' => array_map(fn ($x) => array_diff_key($x, ['bills' => 1]), $d['rows']), 'totals' => ['party' => 'Total'] + $d['totals']]];
            case 'tax-return':
                $d = app(\App\Services\Books\ComplianceReportService::class)->taxReturn($from, $to);
                $rows = [];
                foreach ($d['types'] as $t) {
                    if ($t['brought_forward'] != 0) {
                        $rows[] = ['tax' => $t['name'], 'rate' => 'Brought forward', 'sales_base' => '', 'output' => '', 'purchases_base' => '', 'input' => '', 'net' => $t['brought_forward']];
                    }
                    foreach ($t['rows'] as $x) {
                        $rows[] = ['tax' => $t['name'], 'rate' => $x['label'], 'sales_base' => $x['sales_base'], 'output' => $x['output'], 'purchases_base' => $x['purchases_base'], 'input' => $x['input'], 'net' => $x['net']];
                    }
                    $rows[] = ['tax' => $t['name'], 'rate' => 'Owed at the end', 'sales_base' => '', 'output' => '', 'purchases_base' => '', 'input' => '', 'net' => $t['closing_owed']];
                }
                foreach (['standard' => 'taxable', 'zero-rated' => 'zero_rated', 'exempt' => 'exempt', 'out of scope' => 'out_of_scope', 'unclassified' => 'unclassified'] as $label => $key) {
                    if (! empty($d['supplies']['sales'][$key]) || ! empty($d['supplies']['purchases'][$key])) {
                        $rows[] = ['tax' => 'Supplies', 'rate' => ucfirst($label), 'sales_base' => $d['supplies']['sales'][$key] ?? 0, 'output' => '', 'purchases_base' => $d['supplies']['purchases'][$key] ?? 0, 'input' => '', 'net' => ''];
                    }
                }

                return [$d, ['title' => 'Tax return', 'subtitle' => $period, 'columns' => ['tax' => 'Tax', 'rate' => 'Rate', 'sales_base' => 'Sales value', 'output' => 'Output tax', 'purchases_base' => 'Purchases value', 'input' => 'Input tax', 'net' => 'Net'], 'rows' => $rows, 'totals' => ['rate' => 'Total', 'output' => $d['totals']['output'], 'input' => $d['totals']['input'], 'net' => $d['totals']['owed']]]];
            case 'withholding':
                $d = app(\App\Services\Books\ComplianceReportService::class)->withholdingRegister($from, $to);

                return [$d, ['title' => 'Withholding certificates', 'subtitle' => $period, 'columns' => ['date' => 'Date', 'certificate_number' => 'Certificate', 'voucher_number' => 'Voucher', 'direction' => 'Direction', 'party' => 'Party', 'tax' => 'Tax', 'gross_amount' => 'Gross', 'withheld_amount' => 'Withheld', 'status' => 'Certificate', 'credit_status' => 'Credit'], 'rows' => $d['rows'], 'totals' => ['party' => 'Withheld from us / by us', 'gross_amount' => $d['totals']['receivable'], 'withheld_amount' => $d['totals']['payable']]]];
            case 'reconciliation':
                $d = app(\App\Services\Books\ComplianceReportService::class)->reconciliation($to);

                return [$d, ['title' => 'Reconciliation', 'subtitle' => 'As of ' . $d['as_of'], 'columns' => ['title' => 'Check', 'book' => 'Books', 'register' => 'Register', 'difference' => 'Difference', 'explained' => 'Explained', 'ok' => 'Agrees'], 'rows' => array_map(fn ($c) => $c + ['ok' => $c['ok'] ? 'Yes' : 'No'], $d['checks'])]];
        }
        abort(404, 'Unknown report.');
    }
}
