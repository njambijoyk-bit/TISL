<?php

namespace App\Services\Catalogue;

use App\Models\Category;
use App\Models\Employee;
use App\Models\PriceList;
use App\Models\PriceListItem;
use App\Models\Product;
use App\Models\Service;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Calendar\CalendarService;
use Illuminate\Support\Facades\DB;

/**
 * Price lists: a dated, frozen table of selling prices for products and services. Made as a draft, then published, and visible to customers from its
 * Active-from date (worked out when it is read; nothing runs in the background). A sales rep's list cannot be published by its author: it waits for activation,
 * and a manager (or the admins) get a calendar task to activate it. Drafts keep a calendar task for their author until published.
 * At the shop's limit nothing new can be made: download the zip, put it in the Archive, then delete the list for good (admin and super admin).
 */
class PriceListService
{
    public const MAX_ITEMS = 5000;
    public const DRAFT_TASK = 'price_list_draft';
    public const ACTIVATE_TASK = 'price_list_activation';

    public function __construct(private PriceLines $lines, private CatalogueSettings $settings, private CalendarService $calendar) {}

    public static function canCreate(?User $u): bool
    {
        return $u && $u->hasPermission('catalogue.pricelists');
    }

    public static function canPublish(?User $u): bool
    {
        return $u && $u->hasPermission('catalogue.publish');
    }

    public static function canPurge(?User $u): bool
    {
        return $u && $u->hasPermission('catalogue.purge');
    }

    /** Publishers may change anything; anyone else only their own list while it is a draft. */
    public static function canEdit(?User $u, PriceList $l): bool
    {
        return self::canPublish($u) || (self::canCreate($u) && (int) $l->created_by === (int) $u->id && $l->status === 'draft');
    }

    // ---- picking and freezing -------------------------------------------------------------------------------------------------------------------

    /** Every category id under the given ones, themselves included. */
    private function withChildren(array $ids): array
    {
        $all = $ids;
        $next = $ids;
        while ($next) {
            $next = Category::whereIn('parent_id', $next)->whereNotIn('id', $all)->pluck('id')->all();
            $all = array_merge($all, $next);
        }

        return $all;
    }

    /** @return array{products:\Illuminate\Support\Collection,services:\Illuminate\Support\Collection} the chosen items, each once, by name */
    public function pick(array $picks): array
    {
        $productIds = collect();
        $serviceIds = collect();
        $group = fn (string $t) => collect($picks)->where('type', $t)->pluck('id')->map(fn ($i) => (int) $i)->filter()->values()->all();
        $shop = fn () => Product::query()->active()->forSale();
        $svc = fn () => Service::query()->active()->visible();

        if (collect($picks)->contains('type', 'all_products')) {
            $productIds = $productIds->merge($shop()->pluck('id'));
        }
        if (collect($picks)->contains('type', 'all_services')) {
            $serviceIds = $serviceIds->merge($svc()->pluck('id'));
        }
        if ($ids = $group('product')) {
            $productIds = $productIds->merge($shop()->whereIn('id', $ids)->pluck('id'));
        }
        if ($ids = $group('category')) {
            $productIds = $productIds->merge($shop()->whereIn('category_id', $this->withChildren($ids))->pluck('id'));
        }
        if ($ids = $group('brand')) {
            $productIds = $productIds->merge($shop()->whereIn('brand_id', $ids)->pluck('id'));
        }
        if ($ids = $group('service')) {
            $serviceIds = $serviceIds->merge($svc()->whereIn('id', $ids)->pluck('id'));
        }
        if ($ids = $group('service_category')) {
            $serviceIds = $serviceIds->merge($svc()->whereIn('category_id', $ids)->pluck('id'));
        }

        return [
            'products' => $productIds->unique()->values(),
            'services' => $serviceIds->unique()->values(),
        ];
    }

