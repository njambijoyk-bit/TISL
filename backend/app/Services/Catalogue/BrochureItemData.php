<?php

namespace App\Services\Catalogue;

use App\Models\Auction;
use App\Models\BrochureItemMeta;
use App\Models\Hamper;
use App\Models\Product;
use App\Models\Service;
use App\Models\User;

/**
 * Everything one brochure entry shows, as plain data: its details, its prices (from the most recent price list the viewer can see, stamped "as of that list and
 * date", otherwise the live price stamped with today), and the sections it is drawn with (this entry's choice, else the item's own, else the type default).
 * The website draws it. An item a customer may not see is simply not returned.
 */
class BrochureItemData
{
    public function __construct(private PriceLines $lines, private PriceListService $lists, private CatalogueSettings $settings) {}

    private const MODELS = ['product' => Product::class, 'service' => Service::class, 'hamper' => Hamper::class, 'auction' => Auction::class];

    /** The item's own brochure settings, or null. */
    public function itemMeta(string $type, $item): ?array
    {
        if ($type === 'product') {
            return $item->brochure_meta ?: null;
        }
        try {
            return BrochureItemMeta::where('item_type', $type)->where('item_id', $item->id)->first()?->meta;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Is this item something a customer may see? Staff see every item. */
    private function visible(string $type, $item, ?User $viewer): bool
    {
        if (Audience::isStaff($viewer)) {
            return true;
        }

        return match ($type) {
            'product' => $item->status === 'active' && $item->is_visible && $item->is_for_sale,
            'service' => $item->status === 'active' && $item->is_visible && $item->is_available,
            'hamper' => $item->status === 'active' && $item->is_visible,
            'auction' => in_array($item->status, ['active', 'scheduled'], true),
            default => false,
        };
    }

    private function load(string $type, int $id)
    {
        $cls = self::MODELS[$type] ?? null;

        return $cls ? $cls::find($id) : null;
    }

    /** @return array<string,mixed>|null null when the item does not exist, is hidden from this viewer, or has its brochure switched off (for a customer) */
    public function build(string $type, int $id, ?User $viewer, ?array $entry = null, bool $forCustomer = true): ?array
    {
        $item = $this->load($type, $id);
        if (! $item || ! $this->visible($type, $item, $viewer)) {
            return null;
        }
        $own = $this->itemMeta($type, $item);
        if ($forCustomer && $own && array_key_exists('enabled', $own) && ! $own['enabled'] && ! Audience::isStaff($viewer)) {
            return null;
        }
        $base = match ($type) {
            'product' => $this->product($item),
            'service' => $this->service($item),
            'hamper' => $this->hamper($item),
            'auction' => $this->auction($item),
        };
        $resolved = BrochureSections::resolve($type, $entry, $own, $this->settings->get()['brochure_defaults']);
        $price = $this->prices($type, $item, $viewer);
        if ($type === 'service') {
            $price['lines'] = $this->withBranches($item, $price['lines']);
        }
        $extra = $type === 'auction' ? ['payable' => $this->payable($item, $viewer)] : [];

        return $base + ['type' => $type, 'id' => $item->id, 'sections' => $resolved['sections'], 'sections_from' => $resolved['source']] + $price + $extra;
    }

    /** Each package line told where it is offered: the branches of the people who do that package (the same answer the booking page gives). */
    private function withBranches(Service $s, array $lines): array
    {
        try {
            $book = app(\App\Services\Booking\BookingService::class);
            $ids = $s->variants()->active()->pluck('id', 'name');
            $whole = array_column($book->branchesFor($s, null), 'name');
            $by = [];
            foreach ($ids as $name => $vid) {
                $by[$name] = array_column($book->branchesFor($s, (int) $vid), 'name');
            }
        } catch (\Throwable) {
            return $lines;
        }

        return array_map(fn ($l) => $l + ['branches' => $by[$l['variant'] ?? ''] ?? $whole], $lines);
    }

    /** What the customer pays if they win at the current price: the bid, its tax, each charge, the tax on the charges, and the total, as the auction page shows it. */
    private function payable(Auction $a, ?User $viewer): ?array
    {
        try {
            $bid = max((float) ($a->current_price ?: 0), (float) $a->start_price);
            $q = app(\App\Services\Books\AuctionChargeService::class)->quote($a, $bid, 0, $viewer?->customer);
        } catch (\Throwable) {
            return null;
        }
        $rows = [['label' => 'Winning bid', 'amount' => (float) $q['bid']['net']]];
        if (($q['bid']['tax'] ?? 0) > 0) {
            $rows[] = ['label' => (string) ($q['bid']['label'] ?? 'Tax'), 'amount' => (float) $q['bid']['tax']];
        }
        foreach ($q['lines'] as $l) {
            $rows[] = ['label' => (string) $l['name'], 'amount' => (float) $l['net']];
        }
        $chargeTax = array_sum(array_column($q['lines'], 'tax'));
        if ($chargeTax > 0) {
            $rows[] = ['label' => 'Tax on charges', 'amount' => round($chargeTax, 2)];
        }
        $a->loadMissing('currency:id,code,symbol');

        return ['bid' => $bid, 'rows' => $rows, 'payable' => (float) $q['totals']['payable'], 'currency_code' => $a->currency?->code, 'currency_symbol' => $a->currency?->symbol,
            'upfront' => array_map(fn ($u) => ['label' => (string) $u['name'], 'amount' => (float) $u['gross']], $q['upfront'])];
    }

    /** The extra charges a service carries (a deposit, a surcharge, a service charge...), with when each applies. */
    private function charges(Service $s): array
    {
        try {
            $rows = app(\App\Services\Books\ServiceFeeService::class)->forService($s);
        } catch (\Throwable) {
            return [];
        }
        $when = ['always' => '', 'onsite' => 'on-site visits', 'urgent' => 'urgent bookings', 'after_hours' => 'outside normal hours', 'group' => 'larger groups'];

        return collect($rows)->filter(fn ($r) => ! empty($r['is_enabled']) && ($r['amount'] ?? null) !== null)->map(fn ($r) => [
            'name' => (string) $r['ledger']['name'], 'amount' => (float) $r['amount'], 'basis' => $r['basis'] ?? 'fixed', 'unit' => $r['unit'] ?? '', 'refundable' => (bool) ($r['refundable'] ?? false),
            'when' => $when[$r['condition'] ?? 'always'] ?? '',
        ])->values()->all();
    }

    private function abs(?string $u): ?string
    {
        return $u ? (str_starts_with($u, 'http') || str_starts_with($u, 'data:') ? $u : asset($u)) : null;
    }

    private function strings($v): array
    {
        return collect(is_array($v) ? $v : [])->map(fn ($x) => trim(is_array($x) ? (string) ($x['text'] ?? $x['name'] ?? '') : (string) $x))->filter()->values()->all();
    }

    /** specifications arrive as name => value or as a list of {name,value} */
    private function specs($v): array
    {
        $out = [];
        foreach (is_array($v) ? $v : [] as $k => $x) {
            if (is_array($x)) {
                $label = trim((string) ($x['name'] ?? $x['label'] ?? $x['key'] ?? ''));
                $val = trim((string) ($x['value'] ?? ''));
            } else {
                $label = is_string($k) ? trim($k) : '';
                $val = trim((string) $x);
            }
            if ($label !== '' && $val !== '') {
                $out[] = ['label' => $label, 'value' => $val];
            }
        }

        return $out;
    }

    private function images($main, array $others): array
    {
        return collect([$main])->merge($others)->filter()->map(fn ($u) => $this->abs((string) $u))->filter()->unique()->take(8)->values()->all();
    }

    private function product(Product $p): array
    {
        $p->loadMissing(['brand:id,name', 'category:id,name']);
        $first = $p->productVariants()->where('status', 'active')->orderByDesc('is_default')->first();

        return [
            'name' => $p->name, 'tagline' => $p->brand?->name, 'category' => $p->category?->name, 'brand' => $p->brand?->name,
            'short' => (string) $p->short_description, 'description' => (string) $p->description,
            'features' => $this->strings($p->features), 'specs' => $this->specs($p->specifications),
            'images' => $this->images($p->main_image ? $p->main_image_url : null, (array) ($p->images ? $p->image_urls : [])), 'sku' => $p->sku, 'barcode' => $first?->barcode,
            'url' => url('/products/' . $p->id),
        ];
    }

    private function service(Service $s): array
    {
        $s->loadMissing('category:id,name');

        return [
            'name' => $s->name, 'tagline' => $s->category?->name, 'category' => $s->category?->name, 'brand' => null,
            'short' => (string) $s->short_description, 'description' => (string) $s->description,
            'features' => $this->strings($s->features), 'specs' => [], 'charges' => $this->charges($s),
            'images' => $this->images($s->main_image ? $s->main_image_url : null, (array) ($s->images_url ?? [])), 'sku' => $s->sku, 'barcode' => null,
            'url' => url('/services/' . $s->id),
        ];
    }

    private function hamper(Hamper $h): array
    {
        $inside = $h->items()->with('product:id,name')->get()->map(fn ($i) => ['name' => $i->snapshot['name'] ?? $i->product?->name ?? 'Item', 'quantity' => (int) $i->quantity,
            'image' => $this->abs($i->snapshot['image'] ?? null)])->values()->all();

        return [
            'name' => $h->name, 'tagline' => 'Gift hamper', 'category' => 'Hamper', 'brand' => null,
            'short' => '', 'description' => (string) $h->description, 'features' => [], 'specs' => [],
            'images' => $this->images($h->cover_image, []), 'sku' => null, 'barcode' => null,
            'inside' => $inside, 'stock_left' => $h->stock_remaining, 'valid_from' => $h->valid_from?->toDateString(), 'valid_until' => $h->valid_until?->toDateString(),
            'url' => url('/hampers/' . $h->id),
        ];
    }

    private function auction(Auction $a): array
    {
        $a->loadMissing(['product:id,name,description,short_description,main_image,images', 'currency:id,code,symbol']);
        $p = $a->product;

        return [
            'name' => $p?->name ?? 'Auction lot', 'tagline' => 'Auction', 'category' => 'Auction', 'brand' => null,
            'short' => (string) $p?->short_description, 'description' => (string) $p?->description, 'features' => [], 'specs' => [],
            'images' => $p ? $this->images($p->main_image ? $p->main_image_url : null, (array) ($p->images ? $p->image_urls : [])) : [], 'sku' => null, 'barcode' => null,
            'auction' => ['start_price' => (float) $a->start_price, 'bid_increment' => (float) $a->bid_increment, 'current_price' => (float) ($a->current_price ?: $a->start_price),
                'starts' => $a->start_time?->toIso8601String(), 'ends' => $a->end_time?->toIso8601String(), 'status' => $a->status, 'currency_code' => $a->currency?->code, 'currency_symbol' => $a->currency?->symbol],
            'url' => url('/auctions/' . $a->id),
        ];
    }

    /** Lines and where they came from. Products and services follow the latest price list; hampers and auctions have none, so they are live. */
    private function prices(string $type, $item, ?User $viewer): array
    {
        $rule = 'discounts';
        if (in_array($type, ['product', 'service'], true) && ($hit = $this->lists->latestFor($type, $item->id, $viewer))) {
            $rule = $hit['list']->earlier_price;
            $lines = $hit['lines']->map(fn ($x) => $this->shape($x->toArray(), $rule))->values()->all();
            if ($lines) {
                return ['lines' => $lines, 'price_source' => ['kind' => 'list', 'name' => $hit['list']->name, 'as_at' => ($hit['list']->active_from ?? $hit['list']->published_at ?? $hit['list']->as_at)?->toDateString()]];
            }
        }
        try {
            $raw = match ($type) {
                'product' => $this->lines->forProduct($item),
                'service' => $this->lines->forService($item),
                'hamper' => $this->lines->forHamper($item),
                'auction' => $this->lines->forAuction($item),
            };
        } catch (\Throwable) {
            $raw = [];
        }

        return ['lines' => array_map(fn ($x) => $this->shape($x, $rule), $raw), 'price_source' => ['kind' => 'live', 'name' => null, 'as_at' => now()->toDateString()]];
    }

    private function shape(array $x, string $rule): array
    {
        $e = PriceListService::earlier($x, $rule);

        return ['variant' => $x['variant'] ?? null, 'unit' => $x['unit'] ?? null, 'code' => $x['code'] ?? null, 'currency_code' => $x['currency_code'] ?? '', 'currency_symbol' => $x['currency_symbol'] ?? null,
            'price' => (float) $x['price'], 'strike' => $e['strike'], 'was' => $e['was'], 'up_percent' => $e['up_percent'],
            'tax_name' => $x['tax_name'] ?? null, 'tax_percent' => $x['tax_percent'] ?? null, 'tax_amount' => (float) ($x['tax_amount'] ?? 0), 'total' => (float) $x['total']];
    }
}
