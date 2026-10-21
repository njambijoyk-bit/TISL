<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderDocument;
use App\Services\Tenders\TenderFile;
use App\Services\Tenders\TenderListing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public tender notices (Extras module, no sign-in): only tenders marked Public. Vendors-only, pre-qualified and invited tenders are never listed here.
 * Budgets, invitations and who created a tender are never shown.
 */
class PublicTenderController extends Controller
{
    public function __construct(private TenderListing $listing) {}

    private function base()
    {
        return Tender::publicNotice();
    }

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(TenderListing::rules());
        $d['tab'] = $d['tab'] ?? 'active';
        if ($d['tab'] === 'restricted') {
            $d['tab'] = 'all';   // restricted tenders are for signed-in vendors only
        }

        $q = $this->listing->withRowData($this->listing->sort($this->listing->filter($this->base(), $d), $d));
        $page = $q->paginate((int) ($d['per_page'] ?? 25));

        return response()->json([
            'rows'   => $page->getCollection()->map(fn (Tender $t) => $this->listing->row($t))->values(),
            'meta'   => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
            'counts' => collect($this->listing->counts(fn () => $this->base()))->except('restricted'),
            'show_entity' => $this->base()->whereNotNull('procuring_entity')->exists(),
        ]);
    }

    /** The filtered list as a spreadsheet. */
    public function export(Request $request): BinaryFileResponse
    {
        $d = $request->validate(TenderListing::rules());
        $d['tab'] = ($d['tab'] ?? 'active') === 'restricted' ? 'all' : ($d['tab'] ?? 'active');

        return $this->listing->spreadsheet($this->base(), $d);
    }

    public function show(string $ref): JsonResponse
    {
        $t = $this->listing->withRowData($this->base()->bySlug($ref))->firstOrFail();

        return response()->json($this->listing->detail($t));
    }

    /** Open (inline=1) or download one of a public tender's files. */
    public function download(Request $request, string $ref, int $docId): StreamedResponse
    {
        $t = $this->base()->bySlug($ref)->firstOrFail();
        $doc = TenderDocument::where('tender_id', $t->id)->findOrFail($docId);

        return TenderFile::response($doc, $request->boolean('inline'));
    }
}
