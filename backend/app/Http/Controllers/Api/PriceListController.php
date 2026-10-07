<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\PriceList;
use App\Models\PriceListArchive;
use App\Models\Product;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Catalogue\Audience;
use App\Services\Catalogue\CatalogueSettings;
use App\Services\Catalogue\PriceListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Price lists, staff side (make, publish, activate, delete, restore, delete for good, download) and customer side (the lists they may see, and the Archive).
 * Creators: super admin, admin, manager, finance, sales rep. A sales rep's list waits for someone else to activate it. Delete for good: admin and super admin.
 */
class PriceListController extends Controller
{
    public function __construct(private PriceListService $lists, private CatalogueSettings $settings) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function row(PriceList $l, User $u): array
    {
        $names = collect(Audience::types())->pluck('name', 'slug');

        return $l->only(['id', 'name', 'description', 'status', 'active_from', 'access', 'customer_types', 'earlier_price', 'as_at', 'picks', 'item_count', 'created_by', 'submitted_at', 'published_at', 'deleted_at', 'created_at'])
            + ['type_names' => collect($l->customer_types ?? [])->map(fn ($s) => $names[$s] ?? $s)->values()->all(), 'creator' => $l->creator?->name, 'live' => $l->isLive(),
                'can_edit' => PriceListService::canEdit($u, $l), 'mine' => (int) $l->created_by === (int) $u->id];
    }

    private function mineOrPublished($q, User $u)
    {
        return PriceListService::canPublish($u) ? $q : $q->where(fn ($w) => $w->where('status', 'published')->orWhere('created_by', $u->id));
    }

    private function find(Request $r, int $id, bool $trashed = false): PriceList
    {
        $q = $trashed ? PriceList::withTrashed() : PriceList::query();

        return $this->mineOrPublished($q, $r->user())->findOrFail($id);
    }

    /** GET /admin/price-lists?status=&trashed=&q= */
    public function index(Request $request): JsonResponse
    {
        try {
            return $this->listing($request);
        } catch (\Illuminate\Database\QueryException) {
            return response()->json(['message' => 'The price list tables are not set up yet. Run script 93 first.'], 503);
        }
    }

