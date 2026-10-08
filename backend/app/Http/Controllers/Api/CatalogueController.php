<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\Brand;
use App\Models\Brochure;
use App\Models\BrochureItemMeta;
use App\Models\Category;
use App\Models\Hamper;
use App\Models\Product;
use App\Models\Service;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Catalogue\Audience;
use App\Services\Catalogue\BrochureItemData;
use App\Services\Catalogue\BrochureSections;
use App\Services\Catalogue\CatalogueSettings;
use App\Services\Catalogue\PriceListService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Brochures and catalogues: the same document at different sizes (full page, half page, card). Staff make them from items (products, services, hampers, auctions),
 * choose each entry's sections and themes, and publish for an audience. Customers read what they may see, and can download a one-item brochure from an item's page.
 * Also holds the shop-wide settings and each item's own brochure settings.
 */
class CatalogueController extends Controller
{
    public function __construct(private BrochureItemData $items, private CatalogueSettings $settings) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function builder(Request $r): void
    {
        abort_unless(PriceListService::canCreate($r->user()), 403, 'You cannot work on brochures.');
    }

    private function publisher(Request $r): void
    {
        abort_unless(PriceListService::canPublish($r->user()), 403, 'Only a manager, finance, admin or super admin can do this.');
    }

    private function manager(Request $r): void
    {
        abort_unless($r->user()->hasPermission('catalogue.settings'), 403, 'You do not have permission to do this.');
    }

    // ---- settings --------------------------------------------------------------------------------------------------------------------------------

    /** GET /admin/catalogue-settings: the settings, plus what the screens need (customer types from the database, the section lists). */
    public function settings(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->settings->get(), 'customer_types' => Audience::types(), 'sections' => BrochureSections::KEYS, 'themes' => BrochureSections::THEMES, 'sizes' => BrochureSections::SIZES,
            'can_edit' => $request->user()->hasPermission('catalogue.settings')]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $this->manager($request);
        $d = $request->validate(['max_price_lists' => ['sometimes', 'integer', 'min:1', 'max:1000'], 'earlier_price' => ['sometimes', 'in:discounts,both,never'], 'customer_item_brochure' => ['sometimes', 'boolean'],
            'customer_catalogue_link' => ['sometimes', 'boolean'], 'brochure_defaults' => ['sometimes', 'array']]);

