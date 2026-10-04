<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\DocumentShare;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use App\Services\Books\BooksException;
use App\Services\Books\ExportService;
use App\Services\Books\VoucherShareService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Books > Mail: the customer documents that can be sent from a list, the customer copy of any one of them, and the record of what
 * was sent, by whom and to whom.
 */
class DocumentMailController extends Controller
{
    private const KINDS = [
        'invoices' => [VoucherType::SALES, VoucherType::CASH_SALE], 'receipts' => [VoucherType::RECEIPT], 'quotations' => [VoucherType::QUOTATION],
        'orders' => [VoucherType::SALES_ORDER], 'deliveries' => [VoucherType::DELIVERY_NOTE], 'credits' => [VoucherType::CREDIT_NOTE],
    ];

    private function customerName(Voucher $v): string
    {
        $c = $v->customer;

        return trim(($c?->first_name ?? '') . ' ' . ($c?->last_name ?? '')) ?: ($v->partyLedger?->name ?? $v->party_name ?? '—');
    }

    /** The customer copy of one voucher, to download or print (pdf or html). */
    public function copy(Request $request, ExportService $export, $id)
    {
        $v = Voucher::with('type')->findOrFail($id);
        abort_unless(in_array($v->type?->base_type, ExportService::CUSTOMER_DOCS, true) && $v->status === Voucher::POSTED, 422, 'This document has no customer copy.');

        return $export->document($v, strtolower((string) $request->query('format', 'pdf')) === 'html' ? 'html' : 'pdf');
    }

    /** Documents that can be sent, newest first, with where each would go and when it was last sent. */
    public function documents(Request $request): JsonResponse
    {
        $bases = self::KINDS[(string) $request->query('kind')] ?? ExportService::CUSTOMER_DOCS;
        $q = Voucher::with(['type:id,name,base_type', 'currency:id,code,symbol', 'customer:id,email,phone,first_name,last_name', 'partyLedger:id,name'])
            ->where('status', Voucher::POSTED)->whereHas('type', fn ($t) => $t->whereIn('base_type', $bases))
            ->when($request->query('kind') === 'quotations', fn ($w) => $w->where('doc_status', '!=', 'requested'))
            ->when($request->filled('from'), fn ($w) => $w->whereDate('date', '>=', (string) $request->query('from')))
            ->when($request->filled('to'), fn ($w) => $w->whereDate('date', '<=', (string) $request->query('to')))
            ->when($request->filled('q'), function ($w) use ($request) {
                $s = '%' . trim((string) $request->query('q')) . '%';
                $w->where(fn ($x) => $x->where('voucher_number', 'like', $s)->orWhere('party_name', 'like', $s)->orWhereHas('partyLedger', fn ($l) => $l->where('name', 'like', $s)));
            })
            ->orderByDesc('date')->orderByDesc('id');
        $page = $q->paginate(min((int) $request->query('per_page', 25), 100));

        $last = [];
        try {
            foreach (DocumentShare::whereIn('voucher_id', $page->pluck('id'))->orderBy('id')->get() as $s) {
                $last[$s->voucher_id] = ['at' => $s->created_at?->toDateTimeString(), 'channel' => $s->channel, 'status' => $s->status];
            }
        } catch (\Throwable) {
            // script 75 not run yet
        }
        $page->getCollection()->transform(fn ($v) => [
            'id' => $v->id, 'voucher_number' => $v->voucher_number, 'type_name' => $v->type?->name, 'base_type' => $v->type?->base_type, 'date' => $v->date?->toDateString(),
            'customer' => $this->customerName($v), 'email' => $v->customer?->email, 'phone' => $v->party_phone ?: $v->customer?->phone,
            'whatsapp_to' => CompanyProfile::waDigits($v->party_phone ?: $v->customer?->phone),
            'total' => (float) $v->total_amount, 'currency' => $v->currency?->code, 'symbol' => $v->currency?->symbol, 'last_sent' => $last[$v->id] ?? null,
        ]);

        return response()->json($page);
    }

    /** What has been sent: when, by whom, to whom, and whether it went. */
    public function sent(Request $request): JsonResponse
    {
        try {
            $q = DocumentShare::with(['voucher:id,voucher_number,voucher_type_id', 'voucher.type:id,name', 'sender:id,name'])
                ->when($request->filled('channel'), fn ($w) => $w->where('channel', (string) $request->query('channel')))
                ->when($request->filled('status'), fn ($w) => $w->where('status', (string) $request->query('status')))
                ->when($request->filled('from'), fn ($w) => $w->whereDate('created_at', '>=', (string) $request->query('from')))
                ->when($request->filled('to'), fn ($w) => $w->whereDate('created_at', '<=', (string) $request->query('to')))
                ->when($request->filled('q'), function ($w) use ($request) {
                    $s = '%' . trim((string) $request->query('q')) . '%';
                    $w->where(fn ($x) => $x->where('to_address', 'like', $s)->orWhereHas('voucher', fn ($v) => $v->where('voucher_number', 'like', $s)));
                })
                ->orderByDesc('id');
            $page = $q->paginate(min((int) $request->query('per_page', 25), 100));
        } catch (\Throwable) {
            return response()->json(['data' => [], 'total' => 0, 'setup_needed' => true]);
        }
        $page->getCollection()->transform(fn ($s) => [
            'id' => $s->id, 'at' => $s->created_at?->toDateTimeString(), 'channel' => $s->channel, 'to' => $s->to_address, 'status' => $s->status, 'error' => $s->error, 'note' => $s->note,
            'voucher_id' => $s->voucher_id, 'voucher_number' => $s->voucher?->voucher_number, 'type_name' => $s->voucher?->type?->name, 'sent_by' => $s->sender?->name,
        ]);

        return response()->json($page);
    }

    /** E-mail the customer copy of each ticked document to its customer. One that cannot go does not stop the rest. */
    public function send(Request $request, VoucherShareService $share): JsonResponse
    {
        $d = $request->validate(['voucher_ids' => 'required|array|min:1|max:50', 'voucher_ids.*' => 'integer', 'note' => 'nullable|string|max:1000']);
        $results = [];
        foreach (Voucher::with('type')->whereIn('id', $d['voucher_ids'])->get() as $v) {
            try {
                $to = $share->email($v, null, $d['note'] ?? null, $request->user()?->id);
                $results[] = ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'ok' => true, 'to' => $to];
            } catch (BooksException $e) {
                $results[] = ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'ok' => false, 'error' => $e->getMessage()];
            } catch (\Throwable $e) {
                $results[] = ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'ok' => false, 'error' => 'The mail server refused it: ' . $e->getMessage()];
            }
        }
        $ok = count(array_filter($results, fn ($r) => $r['ok']));

        return response()->json(['message' => "{$ok} of " . count($results) . ' sent', 'results' => $results]);
    }

    /** The admin opened WhatsApp for a document: note it in the log (WhatsApp itself cannot tell us more). */
    public function whatsapp(Request $request, VoucherShareService $share, $id): JsonResponse
    {
        $d = $request->validate(['to' => 'nullable|string|max:60']);
        $v = Voucher::with('type')->findOrFail($id);
        $share->log($v, 'whatsapp', $d['to'] ?? null, 'opened', $request->user()?->id);

        return response()->json(['message' => 'Noted']);
    }
}
