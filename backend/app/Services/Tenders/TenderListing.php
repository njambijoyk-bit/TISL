<?php

namespace App\Services\Tenders;

use App\Models\CompanyProfile;
use App\Models\Extras\Tender;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * How a tender appears in a list (the public page and the vendor portal share it): the same rows, tabs and per-column filters.
 */
class TenderListing
{
    public const METHOD_LABELS = [
        'open_tender' => 'Open Tender', 'restricted_tender' => 'Restricted Tender', 'request_for_quotation' => 'Request for Quotation',
        'request_for_proposal' => 'Request for Proposal', 'expression_of_interest' => 'Expression of Interest',
        'direct_procurement' => 'Direct Procurement', 'framework_agreement' => 'Framework Agreement',
    ];

    public const GROUP_LABELS = ['youth' => 'Youth', 'women' => 'Women', 'pwd' => 'Persons with disabilities', 'sme' => 'SMEs'];

    public static function rules(): array
    {
        return [
            'tab'          => 'nullable|in:active,closed,agpo,terminated,restricted,all',
            'q'            => 'nullable|string|max:100',
            'description'  => 'nullable|string|max:100',
            'entity'       => 'nullable|string|max:100',
            'method'       => 'nullable|string|max:50',
            'category'     => 'nullable|string|max:30',
            'close_date'   => 'nullable|date',
            'publish_date' => 'nullable|date',
            'addendum'     => 'nullable|in:yes,no',
            'notice_type'  => 'nullable|in:' . implode(',', Tender::NOTICE_TYPES),
            'sort'         => 'nullable|in:close_date,publish_date,title',
            'dir'          => 'nullable|in:asc,desc',
            'page'         => 'nullable|integer|min:1',
            'per_page'     => 'nullable|integer|min:1|max:100',
        ];
    }

    /** Applies the tab, search and per-column filters to a query that already limits who may see what. */
    public function filter(Builder $q, array $d): Builder
    {
        $like = fn (string $v) => '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim($v)) . '%';

        $q->tab($d['tab'] ?? 'all');
        if (! empty($d['q'])) {
            $q->where(fn ($w) => $w->where('title', 'like', $like($d['q']))->orWhere('tender_number', 'like', $like($d['q']))
                ->orWhere('procuring_entity', 'like', $like($d['q']))->orWhere('ocid', 'like', $like($d['q'])));
        }
        if (! empty($d['description'])) {
            $q->where(fn ($w) => $w->where('title', 'like', $like($d['description']))->orWhere('description', 'like', $like($d['description'])));
        }
        if (! empty($d['entity'])) {
            $company = CompanyProfile::current()->name;
            $q->where(fn ($w) => $w->where('procuring_entity', 'like', $like($d['entity']))
                ->orWhere(fn ($n) => $n->whereNull('procuring_entity')->whereRaw('? like ?', [$company, $like($d['entity'])])));
        }
        if (! empty($d['method'])) {
            $codes = array_keys(array_filter(self::METHOD_LABELS, fn ($label, $code) => stripos($label, trim($d['method'])) !== false || $code === trim($d['method']), ARRAY_FILTER_USE_BOTH));
            $q->whereIn('procurement_method', $codes ?: ['-']);
        }
        if (! empty($d['category'])) {
            $q->where('category', 'like', $like($d['category']));
        }
        if (! empty($d['close_date'])) {
            $q->whereDate('submission_deadline', $d['close_date']);
        }
        if (! empty($d['publish_date'])) {
            $q->whereDate('published_at', $d['publish_date']);
        }
        if (! empty($d['notice_type'])) {
            $q->where('notice_type', $d['notice_type']);
        }
        if (($d['addendum'] ?? null) === 'yes') {
            $q->whereHas('addenda');
        } elseif (($d['addendum'] ?? null) === 'no') {
            $q->whereDoesntHave('addenda');
        }

        return $q;
    }

    public function sort(Builder $q, array $d): Builder
    {
        $dir = $d['dir'] ?? null;
        if (($d['sort'] ?? null) === 'title') {
            return $q->orderBy('title', $dir ?? 'asc');
        }
        if (($d['sort'] ?? null) === 'publish_date') {
            return $q->orderBy('published_at', $dir ?? 'desc');
        }
        // the default: soonest to close first on the Active tab, newest first elsewhere
        if (($d['sort'] ?? null) === 'close_date' || ($d['tab'] ?? 'all') === 'active') {
            return $q->orderBy('submission_deadline', $dir ?? 'asc');
        }

        return $q->orderByDesc('published_at')->orderByDesc('id');
    }

    /** The query plus what the list needs on each row. */
    public function withRowData(Builder $q): Builder
    {
        return $q->with('lots:id,tender_id,reservation_group')
            ->withCount('addenda as addendum_count');
    }

