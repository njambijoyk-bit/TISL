<?php

namespace App\Services\Campaigns;

use App\Models\Auction;
use App\Models\Hamper;
use App\Models\Product;
use App\Models\Service;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;

/**
 * How Campaigns reads what a campaign features (products, services, hampers, auctions). It lives here, not in E-commerce, so E-commerce knows
 * nothing about Campaigns. With E-commerce off it offers nothing and describes nothing. Names, prices and pictures are always read live.
 */
class CatalogueAdapter
{
    public function __construct(private LicenseManager $license) {}

    public function active(): bool
    {
        return $this->license->isActive('ecommerce');
    }

    /** @return string[] the kinds of item that can be featured right now */
    public function types(): array
    {
        return $this->active() ? ['product', 'service', 'hamper', 'auction'] : [];
    }

    private function currencies()
    {
        return DB::table('currencies')->pluck('code', 'id');
    }

    /** Search by name (or SKU) for the picker. */
    public function search(string $type, string $q, int $limit = 12): array
    {
        if (! in_array($type, $this->types(), true)) {
            return [];
        }
        $like = '%' . $q . '%';
        $ids = match ($type) {
            'product' => Product::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))->orderBy('name')->limit($limit)->pluck('id'),
            'service' => Service::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))->orderBy('name')->limit($limit)->pluck('id'),
            'hamper' => Hamper::where('name', 'like', $like)->orderBy('name')->limit($limit)->pluck('id'),
            'auction' => Auction::whereHas('product', fn ($p) => $p->where('name', 'like', $like)->orWhere('sku', 'like', $like))->orderByDesc('id')->limit($limit)->pluck('id'),
        };
        $rows = $this->describe($ids->map(fn ($id) => ['item_type' => $type, 'item_id' => $id])->all());

        return array_values($rows);
    }

    /**
     * Live details for a list of featured items, keyed "type:id". An item that no longer exists comes back with available = false.
     * @param array<int,array{item_type:string,item_id:int}> $items
     */
    public function describe(array $items): array
    {
        $out = [];
        $by = collect($items)->groupBy('item_type');
        $codes = ($this->active() && $items) ? $this->currencies() : collect();
        $want = fn (string $t) => $by->get($t, collect())->pluck('item_id')->unique()->values()->all();

        if ($this->active()) {
            foreach (Product::whereIn('id', $want('product'))->get() as $p) {
                $out["product:{$p->id}"] = $this->row('product', $p->id, $p->name, $p->sku, $p->main_image_url, $p->price, $codes[$p->currency_id] ?? null, "/products/{$p->id}" . ($p->sku ? '-' . $p->sku : ''));
            }
            foreach (Service::whereIn('id', $want('service'))->get() as $s) {
                $out["service:{$s->id}"] = $this->row('service', $s->id, $s->name, $s->sku, $s->main_image_url, $s->base_price, $codes[$s->currency_id] ?? null, "/services/{$s->id}" . ($s->sku ? '-' . $s->sku : ''));
            }
            foreach (Hamper::whereIn('id', $want('hamper'))->get() as $h) {
                $out["hamper:{$h->id}"] = $this->row('hamper', $h->id, $h->name, null, $h->cover_image, $h->price, $codes[$h->currency_id] ?? null, "/hampers/{$h->slug}");
            }
            foreach (Auction::with('product')->whereIn('id', $want('auction'))->get() as $a) {
                $sku = $a->product?->sku;
                $out["auction:{$a->id}"] = $this->row('auction', $a->id, $a->product?->name ?? "Auction #{$a->id}", $sku, $a->product?->main_image_url, $a->current_price, $codes[$a->currency_id] ?? null, "/auctions/{$a->id}" . ($sku ? '-' . $sku : ''));
            }
        }
        foreach ($items as $i) {   // anything not found (deleted, or E-commerce off)
            $key = "{$i['item_type']}:{$i['item_id']}";
            $out[$key] ??= ['key' => $key, 'type' => $i['item_type'], 'id' => (int) $i['item_id'], 'name' => null, 'sku' => null, 'image' => null, 'price' => null, 'currency' => null, 'link' => null, 'available' => false];
        }

        return $out;
    }

    private function row(string $type, int $id, ?string $name, ?string $sku, ?string $image, $price, ?string $currency, string $link): array
    {
        return ['key' => "{$type}:{$id}", 'type' => $type, 'id' => $id, 'name' => $name, 'sku' => $sku, 'image' => $image, 'price' => $price !== null ? (float) $price : null, 'currency' => $currency, 'link' => $link, 'available' => true];
    }
}
