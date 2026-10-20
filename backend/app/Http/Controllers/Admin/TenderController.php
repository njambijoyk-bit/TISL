<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderBid;
use App\Models\Extras\TenderDocument;
use App\Models\Extras\TenderInvitation;
use App\Models\Vendor;
use App\Models\VendorOrder;
use App\Models\VendorOrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TenderController extends Controller
{
    // =========================================================================
    // TENDERS
    // =========================================================================

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate([
            'status'   => 'nullable|string|max:30',
            'category' => 'nullable|string|max:30',
            'search'   => 'nullable|string|max:80',
        ]);

        $rows = Tender::query()
            ->when(! empty($d['status']), fn ($q) => $q->byStatus($d['status']))
            ->when(! empty($d['category']), fn ($q) => $q->byCategory($d['category']))
            ->when(! empty($d['search']), fn ($q) => $q->where(fn ($w) =>
                $w->where('title', 'like', "%{$d['search']}%")
                  ->orWhere('tender_number', 'like', "%{$d['search']}%")))
            ->withCount('bids')
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return response()->json(['rows' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $tender = Tender::with(['documents', 'invitations.vendor', 'creator', 'approver', 'awardedVendor'])
            ->withCount('bids')
            ->findOrFail($id);

        return response()->json($tender);
    }

    private function noticeRules(): array
    {
        return [
            'ocid'                  => 'nullable|string|max:100',
            'procurement_method'    => 'nullable|in:' . implode(',', Tender::PROCUREMENT_METHODS),
            'submission_method'     => 'nullable|in:' . implode(',', Tender::SUBMISSION_METHODS),
            'reservation_scheme'    => 'nullable|string|max:100',
            'has_preference_scheme' => 'nullable|boolean',
            'opening_venue'         => 'nullable|string|max:255',
            'tender_fee'            => 'nullable|numeric|min:0',
            'validity_days'         => 'nullable|integer|min:1|max:1000',
            'financial_year'        => ['nullable', 'regex:/^\d{4}\/\d{4}$/'],
            'public_link'           => 'nullable|url|max:500',
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'title'               => 'required|string|max:255',
            'description'         => 'nullable|string',
            'category'            => 'required|in:goods,services,works',
            'branch_id'           => 'nullable|integer|exists:locations,id',
            'budget_min'          => 'nullable|numeric|min:0',
            'budget_max'          => 'nullable|numeric|min:0',
            'currency'            => 'nullable|string|size:3',
            'requirements'        => 'nullable|array',
            'evaluation_criteria' => 'nullable|array',
            'visibility'          => 'required|in:all_vendors,prequalified,invited',
            'submission_deadline' => 'nullable|date|after:now',
            'opening_date'        => 'nullable|date',
            'tender_number'       => 'nullable|string|max:60|unique:tenders,tender_number',
        ] + $this->noticeRules());

        $tender = Tender::create([
            'tender_number'       => $d['tender_number'] ?? Tender::generateTenderNumber(),
            'title'               => $d['title'],
            'description'         => $d['description'] ?? null,
            'category'            => $d['category'],
            'branch_id'           => $d['branch_id'] ?? null,
            'budget_min'          => $d['budget_min'] ?? null,
            'budget_max'          => $d['budget_max'] ?? null,
            'currency'            => $d['currency'] ?? 'KES',
            'requirements'        => $d['requirements'] ?? null,
            'evaluation_criteria' => $d['evaluation_criteria'] ?? null,
            'visibility'          => $d['visibility'],
            'submission_deadline' => $d['submission_deadline'] ?? null,
            'opening_date'        => $d['opening_date'] ?? null,
            ...collect($d)->only(Tender::NOTICE_FIELDS)->reject(fn ($v) => $v === null)->all(),
            'status'              => 'draft',
            'created_by'          => $request->user()->id,
        ]);

        return response()->json(['message' => "Tender {$tender->tender_number} created.", 'id' => $tender->id], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if (in_array($tender->status, ['awarded', 'cancelled'])) {
            return response()->json(['message' => 'Cannot edit an awarded or cancelled tender.'], 422);
        }

        $d = $request->validate([
            'title'               => 'sometimes|required|string|max:255',
            'description'         => 'nullable|string',
            'category'            => 'sometimes|in:goods,services,works',
            'branch_id'           => 'nullable|integer|exists:locations,id',
            'budget_min'          => 'nullable|numeric|min:0',
            'budget_max'          => 'nullable|numeric|min:0',
            'currency'            => 'nullable|string|size:3',
            'requirements'        => 'nullable|array',
            'evaluation_criteria' => 'nullable|array',
            'visibility'          => 'sometimes|in:all_vendors,prequalified,invited',
            'submission_deadline' => 'nullable|date',
            'opening_date'        => 'nullable|date',
        ] + $this->noticeRules());

        // these columns can't be NULL: leave them as they are when the form sends nothing
        foreach (['procurement_method', 'submission_method', 'has_preference_scheme', 'tender_fee'] as $k) {
            if (array_key_exists($k, $d) && $d[$k] === null) {
                unset($d[$k]);
            }
        }

        $tender->update($d);

        return response()->json(['message' => 'Tender updated.']);
    }

    public function publish(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status !== 'draft') {
            return response()->json(['message' => 'Only a draft tender can be published.'], 422);
        }
        if (! $tender->submission_deadline) {
            return response()->json(['message' => 'Set a submission deadline before publishing.'], 422);
        }

        $tender->update([
            'status'       => 'published',
            'published_at' => now(),
            'approved_by'  => $request->user()->id,
        ]);

        return response()->json(['message' => 'Tender published.']);
    }

    public function close(int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status !== 'published') {
            return response()->json(['message' => 'Only a published tender can be closed.'], 422);
        }

        $tender->update(['status' => 'closed']);

        return response()->json(['message' => 'Tender closed for submissions.']);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status === 'cancelled') {
            return response()->json(['message' => 'Already cancelled.'], 422);
        }

        $tender->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Tender cancelled.']);
    }

    // =========================================================================
    // TENDER DOCUMENTS (admin upload)
    // =========================================================================

    public function uploadDocument(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);

        $request->validate([
            'file'          => 'required|file|max:20480',
            'document_type' => 'nullable|in:specification,terms,boq,drawing,other',
        ]);

        $file = $request->file('file');
        $path = $file->store("tenders/{$tender->id}", 'local');

        $doc = TenderDocument::create([
            'tender_id'         => $tender->id,
            'name'              => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_filename' => $file->getClientOriginalName(),
            'mime_type'         => $file->getMimeType(),
            'extension'         => $file->getClientOriginalExtension(),
            'file_path'         => $path,
            'file_size'         => $file->getSize(),
            'document_type'     => $request->input('document_type', 'other'),
            'uploaded_by'       => $request->user()->id,
        ]);

        return response()->json(['message' => 'Document uploaded.', 'id' => $doc->id], 201);
    }

    public function deleteDocument(int $tenderId, int $docId): JsonResponse
    {
        $doc = TenderDocument::where('tender_id', $tenderId)->findOrFail($docId);
        Storage::disk('local')->delete($doc->file_path);
        $doc->delete();

        return response()->json(['message' => 'Document removed.']);
    }

    // =========================================================================
    // INVITATIONS
    // =========================================================================

    public function invite(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        $d = $request->validate(['vendor_ids' => 'required|array', 'vendor_ids.*' => 'integer|exists:vendors,id']);

        $created = 0;
        foreach ($d['vendor_ids'] as $vid) {
            TenderInvitation::firstOrCreate(
                ['tender_id' => $tender->id, 'vendor_id' => $vid],
                ['invited_by' => $request->user()->id]
            );
            $created++;
        }

        return response()->json(['message' => "{$created} vendor(s) invited."]);
    }

    // =========================================================================
    // BID EVALUATION (admin side)
    // =========================================================================

    public function bids(int $tenderId): JsonResponse
    {
        $bids = TenderBid::with(['vendor', 'items'])
            ->where('tender_id', $tenderId)
            ->whereIn('status', ['submitted', 'under_review', 'shortlisted', 'awarded', 'rejected'])
            ->orderByDesc('submitted_at')
            ->get();

        return response()->json(['rows' => $bids]);
    }

    public function evaluateBid(Request $request, int $tenderId, int $bidId): JsonResponse
    {
        $bid = TenderBid::where('tender_id', $tenderId)->findOrFail($bidId);

        $d = $request->validate([
            'evaluation_score' => 'nullable|numeric|min:0|max:100',
            'evaluation_notes' => 'nullable|string',
            'status'           => 'required|in:under_review,shortlisted,rejected',
        ]);

        $bid->update($d);

        return response()->json(['message' => 'Bid evaluation saved.']);
    }

    public function awardBid(Request $request, int $tenderId, int $bidId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        $bid = TenderBid::where('tender_id', $tenderId)->findOrFail($bidId);

        return DB::transaction(function () use ($tender, $bid, $request) {
            $bid->update(['status' => 'awarded']);

            TenderBid::where('tender_id', $tender->id)
                ->where('id', '!=', $bid->id)
                ->whereNotIn('status', ['withdrawn', 'rejected'])
                ->update(['status' => 'rejected']);

            $tender->update([
                'status'            => 'awarded',
                'awarded_vendor_id' => $bid->vendor_id,
                'awarded_at'        => now(),
            ]);

            $vo = VendorOrder::create([
                'po_number'  => VendorOrder::generateVoNumber(),
                'vendor_id'  => $bid->vendor_id,
                'raised_by'  => $request->user()->id,
                'status'     => 'draft',
                'currency'   => $bid->currency,
                'subtotal'   => $bid->total_amount,
                'tax'        => 0,
                'shipping_cost' => 0,
                'total'      => $bid->total_amount,
                'tender_bid_id' => $bid->id,
            ]);

            foreach ($bid->items as $item) {
                VendorOrderItem::create([
                    'vendor_order_id' => $vo->id,
                    'product_name'    => $item->description,
                    'quantity'        => $item->quantity,
                    'unit_cost'       => $item->unit_price,
                    'line_total'      => $item->line_total,
                ]);
            }

            return response()->json([
                'message'         => "Bid awarded. Vendor order {$vo->po_number} created.",
                'vendor_order_id' => $vo->id,
            ]);
        });
    }
}