        return $this->guard(fn () => response()->json(['message' => 'Saved.', 'data' => $this->settings->update($d, $request->user())]));
    }

    // ---- brochures, staff ------------------------------------------------------------------------------------------------------------------------

    private function row(Brochure $b): array
    {
        $names = collect(Audience::types())->pluck('name', 'slug');

        return $b->only(['id', 'title', 'subtitle', 'size', 'status', 'access', 'customer_types', 'settings', 'published_at', 'deleted_at', 'created_at', 'created_by'])
            + ['entry_count' => count($b->entries ?? []), 'kind' => count($b->entries ?? []) > 1 ? 'catalogue' : 'brochure', 'creator' => $b->creator?->name,
                'type_names' => collect($b->customer_types ?? [])->map(fn ($s) => $names[$s] ?? $s)->values()->all()];
    }

    private function mineOrPublished($q, User $u)
    {
        return PriceListService::canPublish($u) ? $q : $q->where(fn ($w) => $w->where('status', 'published')->orWhere('created_by', $u->id));
    }

    private function canEditBrochure(User $u, Brochure $b): bool
    {
        return PriceListService::canPublish($u) || (PriceListService::canCreate($u) && (int) $b->created_by === (int) $u->id && $b->status === 'draft');
    }

    public function index(Request $request): JsonResponse
    {
        try {
            return $this->listing($request);
        } catch (\Illuminate\Database\QueryException) {
            return response()->json(['message' => 'The brochure tables are not set up yet. Run script 93 first.'], 503);
        }
    }

    private function listing(Request $request): JsonResponse
    {
        $this->builder($request);
        $q = $this->mineOrPublished(Brochure::with('creator:id,name')->orderByDesc('id'), $request->user())
            ->when($request->boolean('trashed'), fn ($w) => $w->onlyTrashed())
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->query('status')))
            ->when($request->filled('q'), fn ($w) => $w->where('title', 'like', '%' . $request->query('q') . '%'));

        return response()->json(['data' => $q->get()->map(fn ($b) => $this->row($b))->all(),
            'can' => ['create' => true, 'publish' => PriceListService::canPublish($request->user()), 'purge' => PriceListService::canPurge($request->user())]]);
    }

    private function names(array $entries): array
    {
        $by = [];
        foreach (BrochureSections::types() as $t) {
            $ids = collect($entries)->where('type', $t)->pluck('id')->all();
            if (! $ids) {
                continue;
            }
            $by[$t] = match ($t) {
                'product' => Product::whereIn('id', $ids)->pluck('name', 'id')->all(),
                'service' => Service::whereIn('id', $ids)->pluck('name', 'id')->all(),
                'hamper' => Hamper::whereIn('id', $ids)->pluck('name', 'id')->all(),
                'auction' => Auction::with('product:id,name')->whereIn('id', $ids)->get()->mapWithKeys(fn ($a) => [$a->id => $a->product?->name ?? "Auction #{$a->id}"])->all(),
            };
        }

        return $by;
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $b = $this->mineOrPublished(Brochure::withTrashed()->with('creator:id,name'), $request->user())->findOrFail($id);
        $names = $this->names($b->entries ?? []);
        $entries = collect($b->entries ?? [])->map(fn ($e) => $e + ['name' => $names[$e['type']][$e['id']] ?? null])->values()->all();

        return response()->json(['data' => $this->row($b) + ['entries' => $entries, 'can_edit' => $this->canEditBrochure($request->user(), $b)]]);
    }

    private function cleanEntries($entries): array
    {
        $seen = [];
        $out = [];
        foreach (is_array($entries) ? $entries : [] as $e) {
            $t = is_array($e) ? ($e['type'] ?? null) : null;
            $i = is_array($e) ? (int) ($e['id'] ?? 0) : 0;
            if (! in_array($t, BrochureSections::types(), true) || $i < 1 || isset($seen["$t:$i"])) {
                continue;
            }
            $seen["$t:$i"] = true;
            $row = ['type' => $t, 'id' => $i];
            if (in_array($e['size'] ?? null, BrochureSections::SIZES, true)) {
                $row['size'] = $e['size'];
            }
            if ($s = BrochureSections::cleanList($t, $e['sections'] ?? [])) {
                $row['sections'] = $s;
            }
            $out[] = $row;
        }

        return array_slice($out, 0, 500);
    }

    private function fields(Request $request, bool $creating): array
    {
        $d = $request->validate(['title' => [$creating ? 'required' : 'sometimes', 'string', 'max:160'], 'subtitle' => ['nullable', 'string', 'max:255'], 'size' => ['sometimes', 'in:full,half,card'],
            'status' => ['sometimes', 'in:draft,published'], 'access' => ['sometimes', 'string'], 'customer_types' => ['nullable', 'array'], 'settings' => ['sometimes', 'array'], 'entries' => ['sometimes', 'array', 'max:500']]);
        $f = array_intersect_key($d, array_flip(['title', 'subtitle', 'size']));
        if (isset($f['title'])) {
            $f['title'] = trim($f['title']);
        }
        if (array_key_exists('access', $d)) {
            [$f['access'], $f['customer_types']] = Audience::clean($d['access'], $d['customer_types'] ?? null);
        }
        if (isset($d['settings'])) {
            $f['settings'] = ['cover' => (bool) ($d['settings']['cover'] ?? true), 'contents' => (bool) ($d['settings']['contents'] ?? true), 'back' => (bool) ($d['settings']['back'] ?? true)];
        }
        if (isset($d['entries'])) {
            $f['entries'] = $this->cleanEntries($d['entries']);
        }
        if (isset($d['status'])) {
            $f['status'] = $d['status'];
        }

        return $f;
    }

    public function store(Request $request): JsonResponse
    {
        $this->builder($request);

        return $this->guard(function () use ($request) {
            $f = $this->fields($request, true);
            if (($f['status'] ?? 'draft') === 'published') {
                $this->publisher($request);
            }
            $b = Brochure::create($f + ['status' => 'draft', 'access' => 'staff', 'size' => 'full', 'entries' => [], 'settings' => ['cover' => true, 'contents' => true, 'back' => true], 'created_by' => $request->user()->id]);
            if ($b->status === 'published') {
                $this->assertPublishable($b);
                $b->update(['published_at' => now()]);
            }

            return response()->json(['message' => 'Saved.', 'data' => $this->row($b->load('creator:id,name'))], 201);
        });
    }

    private function assertPublishable(Brochure $b): void
    {
        if (! count($b->entries ?? [])) {
            throw new BooksException('Add at least one item before publishing.');
        }
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->builder($request);

        return $this->guard(function () use ($request, $id) {
            $b = $this->mineOrPublished(Brochure::query(), $request->user())->findOrFail($id);
            abort_unless($this->canEditBrochure($request->user(), $b), 403, 'You can only change your own drafts.');
            $f = $this->fields($request, false);
            if (isset($f['status']) && $f['status'] !== $b->status) {
                $this->publisher($request);
            }
            $b->fill($f);
            if ($b->status === 'published') {
                $this->assertPublishable($b);
                $b->published_at ??= now();
            } elseif (isset($f['status'])) {
                $b->published_at = null;
            }
            $b->save();

            return response()->json(['message' => 'Saved.', 'data' => $this->row($b->load('creator:id,name'))]);
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $b = $this->mineOrPublished(Brochure::query(), $request->user())->findOrFail($id);
        abort_unless(PriceListService::canPublish($request->user()) || ((int) $b->created_by === (int) $request->user()->id && $b->status === 'draft'), 403, 'You cannot delete this.');
        $b->delete();

        return response()->json(['message' => 'Moved to the bin.']);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $b = $this->mineOrPublished(Brochure::onlyTrashed(), $request->user())->findOrFail($id);
        $b->restore();

        return response()->json(['message' => 'Restored.', 'data' => $this->row($b->load('creator:id,name'))]);
    }

    public function purge(Request $request, int $id): JsonResponse
    {
        abort_unless(PriceListService::canPurge($request->user()), 403, 'Only an admin or super admin can delete for good.');
        $b = Brochure::onlyTrashed()->findOrFail($id);
        $b->forceDelete();

        return response()->json(['message' => 'Deleted for good.']);
    }

    // ---- picking items ---------------------------------------------------------------------------------------------------------------------------

    /** GET /admin/catalogues/picker?type=&q=: single items to put in a brochure, found by name. */
    public function picker(Request $request): JsonResponse
    {
        $this->builder($request);
        $type = (string) $request->query('type', 'product');
        $q = trim((string) $request->query('q', ''));
        $like = fn ($w, $col = 'name') => $w->when($q !== '', fn ($x) => $x->where($col, 'like', "%{$q}%"));
        $rows = match ($type) {
            'product' => $like(Product::active()->forSale())->orderBy('name')->limit(30)->get(['id', 'name', 'sku'])->map(fn ($x) => ['type' => 'product', 'id' => $x->id, 'name' => $x->name, 'sub' => $x->sku]),
            'service' => $like(Service::active()->visible())->orderBy('name')->limit(30)->get(['id', 'name', 'sku'])->map(fn ($x) => ['type' => 'service', 'id' => $x->id, 'name' => $x->name, 'sub' => $x->sku]),
            'hamper' => $like(Hamper::active())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['type' => 'hamper', 'id' => $x->id, 'name' => $x->name, 'sub' => null]),
            'auction' => Auction::with('product:id,name')->whereIn('status', ['active', 'scheduled'])->when($q !== '', fn ($w) => $w->whereHas('product', fn ($p) => $p->where('name', 'like', "%{$q}%")))->orderByDesc('id')->limit(30)->get()
                ->map(fn ($x) => ['type' => 'auction', 'id' => $x->id, 'name' => $x->product?->name ?? "Auction #{$x->id}", 'sub' => $x->status]),
            'category' => $like(Category::query())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['type' => 'category', 'id' => $x->id, 'name' => $x->name, 'sub' => 'every product in it']),
            'brand' => $like(Brand::query())->orderBy('name')->limit(30)->get(['id', 'name'])->map(fn ($x) => ['type' => 'brand', 'id' => $x->id, 'name' => $x->name, 'sub' => 'every product of it']),
            default => collect(),
        };

        return response()->json(['data' => $rows->values()->all()]);
    }

    /** POST /admin/catalogues/expand {picks:[{type,id}]}: a category, brand or "all" turned into the items in it. */
    public function expand(Request $request, PriceListService $lists): JsonResponse
    {
        $this->builder($request);
        $picks = (array) $request->input('picks', []);
        $found = $lists->pick($picks);
        $out = [];
        foreach (Product::whereIn('id', $found['products'])->orderBy('name')->get(['id', 'name']) as $p) {
            $out[] = ['type' => 'product', 'id' => $p->id, 'name' => $p->name];
        }
        foreach (Service::whereIn('id', $found['services'])->orderBy('name')->get(['id', 'name']) as $s) {
            $out[] = ['type' => 'service', 'id' => $s->id, 'name' => $s->name];
        }
        if (collect($picks)->contains('type', 'all_hampers')) {
            foreach (Hamper::active()->orderBy('name')->get(['id', 'name']) as $h) {
                $out[] = ['type' => 'hamper', 'id' => $h->id, 'name' => $h->name];
            }
        }
        if (collect($picks)->contains('type', 'all_auctions')) {
            foreach (Auction::with('product:id,name')->whereIn('status', ['active', 'scheduled'])->get() as $a) {
                $out[] = ['type' => 'auction', 'id' => $a->id, 'name' => $a->product?->name ?? "Auction #{$a->id}"];
            }
        }

        return response()->json(['data' => array_slice($out, 0, 500), 'total' => count($out)]);
    }

    // ---- an item's own brochure settings ---------------------------------------------------------------------------------------------------------

    /** GET /admin/catalogues/items?type=&q=&page=: items with their own brochure settings, for the settings page. */
    public function itemList(Request $request): JsonResponse
    {
        $this->builder($request);
        $type = (string) $request->query('type', 'product');
        abort_unless(in_array($type, BrochureSections::types(), true), 422, 'Unknown item type.');
        $q = trim((string) $request->query('q', ''));
        $per = 30;
        $metaFor = fn (array $ids) => BrochureItemMeta::where('item_type', $type)->whereIn('item_id', $ids)->pluck('meta', 'item_id');

        if ($type === 'product') {
            $page = Product::query()->with('category:id,name')->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%")))
                ->when($request->filled('category_id'), fn ($w) => $w->where('category_id', (int) $request->query('category_id')))->orderBy('name')->paginate($per, ['id', 'name', 'sku', 'category_id', 'brochure_meta']);
            $rows = collect($page->items())->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'sub' => $p->sku, 'category' => $p->category?->name, 'meta' => $p->brochure_meta]);
        } elseif ($type === 'service') {
            $page = Service::query()->when($q !== '', fn ($w) => $w->where('name', 'like', "%{$q}%"))->orderBy('name')->paginate($per, ['id', 'name', 'sku']);
            $m = $metaFor(collect($page->items())->pluck('id')->all());
            $rows = collect($page->items())->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'sub' => $s->sku, 'category' => null, 'meta' => $m[$s->id] ?? null]);
        } elseif ($type === 'hamper') {
            $page = Hamper::query()->when($q !== '', fn ($w) => $w->where('name', 'like', "%{$q}%"))->orderBy('name')->paginate($per, ['id', 'name']);
            $m = $metaFor(collect($page->items())->pluck('id')->all());
            $rows = collect($page->items())->map(fn ($h) => ['id' => $h->id, 'name' => $h->name, 'sub' => null, 'category' => null, 'meta' => $m[$h->id] ?? null]);
        } else {
            $page = Auction::with('product:id,name')->when($q !== '', fn ($w) => $w->whereHas('product', fn ($p) => $p->where('name', 'like', "%{$q}%")))->orderByDesc('id')->paginate($per);
            $m = $metaFor(collect($page->items())->pluck('id')->all());
            $rows = collect($page->items())->map(fn ($a) => ['id' => $a->id, 'name' => $a->product?->name ?? "Auction #{$a->id}", 'sub' => $a->status, 'category' => null, 'meta' => $m[$a->id] ?? null]);
        }

        return response()->json(['data' => $rows->values()->all(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'defaults' => $this->settings->get()['brochure_defaults'][$type]['sections']]);
    }

    private function saveMeta(string $type, int $id, array $meta): void
    {
        $clean = BrochureSections::cleanMeta($type, $meta);
        $blank = $clean['enabled'] && ! $clean['sections'];   // nothing special: fall back to the default
        if ($type === 'product') {
            try {
                Product::whereKey($id)->update(['brochure_meta' => $blank ? null : json_encode($clean)]);
            } catch (\Illuminate\Database\QueryException) {
                throw new BooksException('The products table has no brochure column yet. Run script 93 first.');
            }

            return;
        }
        if ($blank) {
            BrochureItemMeta::where('item_type', $type)->where('item_id', $id)->delete();

            return;
        }
        BrochureItemMeta::updateOrCreate(['item_type' => $type, 'item_id' => $id], ['meta' => $clean]);
    }

    /** PUT /admin/catalogues/item-meta/{type}/{id} {enabled, sections:[{key,theme}]}: no sections = use the default. */
    public function saveItemMeta(Request $request, string $type, int $id): JsonResponse
    {
        $this->manager($request);
        abort_unless(in_array($type, BrochureSections::types(), true), 422, 'Unknown item type.');
        $request->validate(['enabled' => ['sometimes', 'boolean'], 'sections' => ['sometimes', 'array', 'max:12']]);

        return $this->guard(function () use ($request, $type, $id) {
            $this->saveMeta($type, $id, $request->only(['enabled', 'sections']));

            return response()->json(['message' => 'Saved.']);
        });
    }

    /** POST /admin/catalogues/item-meta/bulk {type, ids|picks, meta}: the same choice for many items (a category, a brand, hand-picked, or all). */
    public function bulkItemMeta(Request $request, PriceListService $lists): JsonResponse
    {
        $this->manager($request);
        $d = $request->validate(['type' => ['required', 'in:product,service,hamper,auction'], 'ids' => ['nullable', 'array', 'max:2000'], 'picks' => ['nullable', 'array', 'max:50'], 'all' => ['nullable', 'boolean'], 'meta' => ['required', 'array']]);
        $type = $d['type'];
        $ids = collect($d['ids'] ?? [])->map(fn ($i) => (int) $i)->filter();
        if ($type === 'product' && ! empty($d['picks'])) {
            $ids = $ids->merge($lists->pick($d['picks'])['products']);
        }
        if (! empty($d['all'])) {
            $ids = match ($type) {
                'product' => Product::pluck('id'), 'service' => Service::pluck('id'), 'hamper' => Hamper::pluck('id'), 'auction' => Auction::pluck('id'),
            };
        }
        $ids = $ids->unique()->values();
        if ($ids->isEmpty()) {
            return response()->json(['message' => 'Nothing was chosen.'], 422);
        }
        foreach ($ids as $id) {
            $this->saveMeta($type, (int) $id, $d['meta']);
        }

        return response()->json(['message' => "Saved for {$ids->count()} items.", 'count' => $ids->count()]);
    }

    // ---- staff preview ---------------------------------------------------------------------------------------------------------------------------

    /** GET /admin/catalogues/{id}/data?from=&limit=: the entries as they will be drawn, for the staff preview and the staff download. */
    public function data(Request $request, int $id): JsonResponse
    {
        $this->builder($request);
        $b = $this->mineOrPublished(Brochure::withTrashed(), $request->user())->findOrFail($id);

        return response()->json($this->slice($b, $request, $request->user()));
    }

    private function slice(Brochure $b, Request $r, ?User $viewer): array
    {
        $all = $b->entries ?? [];
        $from = max(0, $r->integer('from'));
        $limit = max(1, min(40, $r->integer('limit', 20)));
        $out = [];
        $skipped = 0;
        foreach (array_slice($all, $from, $limit) as $e) {
            $x = $this->items->build($e['type'], (int) $e['id'], $viewer, $e, ! Audience::isStaff($viewer));
            if ($x) {
                $out[] = $x + ['size' => $e['size'] ?? $b->size];
            } else {
                $skipped++;
            }
        }

        return ['brochure' => ['id' => $b->id, 'title' => $b->title, 'subtitle' => $b->subtitle, 'size' => $b->size, 'settings' => ($b->settings ?? []) + ['cover' => true, 'contents' => true, 'back' => true], 'total' => count($all),
            'kind' => count($all) > 1 ? 'catalogue' : 'brochure'], 'entries' => $out, 'skipped' => $skipped, 'from' => $from, 'next' => $from + $limit < count($all) ? $from + $limit : null];
    }

    // ---- customer side ---------------------------------------------------------------------------------------------------------------------------

    private function liveFor(?User $u)
    {
        return Audience::scope(Brochure::where('status', 'published'), $u);
    }

    /** GET /catalogue/status?type=&id=: may this person download a one-item brochure here, and is there a catalogues link to show? */
    public function status(Request $request): JsonResponse
    {
        $u = $request->user('sanctum');
        $s = $this->settings->get();
        $staff = Audience::isStaff($u);
        $out = ['catalogues' => ['enabled' => $s['customer_catalogue_link'] || $staff, 'count' => $this->liveFor($u)->count()]];
        $out['catalogues']['show'] = $out['catalogues']['enabled'] && $out['catalogues']['count'] > 0;
        try {
            $out['price_lists'] = ['count' => Audience::scope(\App\Models\PriceList::live(), $u)->count(), 'archive' => Audience::scope(\App\Models\PriceListArchive::query(), $u)->count()];
        } catch (\Throwable) {
            $out['price_lists'] = ['count' => 0, 'archive' => 0];
        }
        $out['price_lists']['show'] = $out['price_lists']['count'] + $out['price_lists']['archive'] > 0;
        if ($request->filled('type') && $request->filled('id')) {
            $type = (string) $request->query('type');
            $reason = null;
            if (! in_array($type, BrochureSections::types(), true)) {
                $reason = 'unknown';
            } elseif (! $s['customer_item_brochure'] && ! $staff) {
                $reason = 'switched_off';
            } elseif (! $this->items->build($type, $request->integer('id'), $u, null, true)) {
                $reason = 'not_available';
            }
            $out['item'] = ['available' => $reason === null, 'reason' => $reason];
        }

        return response()->json($out);
    }

    /** GET /catalogue/item/{type}/{id}: one item as a brochure of one entry. */
    public function itemBrochure(Request $request, string $type, int $id): JsonResponse
    {
        $u = $request->user('sanctum');
        abort_unless(in_array($type, BrochureSections::types(), true), 404);
        abort_unless($this->settings->get()['customer_item_brochure'] || Audience::isStaff($u), 403, 'Brochure downloads are switched off.');
        $x = $this->items->build($type, $id, $u, null, true);
        abort_unless($x, 404, 'This item has no brochure.');

        return response()->json(['brochure' => ['id' => null, 'title' => $x['name'], 'subtitle' => $x['tagline'], 'size' => 'full', 'settings' => ['cover' => false, 'contents' => false, 'back' => true], 'total' => 1, 'kind' => 'brochure'],
            'entries' => [$x + ['size' => 'full']], 'skipped' => 0, 'from' => 0, 'next' => null]);
    }

    /** GET /catalogues: the brochures and catalogues this person may read. */
    public function publicIndex(Request $request): JsonResponse
    {
        $u = $request->user('sanctum');
        abort_unless($this->settings->get()['customer_catalogue_link'] || Audience::isStaff($u), 403, 'Catalogues are not shown right now.');
        $rows = $this->liveFor($u)->orderByDesc('published_at')->get()->map(fn ($b) => ['id' => $b->id, 'title' => $b->title, 'subtitle' => $b->subtitle, 'size' => $b->size, 'published_at' => $b->published_at,
            'entry_count' => count($b->entries ?? []), 'kind' => count($b->entries ?? []) > 1 ? 'catalogue' : 'brochure'])->all();

        return response()->json(['data' => $rows]);
    }

    /** GET /catalogues/{id}/data?from=&limit= */
    public function publicData(Request $request, int $id): JsonResponse
    {
        $u = $request->user('sanctum');
        abort_unless($this->settings->get()['customer_catalogue_link'] || Audience::isStaff($u), 403, 'Catalogues are not shown right now.');
        $b = $this->liveFor($u)->findOrFail($id);

        return response()->json($this->slice($b, $request, $u));
    }
}