    private function listing(Request $request): JsonResponse
    {
        $u = $request->user();
        $q = $this->mineOrPublished(PriceList::with('creator:id,name')->orderByDesc('id'), $u)
            ->when($request->boolean('trashed'), fn ($w) => $w->onlyTrashed())
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->query('status')))
            ->when($request->filled('q'), fn ($w) => $w->where('name', 'like', '%' . $request->query('q') . '%'));
        $max = $this->settings->get()['max_price_lists'];

        return response()->json(['data' => $q->get()->map(fn ($l) => $this->row($l, $u))->all(), 'limit' => ['used' => $this->lists->used(), 'max' => $max],
            'can' => ['create' => PriceListService::canCreate($u), 'publish' => PriceListService::canPublish($u), 'purge' => PriceListService::canPurge($u)]]);
    }

    /** GET /admin/price-lists/{id}: the list and every line. */
    public function show(Request $request, int $id): JsonResponse
    {
        $l = $this->find($request, $id, true)->load('creator:id,name');

        return response()->json(['data' => $this->row($l, $request->user()) + ['items' => $l->items()->get()->makeHidden('price_list_id')->all()],
            'can' => ['publish' => PriceListService::canPublish($request->user()), 'purge' => PriceListService::canPurge($request->user())]]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => ['required', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'access' => ['nullable', 'string'], 'customer_types' => ['nullable', 'array'],
            'earlier_price' => ['nullable', 'in:discounts,both,never'], 'active_from' => ['nullable', 'date'], 'picks' => ['required', 'array', 'min:1', 'max:200'], 'publish' => ['nullable', 'boolean']]);

        return $this->guard(function () use ($d, $request) {
            $res = $this->lists->create($d, $request->user());
            $msg = $res['list']->status === 'published' ? 'Price list published.' : ($res['list']->status === 'pending' ? 'Saved. It waits for someone else to activate it.' : 'Saved as a draft.');

            return response()->json(['message' => $msg . ($res['skipped'] ? " {$res['skipped']} item(s) had no price and were left out." : ''), 'data' => $this->row($res['list']->load('creator:id,name'), $request->user())], 201);
        });
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['name' => ['sometimes', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:500'], 'access' => ['sometimes', 'string'], 'customer_types' => ['nullable', 'array'],
            'earlier_price' => ['sometimes', 'in:discounts,both,never'], 'active_from' => ['nullable', 'date']]);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'data' => $this->row($this->lists->update($this->find($request, $id), $d, $request->user())->load('creator:id,name'), $request->user())]));
    }

    public function refresh(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $r = $this->lists->refresh($this->find($request, $id), $request->user());

            return response()->json(['message' => "Prices taken again: {$r['lines']} lines."]);
        });
    }

    public function publish(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $l = $this->lists->publish($this->find($request, $id), $request->user());

            return response()->json(['message' => $l->status === 'published' ? 'Published.' : 'Sent for activation. Someone else has to activate it.', 'data' => $this->row($l->load('creator:id,name'), $request->user())]);
        });
    }

    public function activate(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['message' => 'Activated. It is published.', 'data' => $this->row($this->lists->activate($this->find($request, $id), $request->user())->load('creator:id,name'), $request->user())]));
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['message' => 'Back to a draft.', 'data' => $this->row($this->lists->withdraw($this->find($request, $id), $request->user())->load('creator:id,name'), $request->user())]));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $this->lists->trash($this->find($request, $id), $request->user());

            return response()->json(['message' => 'Moved to the bin. It still counts towards the limit until it is deleted for good.']);
        });
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $l = $this->lists->restore(PriceList::onlyTrashed()->findOrFail($id), $request->user());

            return response()->json(['message' => 'Restored.', 'data' => $this->row($l->load('creator:id,name'), $request->user())]);
        });
    }

    public function purge(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $this->lists->purge(PriceList::withTrashed()->findOrFail($id), $request->user());

            return response()->json(['message' => 'Deleted for good.']);
        });
    }

    private function download(PriceList $l, string $kind): StreamedResponse
    {
        $slug = \Illuminate\Support\Str::slug($l->name) ?: 'price-list';
        if ($kind === 'csv') {
            return response()->streamDownload(fn () => print($this->lists->csv($l)), "{$slug}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
        }

        return response()->streamDownload(fn () => print(json_encode($this->lists->json($l), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), "{$slug}.json", ['Content-Type' => 'application/json']);
    }

    public function csv(Request $request, int $id)
    {
        return $this->download($this->find($request, $id, true), 'csv');
    }

    public function json(Request $request, int $id)
    {
        return $this->download($this->find($request, $id, true), 'json');
    }

    /** GET /admin/price-lists/picker?type=&q=: things to put on a list, found by name. */
    public function picker(Request $request): JsonResponse
    {
        $type = (string) $request->query('type', 'product');
        $q = trim((string) $request->query('q', ''));
        $like = fn ($w, $col = 'name') => $w->when($q !== '', fn ($x) => $x->where($col, 'like', "%{$q}%"));
        $rows = match ($type) {
            'product' => $like(Product::active()->forSale())->orderBy('name')->limit(30)->get(['id', 'name', 'sku'])->map(fn ($x) => ['id' => $x->id, 'label' => $x->name, 'sub' => $x->sku]),
            'service' => $like(Service::active()->visible())->orderBy('name')->limit(30)->get(['id', 'name', 'sku'])->map(fn ($x) => ['id' => $x->id, 'label' => $x->name, 'sub' => $x->sku]),
            'category' => $like(Category::query())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['id' => $x->id, 'label' => $x->name, 'sub' => 'with its sub-categories']),
            'brand' => $like(Brand::query())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['id' => $x->id, 'label' => $x->name, 'sub' => null]),
            'service_category' => $like(ServiceCategory::query())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['id' => $x->id, 'label' => $x->name, 'sub' => null]),
            default => collect(),
        };

        return response()->json(['data' => $rows->values()->all()]);
    }

    // ---- customer side ---------------------------------------------------------------------------------------------------------------------------

    /** GET /price-lists: the live lists this person may see. */
    public function publicIndex(Request $request): JsonResponse
    {
        $u = $request->user('sanctum');
        $rows = Audience::scope(PriceList::live()->orderByRaw('COALESCE(active_from, published_at, created_at) DESC'), $u)->get()
            ->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'description' => $l->description, 'as_at' => $l->as_at, 'item_count' => $l->item_count, 'active_from' => $l->active_from, 'published_at' => $l->published_at])->all();

        return response()->json(['data' => $rows]);
    }

    private function visibleList(Request $r, int $id): PriceList
    {
        return Audience::scope(PriceList::live(), $r->user('sanctum'))->findOrFail($id);
    }

    public function publicShow(Request $request, int $id): JsonResponse
    {
        $l = $this->visibleList($request, $id);

        return response()->json(['data' => $l->only(['id', 'name', 'description', 'as_at', 'earlier_price', 'item_count']) + ['items' => $l->items()->get()->makeHidden(['price_list_id', 'tax_account'])->all()]]);
    }

    public function publicCsv(Request $request, int $id)
    {
        return $this->download($this->visibleList($request, $id), 'csv');
    }

    public function publicJson(Request $request, int $id)
    {
        return $this->download($this->visibleList($request, $id), 'json');
    }

    /** GET /price-list-archives: the archived zips this person may open. */
    public function archiveIndex(Request $request): JsonResponse
    {
        $staff = Audience::isStaff($request->user('sanctum'));
        $rows = Audience::scope(PriceListArchive::orderByDesc('id'), $request->user('sanctum'))->get()
            ->map(fn ($a) => $a->only(['id', 'title', 'list_name', 'list_as_at', 'size_bytes', 'created_at']) + ($staff ? $a->only(['access', 'customer_types']) : []))->all();

        return response()->json(['data' => $rows]);
    }

    public function archiveFile(Request $request, int $id)
    {
        $a = Audience::scope(PriceListArchive::query(), $request->user('sanctum'))->findOrFail($id);
        abort_unless(Storage::disk('public')->exists($a->file_path), 404, 'The file is missing.');

        return Storage::disk('public')->download($a->file_path, $a->file_name ?: 'price-list.zip');
    }

    // ---- archive, staff side ---------------------------------------------------------------------------------------------------------------------

    /** POST /admin/price-list-archives (multipart): a zip holding a PDF, a CSV and a JSON file. */
    public function archiveStore(Request $request): JsonResponse
    {
        abort_unless(PriceListService::canPublish($request->user()), 403, 'Only a manager, finance, admin or super admin can add to the Archive.');
        $d = $request->validate(['file' => ['required', 'file', 'mimes:zip', 'max:51200'], 'title' => ['required', 'string', 'max:160'], 'access' => ['nullable', 'string'], 'customer_types' => ['nullable'],
            'list_name' => ['nullable', 'string', 'max:160'], 'list_as_at' => ['nullable', 'date']]);

        return $this->guard(function () use ($request, $d) {
            $file = $request->file('file');
            if (class_exists(\ZipArchive::class)) {
                $zip = new \ZipArchive;
                if ($zip->open($file->getRealPath()) !== true) {
                    throw new BooksException('That is not a readable zip file.');
                }
                $have = [];
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $have[strtolower(pathinfo($zip->getNameIndex($i), PATHINFO_EXTENSION))] = true;
                }
                $zip->close();
                if (! isset($have['pdf'], $have['csv'], $have['json'])) {
                    throw new BooksException('The zip must hold a PDF, a CSV and a JSON file.');
                }
            }
            $types = $request->input('customer_types');
            [$access, $types] = Audience::clean($d['access'] ?? null, is_string($types) ? json_decode($types, true) : $types);
            $path = $file->store('price-list-archives', 'public');
            $a = PriceListArchive::create(['title' => trim($d['title']), 'file_path' => $path, 'file_name' => $file->getClientOriginalName(), 'size_bytes' => $file->getSize(), 'list_name' => $d['list_name'] ?? null,
                'list_as_at' => $d['list_as_at'] ?? null, 'access' => $access, 'customer_types' => $types, 'uploaded_by' => $request->user()->id]);

            return response()->json(['message' => 'Added to the Archive.', 'data' => $a], 201);
        });
    }

    public function archiveUpdate(Request $request, int $id): JsonResponse
    {
        abort_unless(PriceListService::canPublish($request->user()), 403, 'Only a manager, finance, admin or super admin can change the Archive.');
        $d = $request->validate(['title' => ['sometimes', 'string', 'max:160'], 'access' => ['sometimes', 'string'], 'customer_types' => ['nullable', 'array']]);

        return $this->guard(function () use ($d, $id) {
            $a = PriceListArchive::findOrFail($id);
            $f = array_intersect_key($d, ['title' => 1]);
            if (array_key_exists('access', $d)) {
                [$f['access'], $f['customer_types']] = Audience::clean($d['access'], $d['customer_types'] ?? null);
            }
            $a->update($f);

            return response()->json(['message' => 'Saved.', 'data' => $a]);
        });
    }

    public function archiveDestroy(Request $request, int $id): JsonResponse
    {
        abort_unless(PriceListService::canPurge($request->user()), 403, 'Only an admin or super admin can delete from the Archive.');
        $a = PriceListArchive::findOrFail($id);
        Storage::disk('public')->delete($a->file_path);
        $a->delete();

        return response()->json(['message' => 'Deleted from the Archive.']);
    }

    /** GET /admin/price-list-archives: every archived zip, with who it is for. */
    public function archiveAdminIndex(Request $request): JsonResponse
    {
        $names = collect(Audience::types())->pluck('name', 'slug');
        $rows = PriceListArchive::orderByDesc('id')->get()->map(fn ($a) => $a->only(['id', 'title', 'list_name', 'list_as_at', 'size_bytes', 'created_at', 'access', 'customer_types'])
            + ['type_names' => collect($a->customer_types ?? [])->map(fn ($s) => $names[$s] ?? $s)->values()->all()])->all();

        return response()->json(['data' => $rows, 'can' => ['publish' => PriceListService::canPublish($request->user()), 'purge' => PriceListService::canPurge($request->user())]]);
    }
}
