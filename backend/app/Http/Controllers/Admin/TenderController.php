<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Extras\Tender;
use App\Models\Extras\TenderAddendum;
use App\Models\Extras\TenderDocument;
use App\Models\Extras\TenderInvitation;
use App\Models\Vendor;
use App\Services\Tenders\TenderFile;
use App\Services\Tenders\TenderNotices;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

/**
 * Tenders and pre-qualification calls on the website (Extras): staff enter the notice details and upload the documents; the website shows them to the right people.
 * Bids, evaluation and awards happen offline.
 */
class TenderController extends Controller
{
    public function __construct(private TenderNotices $notices) {}

    // =========================================================================
    // TENDERS
    // =========================================================================

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate([
            'status'     => 'nullable|string|max:30',
            'category'   => 'nullable|string|max:30',
            'visibility' => 'nullable|in:' . implode(',', Tender::VISIBILITIES),
            'notice_type' => 'nullable|in:' . implode(',', Tender::NOTICE_TYPES),
            'search'     => 'nullable|string|max:80',
        ]);

        $rows = Tender::query()
            ->when(! empty($d['status']), fn ($q) => $q->byStatus($d['status']))
            ->when(! empty($d['category']), fn ($q) => $q->byCategory($d['category']))
            ->when(! empty($d['visibility']), fn ($q) => $q->where('visibility', $d['visibility']))
            ->when(! empty($d['notice_type']), fn ($q) => $q->where('notice_type', $d['notice_type']))
            ->when(! empty($d['search']), fn ($q) => $q->where(fn ($w) =>
                $w->where('title', 'like', "%{$d['search']}%")
                  ->orWhere('tender_number', 'like', "%{$d['search']}%")))
            ->withCount(['documents', 'lots'])
            ->orderByDesc('created_at')
            ->limit(300)
            ->get()
            ->each(fn (Tender $t) => $t->setAttribute('display_status', $t->displayStatus()));

        return response()->json(['rows' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $tender = Tender::with(['documents.uploader:id,name', 'lots', 'addenda', 'awards', 'invitations.vendor:id,company_name,vendor_number,special_group', 'mailings.sender:id,name', 'creator:id,name'])
            ->findOrFail($id);
        $tender->setAttribute('display_status', $tender->displayStatus());

        return response()->json($tender);
    }

    private function noticeRules(): array
    {
        return [
            'ocid'                  => 'nullable|string|max:100',
            'procurement_method'    => 'nullable|in:' . implode(',', Tender::PROCUREMENT_METHODS),
            'submission_method'     => 'nullable|in:' . implode(',', Tender::SUBMISSION_METHODS),
            'reservation_scheme'    => 'nullable|in:' . implode(',', Tender::RESERVATION_GROUPS),
            'has_preference_scheme' => 'nullable|boolean',
            'opening_venue'         => 'nullable|string|max:255',
            'tender_fee'            => 'nullable|numeric|min:0',
            'validity_days'         => 'nullable|integer|min:1|max:1000',
            'financial_year'        => ['nullable', 'regex:/^\d{4}\/\d{4}$/'],
            'public_link'           => 'nullable|url|max:500',
            'notice_type'           => 'nullable|in:' . implode(',', Tender::NOTICE_TYPES),
            'procuring_entity'      => 'nullable|string|max:255',
            'lots'                  => 'nullable|array|max:50',
            'lots.*.code'           => 'required|string|max:10',
            'lots.*.title'          => 'required|string|max:255',
            'lots.*.description'    => 'nullable|string',
            'lots.*.reservation_group' => 'nullable|in:' . implode(',', Tender::RESERVATION_GROUPS),
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
            'visibility'          => 'required|in:' . implode(',', Tender::VISIBILITIES),
            'submission_deadline' => 'required|date',
            'opening_date'        => 'nullable|date',
            'tender_number'       => ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9][A-Za-z0-9\/._-]*$/', 'unique:tenders,tender_number'],
        ] + $this->noticeRules());