    public function row(Tender $t): array
    {
        $company = CompanyProfile::current()->name;

        return [
            'id'                  => $t->id,
            'slug'                => $t->slug,
            'tender_number'       => $t->tender_number,
            'title'               => $t->title,
            'notice_type'         => $t->notice_type,
            'procuring_entity'    => $t->procuring_entity ?: $company,
            'procurement_method'  => $t->procurement_method,
            'category'            => $t->category,
            'status'              => $t->displayStatus(),
            'visibility'          => $t->visibility,
            'published_at'        => $t->published_at,
            'submission_deadline' => $t->submission_deadline,
            'reservation_scheme'  => $t->reservation_scheme,
            'reservation_groups'  => $t->reservation_groups,
            'reserved_groups'     => $t->reservedGroups(),
            'addendum_count'      => (int) ($t->addendum_count ?? 0),
        ];
    }

    /** The full notice for the details page (the same for the public and for a vendor). */
    public function detail(Tender $t): array
    {
        $t->loadMissing(['lots', 'documents', 'addenda', 'awards']);

        return $this->row($t) + [
            'ocid'                  => $t->ocid,
            'description'           => $t->description,
            'submission_method'     => $t->submission_method,
            'has_preference_scheme' => (bool) $t->has_preference_scheme,
            'opening_venue'         => $t->opening_venue,
            'tender_fee'            => $t->tender_fee,
            'validity_days'         => $t->validity_days,
            'financial_year'        => $t->financial_year,
            'public_link'           => $t->public_link,
            'currency'              => $t->currency,
            'requirements'          => $t->requirements ?? [],
            'lots'                  => $t->lots->map(fn ($l) => ['code' => $l->code, 'title' => $l->title, 'description' => $l->description, 'reservation_group' => $l->reservation_group])->values(),
            'addenda'               => $t->addenda->map(fn ($a) => [
                'id' => $a->id, 'number' => $a->number, 'title' => $a->title, 'note' => $a->note,
                'previous_deadline' => $a->previous_deadline, 'new_deadline' => $a->new_deadline, 'created_at' => $a->created_at,
            ])->values(),
            'awards'                => ($t->status === 'awarded' && $t->show_award) ? $t->awards->map(fn ($w) => [
                'lot_code' => $w->lot_code, 'lot_title' => $w->lot_code ? $t->lots->firstWhere('code', $w->lot_code)?->title : null,
                'winner' => $w->winner_name, 'amount' => $w->amount, 'currency' => $w->currency, 'awarded_on' => $w->awarded_on?->toDateString(),
            ])->values() : [],
            'documents'             => $t->documents->map(fn ($d) => [
                'id'          => $d->id,
                'name'        => $d->name,
                'filename'    => $d->original_filename,
                'type'        => $d->document_type,
                'addendum_id' => $d->addendum_id,
                'extension'   => $d->extension,
                'size'        => $d->file_size,
                'uploaded_at' => $d->created_at,
                'viewable'    => in_array(strtolower((string) $d->extension), ['pdf', 'html', 'htm'], true),
            ])->values(),
        ];
    }

    /** Counts for the tabs, under whatever limits the caller put on the query (who may see what). */
    public function counts(callable $base): array
    {
        $out = [];
        foreach (['active', 'closed', 'agpo', 'terminated', 'restricted', 'all'] as $tab) {
            $out[$tab] = $base()->tab($tab)->count();
        }

        return $out;
    }

    /** The filtered list (same tab, search and column filters as the screen) as a spreadsheet. $base already limits who may see what. */
    public function spreadsheet(Builder $base, array $d): BinaryFileResponse
    {
        $d['tab'] = ($d['tab'] ?? 'active') === 'restricted' && ! ($d['allow_restricted'] ?? false) ? 'all' : ($d['tab'] ?? 'active');

        $rows = $this->withRowData($this->sort($this->filter($base, $d), $d))->limit(2000)->get()
            ->map(fn (Tender $t) => $this->row($t))
            ->map(fn ($r) => [
                $r['tender_number'], $r['title'], ucfirst(str_replace('_', ' ', (string) $r['notice_type'])), $r['procuring_entity'], self::METHOD_LABELS[$r['procurement_method']] ?? $r['procurement_method'], ucfirst((string) $r['category']),
                $r['published_at']?->format('Y-m-d'), $r['submission_deadline']?->format('Y-m-d H:i'), ucfirst($r['status']),
                collect($r['reserved_groups'])->map(fn ($g) => self::GROUP_LABELS[$g] ?? $g)->implode(', '), $r['addendum_count'] ?: 'None',
            ])->all();

        $export = new class($rows) implements FromArray, WithHeadings, ShouldAutoSize {
            public function __construct(private array $rows) {}

            public function array(): array
            {
                return $this->rows;
            }

            public function headings(): array
            {
                return ['Tender number', 'Description', 'Type', 'Procuring entity', 'Method', 'Category', 'Published', 'Closes', 'Status', 'Reserved for', 'Addenda'];
            }
        };

        return Excel::download($export, 'tenders.xlsx');
    }
}
