<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\Prequalification;
use App\Models\Extras\PrequalificationDocument;
use App\Models\Extras\PrequalificationTemplate;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderBid;
use App\Models\Extras\TenderBidDocument;
use App\Models\Extras\TenderBidItem;
use App\Models\Vendor;
use App\Models\VendorOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VendorPortalController extends Controller
{
    // =========================================================================
    // DASHBOARD
    // =========================================================================

    public function dashboard(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $openTenders = Tender::published()
            ->where('submission_deadline', '>', now())
            ->visibleTo($vendor)
            ->count();

        $myBids      = $vendor->tenderBids()->count();
        $activePqs   = $vendor->prequalifications()->qualified()->count();
        $orders      = $vendor->vendorOrders()->count();

        return response()->json([
            'vendor'        => $vendor->only(['id', 'vendor_number', 'company_name', 'status', 'is_verified']),
            'open_tenders'  => $openTenders,
            'my_bids'       => $myBids,
            'active_pqs'    => $activePqs,
            'vendor_orders' => $orders,
        ]);
    }

    // =========================================================================
    // TENDERS (vendor side)
    // =========================================================================

    public function tenders(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $rows = Tender::published()
            ->where('submission_deadline', '>', now())
            ->visibleTo($vendor)
            ->orderByDesc('published_at')
            ->limit(100)
            ->get(['id', 'tender_number', 'title', 'category', 'currency', 'budget_min', 'budget_max', 'submission_deadline', 'visibility']);

        return response()->json(['rows' => $rows]);
    }

    public function showTender(Request $request, int $id): JsonResponse
    {
        $vendor = $this->vendor($request);
        $tender = Tender::with('documents')->visibleTo($vendor)->published()->findOrFail($id);
        $myBid  = TenderBid::where('tender_id', $id)->where('vendor_id', $vendor->id)->first();

        return response()->json([
            'tender' => $tender,
            'my_bid' => $myBid,
        ]);
    }

    // =========================================================================
    // BIDS
    // =========================================================================

    public function storeBid(Request $request, int $tenderId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $tender = Tender::visibleTo($vendor)->findOrFail($tenderId);

        if (! $tender->isOpen()) {
            return response()->json(['message' => 'This tender is no longer accepting bids.'], 422);
        }

        $existing = TenderBid::where('tender_id', $tenderId)->where('vendor_id', $vendor->id)->first();
        if ($existing) {
            return response()->json(['message' => 'You have already submitted a bid for this tender.'], 422);
        }

        $d = $request->validate([
            'cover_letter'          => 'nullable|string',
            'technical_proposal'    => 'nullable|string',
            'delivery_timeline_days' => 'nullable|integer|min:1',
            'items'                 => 'required|array|min:1',
            'items.*.description'   => 'required|string|max:500',
            'items.*.quantity'      => 'required|numeric|min:0.0001',
            'items.*.unit_price'    => 'required|numeric|min:0',
        ]);

        return DB::transaction(function () use ($d, $tender, $vendor) {
            $bid = TenderBid::create([
                'tender_id'             => $tender->id,
                'vendor_id'             => $vendor->id,
                'bid_number'            => TenderBid::generateBidNumber(),
                'currency'              => $tender->currency,
                'cover_letter'          => $d['cover_letter'] ?? null,
                'technical_proposal'    => $d['technical_proposal'] ?? null,
                'delivery_timeline_days' => $d['delivery_timeline_days'] ?? null,
                'status'                => 'draft',
            ]);

            $total = 0;
            foreach ($d['items'] as $item) {
                $lineTotal = round($item['quantity'] * $item['unit_price'], 2);
                TenderBidItem::create([
                    'tender_bid_id' => $bid->id,
                    'description'   => $item['description'],
                    'quantity'      => $item['quantity'],
                    'unit_price'    => $item['unit_price'],
                    'line_total'    => $lineTotal,
                ]);
                $total += $lineTotal;
            }

            $bid->update(['total_amount' => $total]);

            return response()->json(['message' => "Bid {$bid->bid_number} created as draft.", 'id' => $bid->id], 201);
        });
    }

    public function submitBid(Request $request, int $bidId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $bid = TenderBid::where('vendor_id', $vendor->id)->findOrFail($bidId);

        if ($bid->status !== 'draft') {
            return response()->json(['message' => 'This bid has already been submitted.'], 422);
        }

        $tender = Tender::findOrFail($bid->tender_id);
        if (! $tender->isOpen()) {
            return response()->json(['message' => 'The submission deadline has passed.'], 422);
        }

        $bid->update(['status' => 'submitted', 'submitted_at' => now()]);

        return response()->json(['message' => 'Bid submitted.']);
    }

    public function withdrawBid(Request $request, int $bidId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $bid = TenderBid::where('vendor_id', $vendor->id)->findOrFail($bidId);

        if (! in_array($bid->status, ['draft', 'submitted'])) {
            return response()->json(['message' => 'This bid cannot be withdrawn.'], 422);
        }

        $bid->update(['status' => 'withdrawn']);

        return response()->json(['message' => 'Bid withdrawn.']);
    }

    public function uploadBidDocument(Request $request, int $bidId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $bid = TenderBid::where('vendor_id', $vendor->id)->findOrFail($bidId);

        $request->validate([
            'file'          => 'required|file|max:20480',
            'document_type' => 'nullable|in:proposal,certificate,reference,sample,other',
        ]);

        $file = $request->file('file');
        $path = $file->store("tender-bids/{$bid->id}", 'local');

        $doc = TenderBidDocument::create([
            'tender_bid_id'     => $bid->id,
            'name'              => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_filename' => $file->getClientOriginalName(),
            'mime_type'         => $file->getMimeType(),
            'extension'         => $file->getClientOriginalExtension(),
            'file_path'         => $path,
            'file_size'         => $file->getSize(),
            'document_type'     => $request->input('document_type', 'other'),
        ]);

        return response()->json(['message' => 'Document uploaded.', 'id' => $doc->id], 201);
    }

    public function myBids(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $bids = TenderBid::with('tender:id,tender_number,title,category,submission_deadline')
            ->where('vendor_id', $vendor->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json(['rows' => $bids]);
    }

    // =========================================================================
    // PRE-QUALIFICATION (vendor side)
    // =========================================================================

    public function pqTemplates(): JsonResponse
    {
        $rows = PrequalificationTemplate::active()->orderBy('name')->get(['id', 'name', 'category', 'description', 'required_documents', 'validity_months']);

        return response()->json(['rows' => $rows]);
    }

    public function showPqTemplate(int $id): JsonResponse
    {
        return response()->json(PrequalificationTemplate::active()->findOrFail($id));
    }

    public function storePq(Request $request, int $templateId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $template = PrequalificationTemplate::active()->findOrFail($templateId);

        $existing = Prequalification::where('template_id', $templateId)
            ->where('vendor_id', $vendor->id)
            ->whereNotIn('status', ['rejected', 'expired'])
            ->first();

        if ($existing) {
            return response()->json(['message' => 'You already have an active or pending submission for this template.'], 422);
        }

        $d = $request->validate(['responses' => 'nullable|array']);

        $pq = Prequalification::create([
            'template_id' => $template->id,
            'vendor_id'   => $vendor->id,
            'pq_number'   => Prequalification::generatePqNumber(),
            'responses'   => $d['responses'] ?? null,
            'status'      => 'draft',
        ]);

        return response()->json(['message' => "Pre-qualification {$pq->pq_number} started.", 'id' => $pq->id], 201);
    }

    public function updatePq(Request $request, int $id): JsonResponse
    {
        $vendor = $this->vendor($request);
        $pq = Prequalification::where('vendor_id', $vendor->id)->findOrFail($id);

        if ($pq->status !== 'draft') {
            return response()->json(['message' => 'This submission can no longer be edited.'], 422);
        }

        $d = $request->validate(['responses' => 'nullable|array']);
        $pq->update($d);

        return response()->json(['message' => 'Saved.']);
    }

    public function submitPq(Request $request, int $id): JsonResponse
    {
        $vendor = $this->vendor($request);
        $pq = Prequalification::where('vendor_id', $vendor->id)->findOrFail($id);

        if ($pq->status !== 'draft') {
            return response()->json(['message' => 'Already submitted.'], 422);
        }

        $pq->update(['status' => 'submitted', 'submitted_at' => now()]);

        return response()->json(['message' => 'Pre-qualification submitted for review.']);
    }

    public function uploadPqDocument(Request $request, int $pqId): JsonResponse
    {
        $vendor = $this->vendor($request);
        $pq = Prequalification::where('vendor_id', $vendor->id)->findOrFail($pqId);

        $request->validate([
            'file'          => 'required|file|max:20480',
            'document_type' => 'required|in:tax_compliance,registration,insurance,financial_statement,reference_letter,bank_reference,past_work,other',
        ]);

        $file = $request->file('file');
        $path = $file->store("prequalifications/{$pq->id}", 'local');

        $doc = PrequalificationDocument::create([
            'prequalification_id' => $pq->id,
            'document_type'       => $request->input('document_type'),
            'original_filename'   => $file->getClientOriginalName(),
            'disk'                => 'local',
            'path'                => $path,
            'mime_type'           => $file->getMimeType(),
            'size_bytes'          => $file->getSize(),
        ]);

        return response()->json(['message' => 'Document uploaded.', 'id' => $doc->id], 201);
    }

    public function myPqs(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $rows = Prequalification::with('template:id,name,category')
            ->where('vendor_id', $vendor->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['rows' => $rows]);
    }

    // =========================================================================
    // VENDOR ORDERS (vendor side — read-only)
    // =========================================================================

    public function orders(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $rows = VendorOrder::where('vendor_id', $vendor->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get(['id', 'po_number', 'status', 'currency', 'total', 'expected_delivery_date', 'created_at']);

        return response()->json(['rows' => $rows]);
    }

    public function showOrder(Request $request, int $id): JsonResponse
    {
        $vendor = $this->vendor($request);

        $order = VendorOrder::with('items')
            ->where('vendor_id', $vendor->id)
            ->findOrFail($id);

        return response()->json($order);
    }

    // =========================================================================
    // PROFILE
    // =========================================================================

    public function profile(Request $request): JsonResponse
    {
        return response()->json($this->vendor($request));
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $vendor = $this->vendor($request);

        $d = $request->validate([
            'contact_name'    => 'sometimes|string|max:255',
            'phone'           => 'sometimes|string|max:50',
            'alternate_phone' => 'nullable|string|max:50',
            'website'         => 'nullable|url|max:255',
            'address'         => 'nullable|string',
            'city'            => 'nullable|string|max:100',
            'country'         => 'nullable|string|max:100',
            'bank_details'    => 'nullable|array',
        ]);

        $vendor->update($d);

        return response()->json(['message' => 'Profile updated.']);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private function vendor(Request $request): Vendor
    {
        $user = $request->user();
        $vendor = Vendor::where('user_id', $user->id)->firstOrFail();
        abort_if($vendor->status === 'suspended', 403, 'Your vendor account is suspended. Please contact us.');

        return $vendor;
    }
}