        $this->guardLots($d['lots'] ?? []);
        if (Tender::withTrashed()->bySlug(Tender::slugFor($d['tender_number']))->exists()) {
            throw ValidationException::withMessages(['tender_number' => 'Another tender already has this number (slashes and dashes count as the same).']);
        }

        $tender = DB::transaction(function () use ($d, $request) {
            $tender = Tender::create([
                'tender_number'       => $d['tender_number'],
                'title'               => $d['title'],
                'description'         => $d['description'] ?? null,
                'category'            => $d['category'],
                'branch_id'           => $d['branch_id'] ?? null,
                'budget_min'          => $d['budget_min'] ?? null,
                'budget_max'          => $d['budget_max'] ?? null,
                'currency'            => $d['currency'] ?? 'KES',
                'requirements'        => $d['requirements'] ?? null,
                'visibility'          => $d['visibility'],
                'submission_deadline' => $d['submission_deadline'],
                'opening_date'        => $d['opening_date'] ?? null,
                'notice_type'         => $d['notice_type'] ?? 'tender',
                'procuring_entity'    => $d['procuring_entity'] ?? null,
                ...collect($d)->only(Tender::NOTICE_FIELDS)->reject(fn ($v) => $v === null)->all(),
                'status'              => 'draft',
                'created_by'          => $request->user()->id,
            ]);
            $this->syncLots($tender, $d['lots'] ?? []);

            return $tender;
        });

        return response()->json(['message' => "Tender {$tender->tender_number} created.", 'id' => $tender->id], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        $d = $request->validate([
            'title'               => 'sometimes|required|string|max:255',
            'description'         => 'nullable|string',
            'category'            => 'sometimes|in:goods,services,works',
            'branch_id'           => 'nullable|integer|exists:locations,id',
            'budget_min'          => 'nullable|numeric|min:0',
            'budget_max'          => 'nullable|numeric|min:0',
            'currency'            => 'nullable|string|size:3',
            'requirements'        => 'nullable|array',
            'visibility'          => 'sometimes|in:' . implode(',', Tender::VISIBILITIES),
            'submission_deadline' => 'sometimes|required|date',
            'opening_date'        => 'nullable|date',
        ] + $this->noticeRules());

        $this->guardLots($d['lots'] ?? []);

        // these columns can't be NULL: leave them as they are when the form sends nothing
        foreach (['procurement_method', 'submission_method', 'has_preference_scheme', 'tender_fee', 'notice_type'] as $k) {
            if (array_key_exists($k, $d) && $d[$k] === null) {
                unset($d[$k]);
            }
        }

        DB::transaction(function () use ($tender, $d) {
            $tender->update(collect($d)->except('lots')->all());
            if (array_key_exists('lots', $d)) {
                $this->syncLots($tender, $d['lots'] ?? []);
            }
        });

        return response()->json(['message' => 'Tender updated.']);
    }

    /** Lot codes are unique within a tender. */
    private function guardLots(array $lots): void
    {
        $codes = array_map(fn ($l) => strtoupper(trim((string) $l['code'])), $lots);
        if (count($codes) !== count(array_unique($codes))) {
            throw ValidationException::withMessages(['lots' => 'Each lot needs its own code (A, B, C...).']);
        }
    }

    private function syncLots(Tender $tender, array $lots): void
    {
        $keep = [];
        foreach (array_values($lots) as $i => $l) {
            $code = strtoupper(trim((string) $l['code']));
            $keep[] = $code;
            $tender->lots()->updateOrCreate(['code' => $code], [
                'title'             => $l['title'],
                'description'       => $l['description'] ?? null,
                'reservation_group' => $l['reservation_group'] ?? null,
                'sort_order'        => $i,
            ]);
        }
        $tender->lots()->whereNotIn('code', $keep ?: [''])->delete();
    }

    public function publish(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status !== 'draft') {
            return response()->json(['message' => 'Only a draft tender can be published.'], 422);
        }
        if (! $tender->submission_deadline) {
            return response()->json(['message' => 'Set a closing date and time before publishing.'], 422);
        }

        $tender->update([
            'status'       => 'published',
            'published_at' => now(),
            'approved_by'  => $request->user()->id,
        ]);

