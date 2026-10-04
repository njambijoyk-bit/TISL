<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Books\BooksReportService;
use App\Services\Books\ExportService;
use Carbon\Carbon;
use App\Services\Books\LedgerService;
use App\Services\Books\OpenBillsService;
use App\Services\Books\PaymentModeService;
use App\Services\CurrencyConversionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "My account" for a storefront customer: what they owe us bill by bill (invoices and bounced-cheque fees), what is overdue,
 * what they have paid in advance or over, their credit limit, the last 90 days of their statement, and how to pay us.
 * All of it is their own ledger — nothing here lets a customer see or touch anyone else's.
 */
class MyAccountController extends Controller
{
    public function show(Request $request, LedgerService $ledgers, OpenBillsService $open, BooksReportService $reports, PaymentModeService $modes, CurrencyConversionService $money): JsonResponse
    {
        $c = $request->user()?->customer;
        abort_unless($c, 404);
        $base = $money->getBaseCurrency()->only(['code', 'symbol']);
        $ledger = Ledger::where('customer_id', $c->id)->first();
        $howToPay = array_map(fn ($m) => ['label' => $m['label'], 'kind' => $m['kind'], 'instructions' => $m['instructions']], $modes->offered());
        if (! $ledger) {
            return response()->json(['base_currency' => $base, 'owed' => 0, 'overdue' => 0, 'credits' => [], 'bills' => [], 'statement' => ['opening' => 0, 'closing' => 0, 'rows' => []], 'terms' => null, 'how_to_pay' => $howToPay]);
        }

        $ob = $open->forLedger($ledger->id);
        $bills = array_values(array_filter($ob['bills'], fn ($b) => $b['side'] === 'receivable'));
        // the order an invoice came from, so the customer can open it
        $orderOf = Voucher::with('source.type')->whereIn('id', array_column($bills, 'voucher_id'))->get()
            ->mapWithKeys(fn ($v) => [$v->id => ($v->source && $v->source->type?->base_type === VoucherType::SALES_ORDER) ? $v->source->id : null]);
        // The bills are held in each invoice's own currency (a USD invoice is USD 3,600, not KES 3,600). The customer's totals are in
        // the base currency, so take each bill's base figure from the ageing report, which already restates them, and keep the bill's own
        // currency alongside so they can still see what they were invoiced.
        $ageing = $reports->ageing('receivables', null, $ledger->id);
        $inBase = collect($ageing['rows'][0]['bills'] ?? [])->keyBy('voucher_id');
        $bills = array_map(function ($b) use ($orderOf, $inBase) {
            $a = $inBase[$b['voucher_id']] ?? null;
            $ratio = $a && (float) $a['open_fc'] > 0 ? (float) $a['open'] / (float) $a['open_fc'] : 1.0;

            return ['voucher_number' => $b['voucher_number'], 'type_name' => $b['type'] === 'journal' ? 'Bounced cheque fee' : 'Invoice', 'date' => $b['date'], 'due_date' => $b['due_date'],
                'days_late' => $b['days_late'], 'original' => round($b['original'] * $ratio, 2), 'outstanding' => $a ? round((float) $a['open'], 2) : $b['outstanding'],
                'currency' => $a['currency'] ?? null, 'foreign' => (bool) ($a['foreign'] ?? false), 'outstanding_fc' => $b['outstanding'],
                'order_id' => $orderOf[$b['voucher_id']] ?? null];
        }, $bills);

        $limit = 0.0;
        if ($c->has_credit_account && (float) $c->credit_limit > 0) {
            $limit = $money->convert((float) $c->credit_limit, $money->currencyFrom($c->credit_currency_id ?? $c->currency_id), $money->getBaseCurrency());
        }
        $balance = $ledgers->balance($ledger->id);   // net: debit = they owe us, credit = we hold money for them
        [$from, $to] = $this->period($request);
        $statement = $reports->ledgerStatement($ledger->id, $from, $to);

        return response()->json([
            'base_currency' => $base,
            'owed' => round(array_sum(array_column($bills, 'outstanding')), 2),
            'overdue' => round(array_sum(array_map(fn ($b) => $b['days_late'] > 0 ? $b['outstanding'] : 0, $bills)), 2),
            'balance' => round($balance, 2),   // what the ledger nets to after anything held for them
            'credits' => array_values(array_filter($ob['credits'], fn ($x) => $x['kind'] === 'credit')),
            'bills' => $bills,
            'terms' => $c->has_credit_account ? ['limit' => round($limit, 2), 'available' => round(max(0, $limit - max(0, $balance)), 2), 'days' => (int) ($c->credit_terms_days ?: 30)] : null,
            // dates, documents and amounts only — the books' own notes (write-off reasons, bounce reasons) stay inside
            'statement' => ['from' => $from, 'to' => $to, 'opening' => $statement['opening'], 'closing' => $statement['closing'], 'rows' => array_map(fn ($r) => [
                'date' => $r['date'], 'voucher_number' => $r['voucher_number'], 'type' => $r['type'], 'debit' => $r['debit'], 'credit' => $r['credit'], 'balance' => $r['balance'],
            ], $statement['rows'])],
            'how_to_pay' => $howToPay,
        ]);
    }

