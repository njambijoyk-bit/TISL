<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public tender notices (Extras module, no login): what a procuring entity publishes for anyone to read.
 * Budgets, invitations, bids and who created the tender are never shown here.
 */
class PublicTenderController extends Controller
{
    private const LIST_COLUMNS = [
        'id', 'tender_number', 'title', 'category', 'procurement_method', 'status',
        'published_at', 'submission_deadline', 'reservation_scheme', 'tender_fee',
    ];

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate([
            'search'   => 'nullable|string|max:80',
            'category' => 'nullable|in:goods,services,works',
            'method'   => 'nullable|in:' . implode(',', Tender::PROCUREMENT_METHODS),
            'state'    => 'nullable|in:open,closed',
        ]);

        $rows = Tender::publicNotice()
            ->when(! empty($d['category']), fn ($q) => $q->where('category', $d['category']))
            ->when(! empty($d['method']), fn ($q) => $q->where('procurement_method', $d['method']))
            ->when(($d['state'] ?? null) === 'open', fn ($q) => $q->open())
            ->when(($d['state'] ?? null) === 'closed', fn ($q) => $q->where(fn ($w) => $w->where('status', '!=', 'published')->orWhere('submission_deadline', '<=', now())))
            ->when(! empty($d['search']), fn ($q) => $q->where(fn ($w) => $w
                ->where('title', 'like', "%{$d['search']}%")
                ->orWhere('tender_number', 'like', "%{$d['search']}%")))
            ->orderByDesc('published_at')
            ->limit(200)
            ->get(self::LIST_COLUMNS)
            ->map(fn (Tender $t) => $t->toArray() + ['is_open' => $this->isOpen($t)]);

        return response()->json(['rows' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $t = Tender::publicNotice()->with('documents')->findOrFail($id);

        return response()->json([
            ...$t->only([
                'id', 'ocid', 'tender_number', 'title', 'description', 'category', 'procurement_method', 'submission_method',
                'reservation_scheme', 'has_preference_scheme', 'opening_venue', 'published_at', 'submission_deadline',
                'tender_fee', 'validity_days', 'financial_year', 'public_link', 'status', 'currency',
                'requirements', 'evaluation_criteria',
            ]),
            'is_open'   => $this->isOpen($t),
            'documents' => $t->documents->map(fn (TenderDocument $doc) => [
                'id'            => $doc->id,
                'name'          => $doc->name,
                'filename'      => $doc->original_filename,
                'document_type' => $doc->document_type,
                'size'          => $doc->file_size,
                'uploaded_at'   => $doc->created_at,
            ])->values(),
        ]);
    }

    public function download(int $id, int $docId): StreamedResponse
    {
        $t = Tender::publicNotice()->findOrFail($id);
        $doc = TenderDocument::where('tender_id', $t->id)->findOrFail($docId);

        abort_unless(Storage::disk('local')->exists($doc->file_path), 404);

        return Storage::disk('local')->download($doc->file_path, $doc->original_filename);
    }

    private function isOpen(Tender $t): bool
    {
        return $t->status === 'published' && $t->submission_deadline && $t->submission_deadline->isFuture();
    }
}