    /** Take the prices now and keep them: replaces the list's lines. @return array{lines:int,skipped:int} */
    public function snapshot(PriceList $l): array
    {
        $picked = $this->pick($l->picks ?? []);
        if (count($picked['products']) + count($picked['services']) > self::MAX_ITEMS) {
            throw new BooksException('That is more than ' . self::MAX_ITEMS . ' items. Pick fewer.');
        }
        $rows = [];
        $skipped = 0;
        Product::with(['currency:id,code,symbol', 'category:id,name', 'defaultUnit:id,code,name'])->whereIn('id', $picked['products'])->orderBy('name')->get()->each(function (Product $p) use (&$rows, &$skipped) {
            $lines = $this->lines->forProduct($p);
            $skipped += $lines ? 0 : 1;
            foreach ($lines as $x) {
                $rows[] = $x + ['item_type' => 'product', 'item_id' => $p->id, 'name' => $p->name, 'category' => $p->category?->name];
            }
        });
        Service::with(['currency:id,code,symbol', 'category:id,name'])->whereIn('id', $picked['services'])->orderBy('name')->get()->each(function (Service $s) use (&$rows, &$skipped) {
            $lines = $this->lines->forService($s);
            $skipped += $lines ? 0 : 1;
            foreach ($lines as $x) {
                $rows[] = $x + ['item_type' => 'service', 'item_id' => $s->id, 'name' => $s->name, 'category' => $s->category?->name];
            }
        });
        if (! $rows) {
            throw new BooksException('None of the chosen items has a price to list.');
        }
        $keep = array_flip((new PriceListItem)->getFillable());
        $rows = array_map(fn ($r, $i) => array_intersect_key($r, $keep) + ['price_list_id' => $l->id, 'position' => $i], $rows, array_keys($rows));
        DB::transaction(function () use ($l, $rows) {
            PriceListItem::where('price_list_id', $l->id)->delete();
            foreach (array_chunk($rows, 200) as $chunk) {
                PriceListItem::insert($chunk);
            }
            $l->update(['item_count' => count($rows), 'as_at' => now()]);
        });

        return ['lines' => count($rows), 'skipped' => $skipped];
    }

    // ---- making and changing --------------------------------------------------------------------------------------------------------------------

    /** Lists kept so far, the ones in the bin included: only deleting for good frees a place. */
    public function used(): int
    {
        return PriceList::withTrashed()->count();
    }

    public function assertRoom(): void
    {
        $max = $this->settings->get()['max_price_lists'];
        if ($this->used() >= $max) {
            throw new BooksException("The shop keeps at most {$max} price lists and that many are kept. Download an old list as a zip, add it to the Archive, then delete it for good to make room. Or ask an admin to raise the limit in Settings.");
        }
    }

    /** @return array{list:PriceList,skipped:int} */
    public function create(array $d, User $by): array
    {
        if (! self::canCreate($by)) {
            throw new BooksException('You cannot make price lists.');
        }
        $this->assertRoom();
        [$access, $types] = Audience::clean($d['access'] ?? null, $d['customer_types'] ?? null);
        $picks = $this->cleanPicks($d['picks'] ?? []);
        if (! $picks) {
            throw new BooksException('Choose what goes on the list.');
        }
        $earlier = in_array($d['earlier_price'] ?? null, CatalogueSettings::EARLIER, true) ? $d['earlier_price'] : $this->settings->get()['earlier_price'];

        $res = DB::transaction(function () use ($d, $by, $access, $types, $picks, $earlier) {
            $l = PriceList::create(['name' => trim((string) $d['name']), 'description' => $d['description'] ?? null, 'status' => 'draft', 'active_from' => $d['active_from'] ?? null, 'access' => $access, 'customer_types' => $types,
                'earlier_price' => $earlier, 'as_at' => now(), 'picks' => $picks, 'created_by' => $by->id]);
            $snap = $this->snapshot($l);

            return ['list' => $l, 'skipped' => $snap['skipped']];
        });
        $l = $res['list'];
        if (! empty($d['publish'])) {
            $this->publish($l, $by);
        } else {
            $this->draftTask($l, $by);
        }

        return ['list' => $l->fresh(), 'skipped' => $res['skipped']];
    }

    private function cleanPicks($picks): array
    {
        $ok = ['product', 'service', 'category', 'brand', 'service_category', 'all_products', 'all_services'];

        return collect(is_array($picks) ? $picks : [])->filter(fn ($p) => is_array($p) && in_array($p['type'] ?? null, $ok, true))
            ->map(fn ($p) => ['type' => $p['type'], 'id' => isset($p['id']) ? (int) $p['id'] : null, 'label' => isset($p['label']) ? mb_substr((string) $p['label'], 0, 120) : null])->values()->all();
    }

    public function update(PriceList $l, array $d, User $by): PriceList
    {
        if (! self::canEdit($by, $l)) {
            throw new BooksException($l->status === 'draft' ? 'You can only change your own drafts.' : 'You do not have the permission to change a list that is already published.');
        }
        $fields = [];
        foreach (['name', 'description', 'active_from', 'earlier_price'] as $k) {
            if (array_key_exists($k, $d)) {
                $fields[$k] = $d[$k];
            }
        }
        if (isset($fields['earlier_price']) && ! in_array($fields['earlier_price'], CatalogueSettings::EARLIER, true)) {
            unset($fields['earlier_price']);
        }
        if (isset($fields['name'])) {
            $fields['name'] = trim((string) $fields['name']);
        }
        if (array_key_exists('access', $d)) {
            [$fields['access'], $fields['customer_types']] = Audience::clean($d['access'], $d['customer_types'] ?? null);
        }
        $l->update($fields);

        return $l->fresh();
    }