    /**
     * The statement period: a preset (`range` = 30d, 60d, 90d, 6m, 12m, ytd) or a custom `from`/`to`. Never in the future, never longer
     * than a year, and 90 days when nothing sensible is asked for.
     *
     * @return array{0: string, 1: string}
     */
    private function period(Request $request): array
    {
        $today = today();
        $to = $today->copy();
        $from = match ((string) $request->query('range')) {
            '30d' => $today->copy()->subDays(30),
            '60d' => $today->copy()->subDays(60),
            '6m' => $today->copy()->subMonths(6),
            '12m' => $today->copy()->subYear(),
            'ytd' => $today->copy()->startOfYear(),
            default => null,
        };
        if (! $from && $request->filled('from')) {
            try {
                $from = Carbon::parse((string) $request->query('from'))->startOfDay();
                if ($request->filled('to')) {
                    $to = Carbon::parse((string) $request->query('to'))->startOfDay();
                }
            } catch (\Throwable) {
                $from = null;
            }
        }
        $from ??= $today->copy()->subDays(90);
        $to = $to->greaterThan($today) ? $today->copy() : $to;
        if ($from->greaterThan($to)) {
            $from = $to->copy();
        }
        if ($from->lessThan($to->copy()->subYear())) {
            $from = $to->copy()->subYear();
        }

        return [$from->toDateString(), $to->toDateString()];
    }

    /** The customer's statement for the chosen period as a download (pdf, csv, xml, html or json). Always their own ledger. */
    public function statementExport(Request $request, BooksReportService $reports, ExportService $export, CurrencyConversionService $money)
    {
        $c = $request->user()?->customer;
        abort_unless($c, 404);
        $ledger = Ledger::where('customer_id', $c->id)->first();
        abort_unless($ledger, 404);
        [$from, $to] = $this->period($request);
        $st = $reports->ledgerStatement($ledger->id, $from, $to);
        $code = (string) $money->getBaseCurrency()->code;
        $rows = [['date' => $from, 'voucher_number' => '', 'type' => 'Brought forward', 'debit' => '', 'credit' => '', 'balance' => round((float) $st['opening'], 2)]];
        foreach ($st['rows'] as $r) {
            $rows[] = ['date' => $r['date'], 'voucher_number' => $r['voucher_number'], 'type' => $r['type'], 'debit' => $r['debit'] ? round((float) $r['debit'], 2) : '',
                'credit' => $r['credit'] ? round((float) $r['credit'], 2) : '', 'balance' => round((float) $r['balance'], 2)];
        }
        $table = [
            'title' => 'Statement: ' . implode(' · ', array_filter([$ledger->name ?: ($request->user()->name ?? 'My account'), $c->company_name && $c->company_name !== $ledger->name ? $c->company_name : null])),
            'subtitle' => "For the period {$from} to {$to} · amounts in {$code} · a negative balance means we hold money for you",
            'columns' => ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Document', 'debit' => "Charged ({$code})", 'credit' => "Paid / credited ({$code})", 'balance' => "Balance ({$code})"],
            'rows' => $rows,
            'totals' => ['type' => 'Totals', 'debit' => round((float) array_sum(array_column($st['rows'], 'debit')), 2), 'credit' => round((float) array_sum(array_column($st['rows'], 'credit')), 2), 'balance' => round((float) $st['closing'], 2)],
        ];
        $format = in_array(strtolower((string) $request->query('format', 'pdf')), ExportService::FORMATS, true) ? strtolower((string) $request->query('format', 'pdf')) : 'pdf';

        $party = ['company_name' => $c->company_name, 'ledger_name' => $ledger->name ?: ($request->user()->name ?? null),
            'address' => $ledger->address ?: ($c->default_billing_address ?: $c->default_shipping_address), 'tax_pin' => $c->tax_id, 'phone' => $c->phone ?: $request->user()->phone, 'email' => $c->email ?: $request->user()->email,
            'first_name' => $c->first_name ?: null, 'last_name' => $c->last_name ?: null, 'from' => $from, 'to' => $to, 'currency' => $code,
            // the line about negative balances only when this statement actually shows one
            'negative' => (float) $st['closing'] < 0 || (bool) array_filter($st['rows'], fn ($r) => (float) $r['balance'] < 0) || (float) $st['opening'] < 0];

        return $export->statement($table, $party, $format, "statement-{$from}-to-{$to}");
    }

