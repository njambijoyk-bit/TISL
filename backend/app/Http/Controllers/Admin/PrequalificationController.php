<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extras\Prequalification;
use App\Models\Extras\PrequalificationDocument;
use App\Models\Extras\PrequalificationTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrequalificationController extends Controller
{
    // =========================================================================
    // TEMPLATES
    // =========================================================================

    public function templates(Request $request): JsonResponse
    {
        $rows = PrequalificationTemplate::query()
            ->when($request->boolean('active_only'), fn ($q) => $q->active())
            ->orderBy('name')
            ->get();

        return response()->json(['rows' => $rows]);
    }

    public function showTemplate(int $id): JsonResponse
    {
        return response()->json(PrequalificationTemplate::findOrFail($id));
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name'               => 'required|string|max:255',
            'category'           => 'required|in:goods,services,works',
            'description'        => 'nullable|string',
            'sections'           => 'nullable|array',
            'required_documents' => 'nullable|array',
            'validity_months'    => 'nullable|integer|min:1|max:120',
        ]);

        $tpl = PrequalificationTemplate::create(array_merge($d, [
            'created_by' => $request->user()->id,
        ]));

        return response()->json(['message' => 'Template created.', 'id' => $tpl->id], 201);
    }

    public function updateTemplate(Request $request, int $id): JsonResponse
    {
        $tpl = PrequalificationTemplate::findOrFail($id);

        $d = $request->validate([
            'name'               => 'sometimes|required|string|max:255',
            'category'           => 'sometimes|in:goods,services,works',
            'description'        => 'nullable|string',
            'sections'           => 'nullable|array',
            'required_documents' => 'nullable|array',
            'validity_months'    => 'nullable|integer|min:1|max:120',
            'is_active'          => 'sometimes|boolean',
        ]);

        $tpl->update($d);

        return response()->json(['message' => 'Template updated.']);
    }

    // =========================================================================
    // SUBMISSIONS (admin review)
    // =========================================================================

    public function submissions(Request $request): JsonResponse
    {
        $d = $request->validate([
            'status'    => 'nullable|string|max:30',
            'vendor_id' => 'nullable|integer',
        ]);

        $rows = Prequalification::with(['vendor', 'template'])
            ->when(! empty($d['status']), fn ($q) => $q->byStatus($d['status']))
            ->when(! empty($d['vendor_id']), fn ($q) => $q->forVendor($d['vendor_id']))
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return response()->json(['rows' => $rows]);
    }

    public function showSubmission(int $id): JsonResponse
    {
        $pq = Prequalification::with(['vendor', 'template', 'documents', 'reviewer'])->findOrFail($id);

        return response()->json($pq);
    }

    public function review(Request $request, int $id): JsonResponse
    {
        $pq = Prequalification::findOrFail($id);

        if (! in_array($pq->status, ['submitted', 'under_review'])) {
            return response()->json(['message' => 'This submission cannot be reviewed in its current state.'], 422);
        }

        $d = $request->validate([
            'status'               => 'required|in:under_review,qualified,rejected',
            'score'                => 'nullable|numeric|min:0|max:100',
            'review_notes'         => 'nullable|string',
            'rejection_reason'     => 'nullable|required_if:status,rejected|string',
            'categories_qualified' => 'nullable|array',
        ]);

        $extra = [
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ];

        if ($d['status'] === 'qualified') {
            $validity = $pq->template->validity_months ?? 12;
            $extra['qualified_at'] = now();
            $extra['expires_at']   = now()->addMonths($validity)->toDateString();
        }

        $pq->update(array_merge($d, $extra));

        return response()->json(['message' => 'Review saved.']);
    }

    public function verifyDocument(Request $request, int $pqId, int $docId): JsonResponse
    {
        $doc = PrequalificationDocument::where('prequalification_id', $pqId)->findOrFail($docId);

        $doc->update([
            'verified'    => true,
            'verified_by' => $request->user()->id,
            'verified_at' => now(),
        ]);

        return response()->json(['message' => 'Document verified.']);
    }
}