    /** Take the prices again, for a draft only. */
    public function refresh(PriceList $l, User $by): array
    {
        if ($l->status !== 'draft' || ! self::canEdit($by, $l)) {
            throw new BooksException('Only a draft can have its prices taken again.');
        }

        return $this->snapshot($l);
    }

    // ---- publishing -----------------------------------------------------------------------------------------------------------------------------

    /** Draft to published (publishers), or to waiting for activation (a sales rep). */
    public function publish(PriceList $l, User $by): PriceList
    {
        if ($l->status !== 'draft') {
            throw new BooksException('Only a draft can be published.');
        }
        if (! self::canEdit($by, $l)) {
            throw new BooksException('You can only publish your own drafts.');
        }
        if (! $l->items()->exists()) {
            throw new BooksException('The list has no lines.');
        }
        $this->clearTasks($l);
        if (self::canPublish($by)) {
            $l->update(['status' => 'published', 'published_by' => $by->id, 'published_at' => now(), 'submitted_at' => null]);

            return $l->fresh();
        }
        $approvers = $this->activators((int) $l->created_by);
        if (! $approvers) {
            throw new BooksException('There is nobody who can activate it yet. Ask an admin to set your manager.');
        }
        $l->update(['status' => 'pending', 'submitted_at' => now()]);
        foreach ($approvers as $a) {
            $this->calendar->put(['user_id' => $a->id, 'source_type' => self::ACTIVATE_TASK, 'source_id' => $l->id, 'kind' => 'approval', 'title' => "Activate {$by->name}'s price list \"{$l->name}\"",
                'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => 'pending', 'visibility' => 'staff', 'url' => "/admin/price-lists/{$l->id}", 'meta' => ['price_list_id' => $l->id, 'author' => $by->name]]);
        }

        return $l->fresh();
    }

    /** The author's manager (if they can publish), otherwise every admin and super admin. @return User[] */
    public function activators(int $authorId): array
    {
        $manager = Employee::where('user_id', $authorId)->first()?->manager?->user;
        if ($manager && self::canPublish($manager) && (int) $manager->id !== $authorId) {
            return [$manager];
        }

        return User::withPermission('catalogue.purge')->where('id', '!=', $authorId)->get()->all();
    }

    /** Someone other than the author makes a waiting list live. */
    public function activate(PriceList $l, User $by): PriceList
    {
        if ($l->status !== 'pending') {
            throw new BooksException('This list is not waiting for activation.');
        }
        if (! self::canPublish($by)) {
            throw new BooksException('You do not have the permission to activate a list.');
        }
        if ((int) $l->created_by === (int) $by->id) {
            throw new BooksException('Someone else has to activate your list.');
        }
        $l->update(['status' => 'published', 'published_by' => $by->id, 'published_at' => now(), 'submitted_at' => null]);
        $this->clearTasks($l);

        return $l->fresh();
    }

    /** Back to a draft: the author takes back a waiting list, or a publisher takes a list off. */
    public function withdraw(PriceList $l, User $by): PriceList
    {
        $own = (int) $l->created_by === (int) $by->id;
        if ($l->status === 'pending' && ! $own && ! self::canPublish($by)) {
            throw new BooksException('Only the author or a publisher can do this.');
        }
        if ($l->status === 'published' && ! self::canPublish($by)) {
            throw new BooksException('You do not have the permission to take a published list off.');
        }
        if ($l->status === 'draft') {
            throw new BooksException('It is already a draft.');
        }
        $this->clearTasks($l);
        $l->update(['status' => 'draft', 'submitted_at' => null, 'published_by' => null, 'published_at' => null]);
        $this->draftTask($l, $by);

        return $l->fresh();
    }

    // ---- the bin --------------------------------------------------------------------------------------------------------------------------------

    private function canBin(User $by, PriceList $l): bool
    {
        return self::canPublish($by) || (self::canCreate($by) && (int) $l->created_by === (int) $by->id && $l->status !== 'published');
    }

    public function trash(PriceList $l, User $by): void
    {
        if (! $this->canBin($by, $l)) {
            throw new BooksException('You cannot delete this list.');
        }
        $this->clearTasks($l);
        $l->delete();
    }

    public function restore(PriceList $l, User $by): PriceList
    {
        if (! $this->canBin($by, $l)) {
            throw new BooksException('You cannot restore this list.');
        }
        $l->restore();
        if ($l->status === 'draft') {
            $this->draftTask($l, $by);
        }

        return $l->fresh();
    }

    /** Gone for good: admin and super admin, from the bin. */
    public function purge(PriceList $l, User $by): void
    {
        if (! self::canPurge($by)) {
            throw new BooksException('You do not have the permission to delete a list for good.');
        }
        if (! $l->trashed()) {
            throw new BooksException('Delete it first, then delete it for good from the bin.');
        }
        $this->clearTasks($l);
        DB::transaction(function () use ($l) {
            PriceListItem::where('price_list_id', $l->id)->delete();
            $l->forceDelete();
        });
    }

    // ---- calendar -------------------------------------------------------------------------------------------------------------------------------

    private function draftTask(PriceList $l, User $by): void
    {
        $this->clearTasks($l);
        if ($l->status !== 'draft' || ! $l->created_by) {
            return;
        }
        $this->calendar->put(['user_id' => $l->created_by, 'source_type' => self::DRAFT_TASK, 'source_id' => $l->id, 'kind' => 'task', 'title' => "Finish and publish the price list \"{$l->name}\"",
            'starts_at' => now()->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => 'pending', 'visibility' => 'staff', 'url' => "/admin/price-lists/{$l->id}", 'meta' => ['price_list_id' => $l->id]]);
    }

    private function clearTasks(PriceList $l): void
    {
        $this->calendar->remove(self::DRAFT_TASK, $l->id);
        $this->calendar->remove(self::ACTIVATE_TASK, $l->id);
    }

    // ---- reading --------------------------------------------------------------------------------------------------------------------------------

    /**
     * The most recent live price list this viewer may see that holds the item, with that item's lines. Null when there is none, so the caller falls back to the live price.
     * @return array{list:PriceList,lines:\Illuminate\Support\Collection}|null
     */
    public function latestFor(string $type, int $id, ?User $viewer): ?array
    {
        try {
            $q = PriceList::query()->live()->whereHas('items', fn ($i) => $i->where('item_type', $type)->where('item_id', $id))
                ->orderByRaw('COALESCE(active_from, published_at, created_at) DESC')->orderByDesc('id');
            $list = Audience::scope($q, $viewer)->first();
            if (! $list) {
                return null;
            }

            return ['list' => $list, 'lines' => PriceListItem::where('price_list_id', $list->id)->where('item_type', $type)->where('item_id', $id)->orderBy('position')->get()];
        } catch (\Throwable) {
            return null;
        }
    }

    /** The earlier price a line shows under the list's rule: the amount struck through, or the "was" note. @return array{strike:?float,was:?float,up_percent:?float} */
    public static function earlier(PriceListItem|array $x, string $rule): array
    {
        $price = (float) (is_array($x) ? $x['price'] : $x->price);
        $orig = is_array($x) ? ($x['original_price'] ?? null) : $x->original_price;
        $none = ['strike' => null, 'was' => null, 'up_percent' => null];
        if ($orig === null || (float) $orig <= 0 || (float) $orig == $price || $rule === 'never') {
            return $none;
        }
        $orig = (float) $orig;
        if ($orig > $price) {
            return ['strike' => $orig, 'was' => null, 'up_percent' => null];
        }

        return $rule === 'both' ? ['strike' => null, 'was' => $orig, 'up_percent' => round(($price - $orig) / $orig * 100, 1)] : $none;
    }

    // ---- downloads ------------------------------------------------------------------------------------------------------------------------------

    public function csv(PriceList $l): string
    {
        $h = fopen('php://temp', 'r+');
        fputcsv($h, ['Code', 'Item', 'Variant', 'Unit', 'Category', 'Currency', 'Price excl. tax', 'Earlier price', 'Tax', 'Tax rate %', 'Tax amount', 'Total incl. tax']);
        foreach ($l->items as $x) {
            fputcsv($h, [$x->code, $x->name, $x->variant, $x->unit, $x->category, $x->currency_code, $x->price, $x->original_price, $x->tax_name, $x->tax_percent, $x->tax_amount, $x->total]);
        }
        rewind($h);
        $out = stream_get_contents($h);
        fclose($h);

        return "\xEF\xBB\xBF" . $out;
    }

    /** A neutral, readable layout of the list: no ids and nothing that shows how the shop stores things. */
    public function json(PriceList $l): array
    {
        return [
            'title' => $l->name, 'prices_as_at' => $l->as_at?->toIso8601String(), 'prices_exclude_tax' => true, 'currency_note' => "Each price is in its item's own currency.",
            'items' => $l->items->map(fn ($x) => [
                'code' => $x->code, 'name' => $x->name, 'variant' => $x->variant, 'unit' => $x->unit, 'category' => $x->category, 'currency' => $x->currency_code,
                'price_excluding_tax' => $x->price, 'earlier_price' => $x->original_price, 'tax' => $x->tax_name, 'tax_rate_percent' => $x->tax_percent, 'tax_amount' => $x->tax_amount, 'total_including_tax' => $x->total,
            ])->values()->all(),
        ];
    }
}