    /**
     * "Ledger outstandings": the open bills on my ledger as a formal letter (pdf, html, or csv/xml/json rows). Amounts are in the base
     * currency, taken from the ageing report that already restates foreign-currency bills.
     */
    public function outstandingsExport(Request $request, OpenBillsService $open, BooksReportService $reports, ExportService $export, CurrencyConversionService $money)
    {
        $c = $request->user()?->customer;
        abort_unless($c, 404);
        $ledger = Ledger::where('customer_id', $c->id)->first();
        abort_unless($ledger, 404);

        $ageing = $reports->ageing('receivables', null, $ledger->id);
        $bills = array_map(fn ($b) => ['date' => $b['date'], 'voucher_number' => $b['voucher_number'], 'due_date' => $b['due_date'], 'days_late' => $b['days_late'], 'outstanding' => $b['open']],
            $ageing['rows'][0]['bills'] ?? []);
        usort($bills, fn ($a, $b) => [$a['date'], $a['voucher_number']] <=> [$b['date'], $b['voucher_number']]);   // oldest bill first, as on a ledger

        $format = in_array(strtolower((string) $request->query('format', 'pdf')), ExportService::FORMATS, true) ? strtolower((string) $request->query('format', 'pdf')) : 'pdf';
        $party = ['company_name' => $c->company_name, 'ledger_name' => $ledger->name ?: ($request->user()->name ?? null),
            'address' => $ledger->address ?: ($c->default_billing_address ?: $c->default_shipping_address), 'tax_pin' => $c->tax_id,
            'phone' => $c->phone ?: $request->user()->phone, 'email' => $c->email ?: $request->user()->email, 'currency' => (string) $money->getBaseCurrency()->code];

        return $export->outstandings($bills, $party, $format, 'ledger-outstandings-' . today()->toDateString());
    }

    /** The kinds of document a customer can download, and the voucher types behind each. */
    private const DOC_KINDS = [
        'invoices' => [VoucherType::SALES, VoucherType::CASH_SALE], 'receipts' => [VoucherType::RECEIPT], 'quotations' => [VoucherType::QUOTATION],
        'orders' => [VoucherType::SALES_ORDER], 'deliveries' => [VoucherType::DELIVERY_NOTE], 'credits' => [VoucherType::CREDIT_NOTE],
    ];

    private function docKind(Request $request): string
    {
        return array_key_exists((string) $request->query('kind'), self::DOC_KINDS) ? (string) $request->query('kind') : 'invoices';
    }

    /** The vouchers of mine that are mine to download: posted, on my ledger or against my customer record. A quotation still only requested has no prices yet. */
    private function myDocuments(Request $request, string $kind)
    {
        $c = $request->user()?->customer;
        abort_unless($c, 404);
        $ledgerId = Ledger::where('customer_id', $c->id)->value('id');

        return Voucher::with(['type', 'currency'])->where('status', Voucher::POSTED)
            ->whereHas('type', fn ($t) => $t->whereIn('base_type', self::DOC_KINDS[$kind]))
            ->when($kind === 'quotations', fn ($q) => $q->where('doc_status', '!=', 'requested'))
            ->where(fn ($w) => $w->where('customer_id', $c->id)->when($ledgerId, fn ($q) => $q->orWhere('party_ledger_id', $ledgerId)));
    }

    /** My invoices (the default), receipts, quotations, orders or deliveries (`kind=`), newest first, optionally within a date range or matching a number. */
    public function documents(Request $request): JsonResponse
    {
        $kind = $this->docKind($request);
        $q = $this->myDocuments($request, $kind)
            ->when($request->filled('from'), fn ($w) => $w->whereDate('date', '>=', (string) $request->query('from')))
            ->when($request->filled('to'), fn ($w) => $w->whereDate('date', '<=', (string) $request->query('to')))
            ->when($request->filled('q'), fn ($w) => $w->where('voucher_number', 'like', '%' . trim((string) $request->query('q')) . '%'));

        $found = $q->orderByDesc('date')->orderByDesc('id')->limit(200)->get();
        $delivery = $kind === 'deliveries' ? app(ExportService::class)->deliveryInfo($found->pluck('id')->all()) : [];

        return response()->json(['kind' => $kind, 'data' => $found->map(fn ($v) => [
            'id' => $v->id, 'voucher_number' => $v->voucher_number, 'type_name' => $v->type?->name, 'date' => $v->date?->toDateString(), 'due_date' => $v->due_date?->toDateString(),
            'total' => (float) $v->total_amount, 'currency' => $v->currency?->code, 'symbol' => $v->currency?->symbol,
        ] + ($kind === 'deliveries' ? ['delivery' => $delivery[$v->id] ?? null] : []))->values()]);
    }

    /** One of my documents as a printable document (pdf or html). Anyone else's is a 404. */
    public function documentDownload(Request $request, ExportService $export, $id)
    {
        $kind = $this->docKind($request);
        $found = $this->myDocuments($request, $kind)->whereKey((int) $id)->first();
        abort_unless($found, 404);
        $format = strtolower((string) $request->query('format', 'pdf')) === 'html' ? 'html' : 'pdf';

        return $export->document($found, $format);
    }
}
