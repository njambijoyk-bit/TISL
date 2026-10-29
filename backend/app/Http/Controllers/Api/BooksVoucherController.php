<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BooksException;
use App\Services\Books\ExportService;
use App\Services\Books\VoucherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vouchers, their chain actions and exports. The reports are on the report engine. */
class BooksVoucherController extends Controller
{
    public function __construct(private VoucherService $vouchers, private ExportService $export) {}

    /** A voucher the person may look at (branch limits: a voucher at a branch they were not given is "not found"). */
    private function visible(Voucher $v): Voucher
    {
        app(\App\Services\Access\BranchFilter::class)->assertVisible($v->location_id ? (int) $v->location_id : null, 'books', 'voucher', $v->cost_centre_id ? (int) $v->cost_centre_id : null);

        return $v;
    }

    /** Posting at a branch: needs full access to it. */
    private function writableAt($locationId, $costCentreId = null): void
    {
        app(\App\Services\Access\BranchFilter::class)->assertWrite(request()->user(), $locationId ? (int) $locationId : null, 'books', 'voucher', $costCentreId ? (int) $costCentreId : null);
    }

    /** A voucher the person may change: needs full access to its branch. */
    private function writable(Voucher $v): Voucher
    {
        app(\App\Services\Access\BranchFilter::class)->assertWrite(request()->user(), $v->location_id ? (int) $v->location_id : null, 'books', 'voucher', $v->cost_centre_id ? (int) $v->cost_centre_id : null);

        return $v;
    }

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
                $q->where(fn ($w) => $w->where('voucher_number', 'like', $s)->orWhere('reference_no', 'like', $s)->orWhere('supplier_invoice_no', 'like', $s)->orWhere('narration', 'like', $s)
                    ->orWhereHas('partyLedger', fn ($l) => $l->where('name', 'like', $s)));
            })
            ->orderByDesc('date')->orderByDesc('id');
        app(\App\Services\Access\BranchFilter::class)->apply($q, 'location_id', 'books', 'vouchers');

        $page = $q->paginate(min((int) $request->get('per_page', 25), 200));

        // a Delivery Note shows whether it has been delivered (through its stop on a manifest)
        $noteIds = $page->getCollection()->filter(fn ($v) => $v->type?->base_type === VoucherType::DELIVERY_NOTE)->pluck('id')->all();
        if ($noteIds) {
            $status = app(\App\Services\Delivery\DeliveryStopService::class)->statusFor($noteIds);
            $page->getCollection()->each(fn ($v) => $v->type?->base_type === VoucherType::DELIVERY_NOTE ? $v->setAttribute('delivery', $status[$v->id] ?? ['status' => 'not_assigned', 'manifest_number' => null, 'delivered_at' => null]) : null);
        }

        return response()->json($page);
    }

    public function show($id): JsonResponse
    {
        $v = $this->visible(Voucher::with($this->vouchers->relations())->findOrFail($id));
        $out = $v->toArray();
        $out['footer'] = $this->export->footer($v);
        $out['period_lock'] = app(\App\Services\Books\PeriodGuard::class)->sealFor($v->date);
        // how it was paid, so editing a split payment shows the split again
        $out['tenders'] = \Illuminate\Support\Facades\DB::table('voucher_tenders as t')->leftJoin('gift_vouchers as g', 'g.id', '=', 't.gift_voucher_id')
            ->where('t.voucher_id', $v->id)->orderBy('t.id')->get(['t.payment_method_id', 't.amount', 't.reference', 'g.code as gift_code'])
            ->map(fn ($t) => ['payment_method_id' => (int) $t->payment_method_id, 'amount' => (float) $t->amount, 'reference' => $t->reference, 'code' => $t->gift_code])->all();
        // what a receipt / payment settles, so editing it shows the same allocations
        $out['allocations'] = \Illuminate\Support\Facades\DB::table('voucher_bill_refs')->where('voucher_id', $v->id)->where('ref_type', 'against')
            ->get(['against_voucher_id', 'amount'])->map(fn ($r) => ['against_voucher_id' => (int) $r->against_voucher_id, 'amount' => (float) $r->amount])->all();
        // write-offs that settle this invoice (journals), with their reason
        $out['instrument'] = app(\App\Services\Books\InstrumentService::class)->forVoucher($v->id);
        $out['written_off'] = \Illuminate\Support\Facades\DB::table('voucher_bill_refs as b')->join('vouchers as j', 'j.id', '=', 'b.voucher_id')->join('voucher_types as t', 't.id', '=', 'j.voucher_type_id')
            ->where('b.against_voucher_id', $v->id)->where('b.ref_type', 'against')->where('j.status', 'posted')->where('t.base_type', 'journal')
            ->get(['j.id', 'j.voucher_number', 'b.amount', 'j.meta'])->map(fn ($r) => ['voucher_id' => (int) $r->id, 'voucher_number' => $r->voucher_number, 'amount' => (float) $r->amount, 'reason' => (json_decode($r->meta ?? '[]', true)['writeoff']['reason'] ?? null)])->all();
        $out['credit_applied'] = app(\App\Services\Books\CreditService::class)->appliedTo($v);
        if ($v->type->base_type === VoucherType::DELIVERY_NOTE) {
            $out['delivery'] = app(\App\Services\Delivery\DeliveryStopService::class)->statusFor([$v->id])[$v->id] ?? ['status' => 'not_assigned', 'manifest_number' => null, 'delivered_at' => null];
        }
        $out['outstanding'] = in_array($v->type->base_type, [VoucherType::SALES, VoucherType::PURCHASE], true) ? $this->vouchers->outstanding($v) : null;

        return response()->json($out);
    }

    public function preview(Request $request): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->vouchers->preview($request->all(), $request->user())));
    }

    public function store(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $this->writableAt($request->input('location_id') ?: \App\Models\Location::default()?->id, $request->input('cost_centre_id'));
            $v = $this->vouchers->create($request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} saved", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    public function update(Request $request, $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $existing = $this->writable(Voucher::findOrFail($id));
            if ($request->filled('location_id')) {
                $this->writableAt($request->input('location_id'), $request->input('cost_centre_id'));   // moving it to another branch needs that branch too
            }
            $v = $this->vouchers->alter($existing, $request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} updated", 'data' => $v->load($this->vouchers->relations())]);
        });
    }

    public function cancel(Request $request, $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->cancel($this->writable(Voucher::findOrFail($id)), $request->reason, $request->user());

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
            $v = $this->vouchers->convert($this->writable(Voucher::findOrFail($id)), $data['to'], $request->except('to'), $request->user());

            return response()->json(['message' => "{$v->voucher_number} created", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    /** Where a document would be sent (e-mail, WhatsApp) and what the message says. */
    public function shareInfo($id): JsonResponse
    {
        return $this->guard(fn () => response()->json(app(\App\Services\Books\VoucherShareService::class)->info($this->visible(Voucher::with(['type', 'customer', 'partyLedger', 'currency'])->findOrFail($id)))));
    }

    /** E-mail a document to the customer from the company's default address. */
    public function emailDocument(Request $request, $id): JsonResponse
    {
        $request->validate(['to' => 'nullable|email|max:160', 'note' => 'nullable|string|max:1000']);

        return $this->guard(function () use ($request, $id) {
            try {
                $to = app(\App\Services\Books\VoucherShareService::class)->email($this->visible(Voucher::with('type')->findOrFail($id)), $request->input('to'), $request->input('note'), $request->user()?->id);
            } catch (\Symfony\Component\Mailer\Exception\TransportExceptionInterface $e) {
                throw new BooksException('The mail server refused it: ' . $e->getMessage());
            }

            return response()->json(['message' => "Sent to {$to}"]);
        });
    }

    /** What can still be credited / debited on an invoice, line by line. */
    public function returnable($id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->vouchers->returnable($this->visible(Voucher::with('partyLedger')->findOrFail($id)))));
    }

    /** Credit note against a sales invoice / debit note against a purchase, from the lines picked. */
    public function createReturn(Request $request, $id): JsonResponse
    {
        $request->validate([
            'lines' => 'required|array|min:1', 'lines.*.item_id' => 'required|integer', 'lines.*.mode' => 'nullable|in:return,adjust,writeoff',
            'lines.*.quantity' => 'nullable|numeric|min:0', 'lines.*.amount' => 'nullable|numeric|min:0',
            'date' => 'nullable|date', 'reason' => 'nullable|string|max:255', 'narration' => 'nullable|string', 'reference_no' => 'nullable|string|max:100',
            'refund_ledger_id' => 'nullable|integer|exists:ledgers,id',
        ]);

        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->createReturn($this->writable(Voucher::findOrFail($id)), $request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} created", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    /** Record a receipt against an invoice. */
    public function receive(Request $request, $id): JsonResponse
    {
        $request->validate(['payment_method_id' => 'required_without:tenders|nullable|integer|exists:payment_methods,id', 'tenders' => 'nullable|array', 'withholding' => 'nullable|array', 'withholding.tax_rate_id' => 'required_with:withholding|integer|exists:ledgers,id', 'amount' => 'nullable|numeric|min:0.01', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $id) {
            $v = $this->vouchers->receive($this->writable(Voucher::findOrFail($id)), $request->all(), $request->user());

            return response()->json(['message' => "{$v->voucher_number} recorded", 'data' => $v->load($this->vouchers->relations())], 201);
        });
    }

    /** Send the customer an M-Pesa prompt for an invoice's balance (or an order's total). */
    public function requestPayment(Request $request, $id): JsonResponse
    {
        $request->validate(['payment_method_id' => 'required|integer|exists:payment_methods,id', 'phone' => 'required|string', 'amount' => 'nullable|numeric|min:1']);

        return $this->guard(function () use ($request, $id) {
            $v = $this->writable(Voucher::with('type')->findOrFail($id));
            $method = PaymentMethod::where('gateway', 'mpesa_stk')->findOrFail($request->payment_method_id);
            $due = $v->type->base_type === VoucherType::SALES ? $this->vouchers->outstanding($v) : (float) $v->total_amount;
            $amount = $request->filled('amount') ? min((float) $request->amount, $due) : $due;
            $a = app(\App\Services\Books\GatewayPaymentService::class)->initiateMpesa($v, $method, $request->phone, [], $amount, $request->user());

            return response()->json(['message' => 'Payment request sent to the customer\'s phone.', 'attempt' => ['id' => $a->id, 'status' => $a->status]], 201);
        });
    }

    public function export(Request $request, $id)
    {
        return $this->guard(fn () => $this->export->voucher($this->visible(Voucher::findOrFail($id)), $request->get('format', 'pdf')));
    }

    /** Vouchers register as a file. */
    public function exportList(Request $request)
    {
        return $this->guard(function () use ($request) {
            [$table] = app(\App\Services\Books\Engine\ReportEngine::class)->exportTable('day-book', array_filter([
                'from' => $request->from, 'to' => $request->to, 'type' => $request->voucher_type_id, 'location_id' => $request->location_id,
            ], fn ($v) => $v !== null && $v !== ''), $request->user());

            return $this->export->table(['title' => 'Vouchers'] + $table, $request->get('format', 'csv'), 'vouchers');
        });
    }

    /** Ready-made numbers for a form: next number per type, payment methods, etc. */
    /** The edit log: vouchers that were altered or deleted, with how many versions each has. */
    public function editLog(Request $request, \App\Services\Books\VoucherVersionService $versions): JsonResponse
    {
        $f = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date', 'type' => 'nullable|string|max:40', 'search' => 'nullable|string|max:80']);

        return response()->json(['rows' => $versions->log($f)]);
    }

    /** What one party owes us and what we owe it, bill by bill, plus credit on account — for the receipt and payment form. */
    public function openBills(Request $request, int $ledgerId, \App\Services\Books\OpenBillsService $bills): JsonResponse
    {
        $request->validate(['except' => 'nullable|integer', 'as_of' => 'nullable|date']);

        return response()->json($bills->forLedger($ledgerId, $request->integer('except') ?: null, $request->get('as_of')));
    }

    /** The overpayments and advances a storefront customer holds, for the sales form. */
    public function customerCredits(int $customerId, \App\Services\Books\OpenBillsService $bills): JsonResponse
    {
        return response()->json(['credits' => $bills->forCustomer($customerId)]);
    }

    /** Settle a posted sales / purchase invoice from the party's credit on account. */
    public function applyCredit(Request $request, int $id, \App\Services\Books\CreditService $credit): JsonResponse
    {
        $d = $request->validate(['amount' => 'nullable|numeric|min:0.01', 'credit_voucher_ids' => 'nullable|array', 'credit_voucher_ids.*' => 'integer']);

        return $this->guard(function () use ($request, $id, $credit, $d) {
            $res = $credit->apply($this->writable(Voucher::findOrFail($id)), isset($d['amount']) ? (float) $d['amount'] : null, $d['credit_voucher_ids'] ?? null, $request->user());

            return response()->json($res + ['message' => 'Applied ' . number_format($res['applied'], 2) . ' of credit.']);
        });
    }

    /** Give applied credit back: the invoice is outstanding again. */
    public function releaseCredit(Request $request, int $id, \App\Services\Books\CreditService $credit): JsonResponse
    {
        $request->validate(['credit_voucher_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $id, $credit) {
            $n = $credit->release($this->writable(Voucher::findOrFail($id)), $request->integer('credit_voucher_id') ?: null, $request->user());

            return response()->json(['released' => $n, 'message' => $n > 0 ? 'Credit given back: ' . number_format($n, 2) : 'No applied credit to give back.']);
        });
    }

    /** Every cash ledger with its book balance and last count, and the cash-on-delivery orders still to collect. */
    public function cash(\App\Services\Books\CashCountService $cash, \App\Services\Books\LedgerService $ledgers): JsonResponse
    {
        // cash is counted; banks (and mobile money) are shown with what the books say, ready to be reconciled against the statement
        $group = \App\Models\Books\LedgerGroup::where('name', 'Bank Accounts')->first();
        $banks = $group ? \App\Models\Books\Ledger::whereIn('group_id', $group->selfAndDescendantIds())->where('is_active', true)->orderBy('name')->get()
            ->map(fn ($l) => ['ledger_id' => (int) $l->id, 'name' => $l->name, 'balance' => $ledgers->balance($l->id), 'bank_name' => $l->bank_name, 'account_number' => $l->account_number, 'branch' => $l->branch,
                'mobile_kind' => $l->mobile_kind, 'mobile_number' => $l->mobile_number])->values() : collect();

        return response()->json($cash->overview() + ['banks' => $banks, 'banks_total' => round((float) $banks->sum('balance'), 2)]);
    }

    public function cashCounts(Request $request, \App\Services\Books\CashCountService $cash): JsonResponse
    {
        $request->validate(['ledger_id' => 'nullable|integer']);

        return response()->json(['rows' => $cash->history($request->integer('ledger_id') ?: null)]);
    }

    /** Count a cash ledger against the books; a difference needs a reason and can be posted to Cash over / short. */
    public function cashCount(Request $request, \App\Services\Books\CashCountService $cash): JsonResponse
    {
        $d = $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id', 'date' => 'nullable|date', 'counted' => 'required|numeric|min:0', 'reason' => 'nullable|string|max:255', 'post' => 'nullable|boolean']);

        return $this->guard(function () use ($request, $cash, $d) {
            $c = $cash->record((int) $d['ledger_id'], $d['date'] ?? null, (float) $d['counted'], $d['reason'] ?? null, (bool) ($d['post'] ?? true), $request->user());

            return response()->json(['id' => $c->id, 'difference' => (float) $c->difference, 'message' => abs((float) $c->difference) < 0.005 ? 'Counted — the cash agrees with the books.' : 'Counted — ' . number_format(abs((float) $c->difference), 2) . ((float) $c->difference < 0 ? ' short' : ' over') . ($c->adjust_voucher_id ? ' and posted to Cash over / short.' : '.')], 201);
        });
    }

    /** Cash a driver collected is handed in to the till. */
    public function cashHandIn(Request $request, \App\Services\Books\CashCountService $cash): JsonResponse
    {
        $d = $request->validate(['from_ledger_id' => 'required|integer|exists:ledgers,id', 'to_ledger_id' => 'required|integer|exists:ledgers,id', 'amount' => 'required|numeric|min:0.01', 'by' => 'nullable|string|max:80', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $cash, $d) {
            $v = $cash->handIn((int) $d['from_ledger_id'], (int) $d['to_ledger_id'], (float) $d['amount'], $d['by'] ?? null, $d['date'] ?? null, $request->user());

            return response()->json(['id' => $v->id, 'voucher_number' => $v->voucher_number, 'message' => "Handed in — {$v->voucher_number}."], 201);
        });
    }

    /** The cheque register: cheques in hand, post-dated, deposited, issued, bounced, cleared. */
    public function cheques(Request $request, \App\Services\Books\ChequeService $cheques): JsonResponse
    {
        $request->validate(['status' => 'nullable|in:in_hand,post_dated,deposited,issued,cleared,bounced,all', 'search' => 'nullable|string|max:80']);

        return response()->json($cheques->register($request->only(['status', 'search'])));
    }

    /** Deposit, clear or undo a cheque. Posts nothing. */
    public function chequeMove(Request $request, int $id, \App\Services\Books\ChequeService $cheques): JsonResponse
    {
        $d = $request->validate(['action' => 'required|in:deposit,clear,undo', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $id, $cheques, $d) {
            $i = $cheques->move($id, $d['action'], $d['date'] ?? null, $request->user());

            return response()->json(['status' => $i->status, 'message' => 'Cheque ' . $i->number . ' is now ' . $i->status . '.']);
        });
    }

    /** A cheque we received was returned by the bank. Finance and super admin only. */
    public function chequeBounce(Request $request, int $id, \App\Services\Books\ChequeService $cheques): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:160', 'bank_fee' => 'nullable|numeric|min:0', 'bill_fee' => 'nullable|numeric|min:0', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $id, $cheques, $d) {
            $j = $cheques->bounce($id, $d, $request->user());

            return response()->json(['id' => $j->id, 'voucher_number' => $j->voucher_number, 'message' => "Bounce recorded — {$j->voucher_number}."], 201);
        });
    }

    /** Write off (part of) one unpaid invoice. Finance and super admin only. */
    public function writeOff(Request $request, int $id, \App\Services\Books\WriteOffService $writeOff): JsonResponse
    {
        $d = $request->validate(['amount' => 'nullable|numeric|min:0.01', 'kind' => 'required|in:bad_debt,small_balance', 'reason' => 'required|string|max:500', 'date' => 'nullable|date']);

        return $this->guard(function () use ($request, $id, $writeOff, $d) {
            $j = $writeOff->writeOff([['voucher_id' => $id, 'amount' => isset($d['amount']) ? (float) $d['amount'] : null]], $d['kind'], $d['reason'], $request->user(), $d['date'] ?? null);

            return response()->json(['id' => $j->id, 'voucher_number' => $j->voucher_number, 'message' => "Written off — {$j->voucher_number}."], 201);
        });
    }

    /** Write off a customer's whole open balance (every unpaid invoice), or only the invoices listed. */
    public function writeOffParty(Request $request, int $ledgerId, \App\Services\Books\WriteOffService $writeOff): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|in:bad_debt,small_balance', 'reason' => 'required|string|max:500', 'date' => 'nullable|date',
            'bills' => 'nullable|array', 'bills.*.voucher_id' => 'required|integer', 'bills.*.amount' => 'nullable|numeric|min:0.01']);

        return $this->guard(function () use ($request, $ledgerId, $writeOff, $d) {
            $items = $d['bills'] ?? $writeOff->openInvoicesOf($ledgerId);
            $j = $writeOff->writeOff($items, $d['kind'], $d['reason'], $request->user(), $d['date'] ?? null);

            return response()->json(['id' => $j->id, 'voucher_number' => $j->voucher_number, 'message' => "Written off — {$j->voucher_number}."], 201);
        });
    }

    /** Every version of one voucher, for comparing any two. */
    public function versions(int $id, \App\Services\Books\VoucherVersionService $versions): JsonResponse
    {
        $v = $this->visible(Voucher::with('type:id,name')->findOrFail($id));

        return response()->json(['voucher' => ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'type' => $v->type?->name], 'versions' => $versions->versions($id)]);
    }

    /** What a customer could use on a sale being entered: their gift vouchers (with what each covers) and promo codes (with the discount each gives). */
    public function entitlements(Request $request): JsonResponse
    {
        $d = $request->validate(['customer_id' => 'required|integer|exists:customers,id', 'total' => 'required|numeric|min:0', 'net' => 'nullable|numeric|min:0']);
        $money = app(\App\Services\CurrencyConversionService::class);

        return response()->json(app(\App\Services\Books\CheckoutService::class)->entitlements(
            \App\Models\Customer::findOrFail($d['customer_id']), (float) $d['total'], (float) ($d['net'] ?? $d['total']), 0.0, $money->getBaseCurrency()
        ));
    }

    /** Has this supplier already been billed under this invoice number? A warning only — never blocks. */
    public function checkSupplierInvoice(Request $request): JsonResponse
    {
        $d = $request->validate(['party_ledger_id' => 'required|integer', 'no' => 'required|string|max:100', 'exclude_id' => 'nullable|integer']);
        $rows = Voucher::where('party_ledger_id', $d['party_ledger_id'])->where('supplier_invoice_no', trim($d['no']))->where('status', '!=', 'cancelled')
            ->when(! empty($d['exclude_id']), fn ($q) => $q->where('id', '!=', $d['exclude_id']))
            ->get(['id', 'voucher_number', 'date', 'total_amount'])->map(fn ($v) => ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'total' => (float) $v->total_amount]);

        return response()->json(['duplicates' => $rows]);
    }

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
            $purchase = $request->get('purpose') === 'purchase';
            $variants = \App\Models\Ecommerce\ProductVariant::with(['product:id,name,sku,status,track_expiry,is_for_sale', 'units.unit:id,code,name'])
                ->whereHas('product', fn ($p) => $p->where('status', 'active')->when(! $purchase, fn ($x) => $x->where('is_for_sale', true)))
                ->when($q !== '', fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like)->orWhereHas('product', fn ($p) => $p->where('name', 'like', $like)->orWhere('sku', 'like', $like))))
                ->orderBy('product_id')->limit(30)->get();

            // Nothing matches: offer near matches ("did you mean…"), flagged so the picker can say so.
            $fuzzy = false;
            if ($variants->isEmpty() && mb_strlen($q) >= 3) {
                $near = app(\App\Services\FuzzySuggestService::class)->suggest(
                    \App\Models\Ecommerce\Product::query()->where('status', 'active')->when(! $purchase, fn ($x) => $x->where('is_for_sale', true)),
                    $q, ['name', 'sku'], 6
                );
                if ($near->isNotEmpty()) {
                    $variants = \App\Models\Ecommerce\ProductVariant::with(['product:id,name,sku,status,track_expiry,is_for_sale', 'units.unit:id,code,name'])
                        ->whereIn('product_id', $near->pluck('id'))->orderBy('product_id')->limit(30)->get();
                    $fuzzy = true;
                }
            }
            foreach ($variants as $v) {
                $out[] = $this->productRow($v) + ['fuzzy' => $fuzzy];
            }
        } elseif ($kind === 'ingredient') {
            // the kitchen's ingredient variants (Menus on): the ingredient and the variant are named apart; units are packs, the bigger unit and the base unit
            if (\App\Services\Menus\IngredientStock::moduleOn()) {
                $loc = (int) $request->get('location_id');
                $variants = fn () => \App\Models\Menus\IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->where('is_active', true)->whereHas('ingredient', fn ($i) => $i->where('is_active', true));
                $items = $variants()
                    ->when($request->filled('ids'), fn ($v) => $v->whereIn('id', array_map('intval', explode(',', (string) $request->get('ids')))))
                    ->when($q !== '' && ! $request->filled('ids'), fn ($v) => $this->ingredientWords($v, $q))
                    ->orderBy('ingredient_id')->orderBy('preference')->limit(40)->get();
                // nothing matches: near matches ("did you mean..."), flagged so the picker can say so
                $fuzzy = false;
                if ($items->isEmpty() && $q !== '' && ! $request->filled('ids') && mb_strlen($q) >= 3) {
                    $near = app(\App\Services\FuzzySuggestService::class)->suggest(\App\Models\Menus\Ingredient::query()->where('is_active', true), $q, ['name'], 6);
                    if ($near->isNotEmpty()) {
                        $items = $variants()->whereIn('ingredient_id', $near->pluck('id'))->orderBy('ingredient_id')->orderBy('preference')->limit(40)->get();
                        $fuzzy = true;
                    }
                }
                $stock = $loc ? \App\Models\Menus\StockBatch::where('location_id', $loc)->where('qty_left', '>', 0)->groupBy('item_id')->selectRaw('item_id, SUM(qty_left) as q')->pluck('q', 'item_id') : collect();
                $cost = \App\Models\Menus\StockBatch::whereIn('item_id', $items->pluck('id'))->where('source', '!=', 'count')->orderBy('id')->pluck('unit_cost', 'item_id');   // the latest lot's cost wins
                foreach ($items as $i) {
                    $out[] = ['type' => 'ingredient', 'item_id' => $i->id, 'ingredient_id' => $i->ingredient_id, 'ingredient' => $i->ingredient->name, 'variant' => $i->name, 'sku' => $i->code, 'units' => $i->unitChoices(),
                        'track_expiry' => (bool) $i->track_expiry, 'base_unit' => $i->ingredient->baseUnit?->code, 'on_hand' => round((float) ($stock[$i->id] ?? 0), 4), 'last_cost' => (float) ($cost[$i->id] ?? 0), 'fuzzy' => $fuzzy];   // cost per base unit
                }
            }
        } elseif ($kind === 'service') {
            $variants = \App\Models\ServiceVariant::with(['service:id,name,status', 'materials.variant.product:id,name,is_for_sale', 'materials.variant.units.unit:id,code'])
                ->whereHas('service', fn ($s) => $s->where('status', 'active'))
                ->when($request->filled('service_variant_id'), fn ($v) => $v->where('id', (int) $request->query('service_variant_id')))
                ->when($q !== '' && ! $request->filled('service_variant_id'), fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', $like)->orWhereHas('service', fn ($s) => $s->where('name', 'like', $like))))
                ->orderBy('service_id')->limit(30)->get();
            $feeSvc = app(\App\Services\Booking\BookingService::class);
            foreach ($variants as $v) {
                $out[] = ['type' => 'service', 'service_id' => $v->service_id, 'service_variant_id' => $v->id, 'service' => $v->service?->name, 'package' => $v->name, 'price' => $v->price !== null ? (float) $v->price : null,
                    'materials' => $v->materials->map(fn ($m) => $m->toRow())->values(), 'fees' => $this->ticked($feeSvc, $v)];
            }
        } elseif ($kind === 'hamper') {
            $h = \App\Models\Ecommerce\Hamper::where('status', 'active')->when($q !== '', fn ($w) => $w->where('name', 'like', $like))->limit(30)->get();
            $who = $request->filled('customer_id') ? \App\Models\Customer::find($request->customer_id) : null;
            $rules = app(\App\Services\Books\HamperEditionService::class);
            foreach ($h as $x) {
                $out[] = ['type' => 'hamper', 'hamper_id' => $x->id, 'name' => $x->name, 'price' => (float) $x->price, 'location_id' => $x->location_id, 'badges' => $rules->badges($x, $who)];
            }
        } elseif ($kind === 'customer') {
            $c = \App\Models\Customer::when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like)))
                ->orderBy('first_name')->limit(30)->get(['id', 'first_name', 'last_name', 'email']);
            foreach ($c as $x) {
                $out[] = ['type' => 'customer', 'customer_id' => $x->id, 'name' => trim($x->first_name . ' ' . $x->last_name), 'email' => $x->email];
            }
        } else {
            return response()->json(['message' => 'kind must be product, ingredient, service, hamper or customer.'], 422);
        }

        return response()->json($out);
    }

    /**
     * Kitchen stock search: every word typed must be found in the ingredient's name, the variant's name or code, or the ingredient's kind ("scrub sponge" finds "Sponges, Scrub Daddy Sponge (dz)"),
     * in any order.
     */
    private function ingredientWords($query, string $q)
    {
        $kinds = \App\Services\Menus\IngredientKinds::installed();
        foreach (preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY) as $word) {
            $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $word).'%';
            $query->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('code', 'like', $like)
                ->orWhereHas('ingredient', fn ($i) => $i->where('name', 'like', $like)->when($kinds, fn ($k) => $k->orWhereHas('kind', fn ($x) => $x->where('name', 'like', $like)))));
        }

        return $query;
    }

    /** One product variant as the pickers show it: names, units with prices, and what a purchase line needs (expiry tracking, last cost). */
    /** The service fees ticked for this package, as lines for a sales document (see BookingService::chargeLinesFor). */
    private function ticked(\App\Services\Booking\BookingService $svc, \App\Models\ServiceVariant $v): array
    {
        try {
            $service = \App\Models\Service::find($v->service_id);

            return $service ? $svc->chargeLinesFor($service, $v) : [];
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function productRow(\App\Models\Ecommerce\ProductVariant $v): array
    {
        $units = $v->units->map(function ($u) use ($v) {
            $u->setRelation('variant', $v);

            return ['id' => $u->id, 'code' => $u->unit?->code, 'role' => $u->role, 'sellable' => (bool) $u->is_sellable, 'is_default_sale' => (bool) $u->is_default_sale,
                'is_purchasable' => (bool) $u->is_purchasable, 'base_factor' => (float) $u->base_factor, 'price' => $u->effectivePrice()];
        })->values();

        return ['type' => 'product', 'variant_id' => $v->id, 'product_id' => $v->product_id, 'product' => $v->product?->name, 'variant' => $v->name, 'sku' => $v->sku, 'units' => $units,
            'track_expiry' => (bool) $v->product?->track_expiry, 'for_sale' => (bool) $v->product?->is_for_sale,
            'base_price' => app(\App\Services\Stock\StockJobService::class)->systemPrice($v->id),   // selling price per base unit in the base currency; null = none set
            'last_cost' => app(\App\Services\Stock\BatchService::class)->lastCost($v->id)];   // base currency, per base unit; 0 = never bought
    }

    /**
     * Every variant of a product, for the Purchases page after the admin creates or edits a product from it.
     * A product with no variant gets its "Standard" one first — the same silent default variant product
     * creation makes — so the purchase line always has something to attach stock to.
     */
    public function productVariants($productId): JsonResponse
    {
        $product = \App\Models\Ecommerce\Product::findOrFail($productId);
        if ($product->productVariants()->doesntExist()) {
            try {
                app(\App\Services\Location\VariantStockService::class)->ensureDefaultVariant($product);
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }
        $variants = $product->productVariants()->with(['product:id,name,sku,status,track_expiry,is_for_sale', 'units.unit:id,code,name'])->orderByDesc('is_default')->orderBy('id')->get();

        return response()->json($variants->map(fn ($v) => $this->productRow($v))->values());
    }

    /**
     * Batches of a product variant that can be sold from at a branch (active, with stock there), first-expiring first —
     * for the "which batch?" choice on a sale line. Costs are not sent.
     */
    public function stockBatches(Request $request): JsonResponse
    {
        $d = $request->validate(['variant_id' => 'required|integer', 'location_id' => 'nullable|integer']);
        $q = \Illuminate\Support\Facades\DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $d['variant_id'])->where('s.status', 'active')->where('b.quantity', '>', 0)
            ->when(! empty($d['location_id']), fn ($x) => $x->where('b.location_id', $d['location_id']))
            ->groupBy('s.id', 's.batch_no', 's.expiry_date')
            ->orderByRaw('s.expiry_date IS NULL')->orderBy('s.expiry_date')->orderBy('s.id')
            ->get(['s.id', 's.batch_no', 's.expiry_date', \Illuminate\Support\Facades\DB::raw('SUM(b.quantity) as quantity')]);

        return response()->json($q->map(fn ($r) => ['id' => (int) $r->id, 'batch_no' => $r->batch_no, 'expiry_date' => $r->expiry_date, 'quantity' => (float) $r->quantity])->values());
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
            $gv = app(\App\Services\Books\GiftVoucherService::class)->issueFromCreditNote($this->writable(Voucher::findOrFail($id)), isset($d['amount']) ? (float) $d['amount'] : null, $d['expires_at'] ?? null, $request->user());

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

    /** Set the shop's stock numbers from the batches, where the two disagree. */
    public function stockRefresh()
    {
        $n = app(\App\Services\Stock\StockReconciliationService::class)->refreshUnits();

        return response()->json(['message' => $n ? "Refreshed {$n} product(s) from their batches." : 'Every number already agrees with the batches.']);
    }
}
