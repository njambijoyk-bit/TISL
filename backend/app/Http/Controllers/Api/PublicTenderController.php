<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderDocument;
use App\Services\Tenders\TenderFile;
use App\Services\Tenders\TenderListing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Facades\Excel;
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

        $rows = $this->listing->withRowData($this->listing->sort($this->listing->filter($this->base(), $d), $d))->limit(2000)->get()
            ->map(fn (Tender $t) => $this->listing->row($t))
            ->map(fn ($r) => [
                $r['tender_number'], $r['title'], $r['procuring_entity'], TenderListing::METHOD_LABELS[$r['procurement_method']] ?? $r['procurement_method'], ucfirst((string) $r['category']),
                $r['published_at']?->format('Y-m-d'), $r['submission_deadline']?->format('Y-m-d H:i'), ucfirst($r['status']),
                collect($r['reserved_groups'])->map(fn ($g) => TenderListing::GROUP_LABELS[$g] ?? $g)->implode(', '), $r['addendum_count'] ?: 'None',
            ])->all();

        $export = new class($rows) implements FromArray, WithHeadings, ShouldAutoSize {
            public function __construct(private array $rows) {}

            public function array(): array
            {
                return $this->rows;
            }

            public function headings(): array
            {
                return ['Tender number', 'Description', 'Procuring entity', 'Method', 'Category', 'Published', 'Closes', 'Status', 'Reserved for', 'Addenda'];
            }
        };

        return Excel::download($export, 'tenders.xlsx');
    }

    public function show(int $id): JsonResponse
    {
        $t = $this->listing->withRowData($this->base())->findOrFail($id);

        return response()->json($this->listing->detail($t));
    }

    /** Open (inline=1) or download one of a public tender's files. */
    public function download(Request $request, int $id, int $docId): StreamedResponse
    {
        $t = $this->base()->findOrFail($id);
        $doc = TenderDocument::where('tender_id', $t->id)->findOrFail($docId);

        return TenderFile::response($doc, $request->boolean('inline'));
    }
}