        $told = $request->boolean('notify') ? $this->notices->send($tender, 'notice', null, $request->user()) : null;

        return response()->json(['message' => 'Tender published.' . ($told !== null ? " {$told} vendor(s) were told." : ''), 'notified' => $told]);
    }

    /** Put a closed or terminated tender back on the board with a new closing date. */
    public function reopen(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);
        $d = $request->validate(['submission_deadline' => 'required|date|after:now']);

        if (! in_array($tender->status, ['closed', 'cancelled'], true)) {
            return response()->json(['message' => 'Only a closed or terminated tender can be reopened.'], 422);
        }
        $tender->update(['status' => 'published', 'submission_deadline' => $d['submission_deadline']]);

        return response()->json(['message' => 'Tender reopened.']);
    }

    public function close(int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status !== 'published') {
            return response()->json(['message' => 'Only a published tender can be closed.'], 422);
        }

        $tender->update(['status' => 'closed']);

        return response()->json(['message' => 'Tender closed.']);
    }

    /** Terminated: withdrawn before an award. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $tender = Tender::findOrFail($id);

        if ($tender->status === 'cancelled') {
            return response()->json(['message' => 'Already terminated.'], 422);
        }

        $tender->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Tender terminated.']);
    }

    // =========================================================================
    // DOCUMENTS (the tender document, notice, advertisement, addenda...)
    // =========================================================================

    public function uploadDocument(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);

        $request->validate([
            'file'          => 'required|file|max:51200|extensions:' . implode(',', TenderFile::allowedExtensions()),
            'document_type' => 'nullable|in:' . implode(',', array_diff(Tender::DOCUMENT_TYPES, ['addendum'])),
            'name'          => 'nullable|string|max:255',
            'notify'        => 'nullable|boolean',
            'note'          => 'nullable|string|max:255',
        ]);

        $type = $request->input('document_type', 'other');
        $doc = $this->storeFile($tender, $request->file('file'), $type, $request->input('name'), $request->user()->id);

        $told = null;
        if ($request->boolean('notify') && $tender->status === 'published') {
            $told = $this->notices->send($tender, $type === 'addendum' ? 'addendum' : 'notice', $request->input('note'), $request->user());
        }

        return response()->json(['message' => 'Document uploaded.' . ($told !== null ? " {$told} vendor(s) were told." : ''), 'id' => $doc->id, 'notified' => $told], 201);
    }

    private function storeFile(Tender $tender, $file, string $type, ?string $name, int $userId, ?int $addendumId = null): TenderDocument
    {
        return TenderDocument::create([
            'tender_id'         => $tender->id,
            'addendum_id'       => $addendumId,
            'name'              => trim((string) $name) ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'original_filename' => $file->getClientOriginalName(),
            'mime_type'         => $file->getMimeType(),
            'extension'         => strtolower($file->getClientOriginalExtension()),
            'file_path'         => $file->store("tenders/{$tender->id}", 'local'),
            'file_size'         => $file->getSize(),
            'document_type'     => $type,
            'uploaded_by'       => $userId,
        ]);
    }

    public function updateDocument(Request $request, int $tenderId, int $docId): JsonResponse
    {
        $doc = TenderDocument::where('tender_id', $tenderId)->findOrFail($docId);
        $d = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'document_type' => 'sometimes|in:' . implode(',', array_diff(Tender::DOCUMENT_TYPES, ['addendum'])),
        ]);
        $doc->update($d);

        return response()->json(['message' => 'Document updated.']);
    }

    public function deleteDocument(int $tenderId, int $docId): JsonResponse
    {
        $doc = TenderDocument::where('tender_id', $tenderId)->findOrFail($docId);
        Storage::disk('local')->delete($doc->file_path);
        $doc->delete();

        return response()->json(['message' => 'Document removed.']);
    }

    // =========================================================================
    // ADDENDA
    // =========================================================================

    /** Body: title, note?, new_deadline? (moves the closing date), files[]?, notify?. Numbers itself: Addendum 1, 2... */
    public function addAddendum(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        if ($tender->status === 'draft') {
            return response()->json(['message' => 'Publish the tender first: an addendum changes a published tender. Until then, just edit it.'], 422);
        }
        $d = $request->validate([
            'title'        => 'required|string|max:255',
            'note'         => 'nullable|string|max:5000',
            'new_deadline' => 'nullable|date|after:now',
            'files'        => 'nullable|array|max:10',
            'files.*'      => 'file|max:51200|extensions:' . implode(',', TenderFile::allowedExtensions()),
            'notify'       => 'nullable|boolean',
        ]);

        $addendum = DB::transaction(function () use ($tender, $d, $request) {
            $a = TenderAddendum::create([
                'tender_id' => $tender->id, 'number' => (int) TenderAddendum::where('tender_id', $tender->id)->max('number') + 1,
                'title' => $d['title'], 'note' => $d['note'] ?? null, 'created_by' => $request->user()->id,
                'previous_deadline' => ! empty($d['new_deadline']) ? $tender->submission_deadline : null, 'new_deadline' => $d['new_deadline'] ?? null,
            ]);
            if (! empty($d['new_deadline'])) {
                $tender->update(['submission_deadline' => $d['new_deadline'], 'status' => $tender->status === 'closed' ? 'published' : $tender->status]);
            }
            foreach ($request->file('files', []) as $file) {
                $this->storeFile($tender, $file, 'addendum', null, $request->user()->id, $a->id);
            }

            return $a;
        });

        $told = null;
        if ($request->boolean('notify') && $tender->fresh()->status === 'published') {
            $told = $this->notices->send($tender->fresh(), 'addendum', trim("Addendum {$addendum->number}: {$addendum->title}. " . ($d['note'] ?? '')), $request->user());
        }

        return response()->json(['message' => "Addendum {$addendum->number} added." . ($told !== null ? " {$told} vendor(s) were told." : ''), 'id' => $addendum->id, 'notified' => $told], 201);
    }

    // =========================================================================
    // AWARD (the decision was made offline; this records it and tells the public)
    // =========================================================================

    /**
     * Body: awards[] ({lot_code?, vendor_id?, winner_name?, amount?, awarded_on?, notes?}), show_award?.
     * Marks the tender Awarded. A lot with no row simply had no winner. Sending it again replaces the earlier record.
     */
    public function award(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::with('lots')->findOrFail($tenderId);
        if (! in_array($tender->status, ['published', 'closed', 'awarded'], true)) {
            return response()->json(['message' => 'Only a published or closed tender can be awarded.'], 422);
        }
        $d = $request->validate([
            'awards'               => 'required|array|min:1|max:60',
            'awards.*.lot_code'    => 'nullable|string|max:10',
            'awards.*.vendor_id'   => 'nullable|integer|exists:vendors,id',
            'awards.*.winner_name' => 'nullable|string|max:255',
            'awards.*.amount'      => 'nullable|numeric|min:0',
            'awards.*.awarded_on'  => 'nullable|date',
            'awards.*.notes'       => 'nullable|string|max:255',
            'show_award'           => 'nullable|boolean',
        ]);

        $lotCodes = $tender->lots->pluck('code')->map(fn ($c) => strtoupper($c))->all();
        $rows = [];
        foreach ($d['awards'] as $i => $a) {
            $code = isset($a['lot_code']) && $a['lot_code'] !== '' ? strtoupper($a['lot_code']) : null;
            if ($code && ! in_array($code, $lotCodes, true)) {
                throw ValidationException::withMessages(["awards.{$i}.lot_code" => "This tender has no lot {$code}."]);
            }
            $vendor = ! empty($a['vendor_id']) ? Vendor::find($a['vendor_id']) : null;
            $name = trim((string) ($a['winner_name'] ?? '')) ?: $vendor?->company_name;
            if (! $name) {
                throw ValidationException::withMessages(["awards.{$i}.winner_name" => 'Choose a vendor or type the winner\'s name.']);
            }
            $rows[] = ['lot_code' => $code, 'vendor_id' => $vendor?->id, 'winner_name' => $name, 'amount' => $a['amount'] ?? null, 'currency' => $tender->currency ?: 'KES',
                'awarded_on' => $a['awarded_on'] ?? now()->toDateString(), 'notes' => $a['notes'] ?? null, 'created_by' => $request->user()->id];
        }

        DB::transaction(function () use ($tender, $rows, $d) {
            $tender->awards()->delete();
            foreach ($rows as $r) {
                $tender->awards()->create($r);
            }
            $single = collect($rows)->whereNull('lot_code')->first();
            $tender->forceFill([
                'status' => 'awarded', 'awarded_at' => now(), 'show_award' => (bool) ($d['show_award'] ?? true),
                'awarded_vendor_id' => $single['vendor_id'] ?? null,
            ])->save();
        });

        return response()->json(['message' => 'Award recorded. The tender is now Awarded.' . ($tender->show_award ? ' Winners are shown on the tender page.' : ' Winners are not shown publicly.')]);
    }

    /** A link that opens or downloads the file for ten minutes without needing the sign-in header (a browser tab cannot send it). */
    public function documentLink(Request $request, int $tenderId, int $docId): JsonResponse
    {
        $doc = TenderDocument::where('tender_id', $tenderId)->findOrFail($docId);

        return response()->json(['url' => URL::temporarySignedRoute('tender-files.show', now()->addMinutes(10), ['doc' => $doc->id, 'inline' => $request->boolean('inline') ? 1 : 0])]);
    }

    // =========================================================================
    // INVITATIONS (visibility = invited)
    // =========================================================================

    /** Body: vendor_ids? and/or group? (a people category: every active vendor in it is added). */
    public function invite(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        $d = $request->validate([
            'vendor_ids'   => 'nullable|array',
            'vendor_ids.*' => 'integer|exists:vendors,id',
            'group'        => 'nullable|in:' . implode(',', Tender::RESERVATION_GROUPS),
        ]);

        $ids = collect($d['vendor_ids'] ?? []);
        if (! empty($d['group'])) {
            $ids = $ids->merge(Vendor::where('status', 'active')->inConfirmedGroup($d['group'])->pluck('id'));
        }
        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['vendor_ids' => 'Choose at least one vendor or a group that has vendors in it.']);
        }

        $added = 0;
        foreach ($ids->unique() as $vid) {
            $inv = TenderInvitation::firstOrCreate(['tender_id' => $tender->id, 'vendor_id' => $vid], ['invited_by' => $request->user()->id]);
            $added += $inv->wasRecentlyCreated ? 1 : 0;
        }

        return response()->json(['message' => "{$added} vendor(s) invited."]);
    }

    public function uninvite(int $tenderId, int $vendorId): JsonResponse
    {
        TenderInvitation::where('tender_id', $tenderId)->where('vendor_id', $vendorId)->delete();

        return response()->json(['message' => 'Invitation removed.']);
    }

    // =========================================================================
    // EMAIL (through the notification system)
    // =========================================================================

    /** Who would be told: so staff can see the number and the names before sending. */
    public function eligible(int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        $vendors = $this->notices->eligibleVendors($tender);

        return response()->json([
            'count'   => $vendors->count(),
            'vendors' => $vendors->take(100)->map(fn ($v) => ['id' => $v->id, 'company_name' => $v->company_name, 'special_group' => $v->special_group])->values(),
        ]);
    }

    /** Body: note? (added to the message), kind? notice|addendum. */
    public function email(Request $request, int $tenderId): JsonResponse
    {
        $tender = Tender::findOrFail($tenderId);
        $d = $request->validate(['note' => 'nullable|string|max:255', 'kind' => 'nullable|in:notice,addendum']);

        if ($tender->status === 'draft') {
            return response()->json(['message' => 'Publish the tender first: vendors are told about a published tender.'], 422);
        }
        $told = $this->notices->send($tender, $d['kind'] ?? 'notice', $d['note'] ?? null, $request->user());

        return response()->json(['message' => "{$told} vendor(s) were told.", 'notified' => $told]);
    }
}
