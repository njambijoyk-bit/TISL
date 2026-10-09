<?php

namespace App\Services\Campaigns;

use App\Models\Auction;
use App\Models\Hamper;
use App\Models\CampaignItem;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Service;
use App\Models\ServiceVariant;
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
     * Live details for a list of featured items, keyed "type:id" (whole item) or "product:id:vVARIANT" (one option of a product). Something that no longer
     * exists, or an option that was removed or switched off, comes back with available = false.
     * @param array<int,array{item_type:string,item_id:int,variant_id?:int}> $items
     */
    public function describe(array $items): array
    {
        $out = [];
        $items = array_map(fn ($i) => $i + ['variant_id' => 0], $items);
        $by = collect($items)->groupBy('item_type');
        $codes = ($this->active() && $items) ? $this->currencies() : collect();
        $want = fn (string $t) => $by->get($t, collect())->where('variant_id', 0)->pluck('item_id')->unique()->values()->all();

        if ($this->active()) {
            foreach ($want('product') ? Product::whereIn('id', $want('product'))->get() : [] as $p) {
                $out["product:{$p->id}"] = $this->row('product', $p->id, $p->name, $p->sku, $p->main_image_url, $p->price, $codes[$p->currency_id] ?? null, "/products/{$p->id}" . ($p->sku ? '-' . $p->sku : ''));
            }
            foreach ($this->describeVariants($by->get('product', collect())->where('variant_id', '>', 0)->pluck('variant_id')->unique()->values()->all(), $codes) as $k => $r) {
                $out[$k] = $r;
            }
            foreach ($this->describeServiceVariants($by->get('service', collect())->where('variant_id', '>', 0)->pluck('variant_id')->unique()->values()->all(), $codes) as $k => $r) {
                $out[$k] = $r;
            }
            foreach ($want('service') ? Service::whereIn('id', $want('service'))->get() : [] as $s) {
                $out["service:{$s->id}"] = $this->row('service', $s->id, $s->name, $s->sku, $s->main_image_url, $s->base_price, $codes[$s->currency_id] ?? null, "/services/{$s->id}" . ($s->sku ? '-' . $s->sku : ''));
            }
            foreach ($want('hamper') ? Hamper::whereIn('id', $want('hamper'))->get() : [] as $h) {
                $out["hamper:{$h->id}"] = $this->row('hamper', $h->id, $h->name, null, $h->cover_image, $h->price, $codes[$h->currency_id] ?? null, "/hampers/{$h->slug}");
            }
            foreach ($want('auction') ? Auction::with('product')->whereIn('id', $want('auction'))->get() : [] as $a) {
                $sku = $a->product?->sku;
                $out["auction:{$a->id}"] = $this->row('auction', $a->id, $a->product?->name ?? "Auction #{$a->id}", $sku, $a->product?->main_image_url, $a->current_price, $codes[$a->currency_id] ?? null, "/auctions/{$a->id}" . ($sku ? '-' . $sku : ''));
            }
        }
        foreach ($items as $i) {   // anything not found (deleted, switched off, or E-commerce off)
            $key = CampaignItem::keyOf($i['item_type'], (int) $i['item_id'], (int) $i['variant_id']);
            $out[$key] ??= ['key' => $key, 'type' => $i['item_type'], 'id' => (int) $i['item_id'], 'variant_id' => (int) $i['variant_id'], 'name' => null, 'sku' => null, 'image' => null, 'price' => null, 'currency' => null, 'link' => null, 'available' => false];
        }

        return $out;
    }

    /** One row per featured option: the product's name with the option's, the option's own price, photo and SKU, and a link that opens the product with that option chosen. */
    private function describeVariants(array $variantIds, $codes): array
    {
        if (! $variantIds) {
            return [];
        }
        $out = [];
        $images = ProductImage::whereIn('variant_id', $variantIds)->orderBy('position')->get(['variant_id', 'path'])->unique('variant_id')->keyBy('variant_id');
        foreach (ProductVariant::active()->with(['product', 'units'])->whereIn('id', $variantIds)->get() as $v) {
            $p = $v->product;
            if (! $p) {
                continue;
            }
            $out[CampaignItem::keyOf('product', $p->id, $v->id)] = $this->row('product', $p->id, $p->name, $v->sku ?: $p->sku, $images[$v->id]->path ?? $p->main_image_url, $this->variantPrice($v) ?? $p->price,
                $codes[$p->currency_id] ?? null, "/products/{$p->id}" . ($p->sku ? '-' . $p->sku : '') . "?variant={$v->id}") + [
                'variant_id' => $v->id, 'variant' => $this->variantLabel($v, $p->name), 'in_stock' => (float) $v->stock_quantity > 0,
            ];
        }

        return $out;
    }

    /** One row per featured package of a service: the service's name with the package's, the package's own price, and a link that opens the service with that package chosen. */
    private function describeServiceVariants(array $variantIds, $codes): array
    {
        if (! $variantIds) {
            return [];
        }
        $out = [];
        foreach (ServiceVariant::active()->with('service')->whereIn('id', $variantIds)->get() as $v) {
            $s = $v->service;
            if (! $s) {
                continue;
            }
            $out[CampaignItem::keyOf('service', $s->id, $v->id)] = $this->row('service', $s->id, $s->name, $s->sku, $s->main_image_url, $v->price ?? $s->base_price, $codes[$s->currency_id] ?? null,
                "/services/{$s->id}" . ($s->sku ? '-' . $s->sku : '') . "?variant={$v->id}") + ['variant_id' => $v->id, 'variant' => trim((string) $v->name) !== '' ? trim($v->name) : "Package {$v->id}"];
        }

        return $out;
    }

    /** What the option sells for: its base unit's price, else the first unit that has one. */
    private function variantPrice(ProductVariant $v): ?float
    {
        $unit = $v->units->firstWhere('role', 'base');
        $price = $unit?->price ?? $v->units->first(fn ($u) => $u->price !== null)?->price;

        return $price !== null ? (float) $price : null;
    }

    private function variantLabel(ProductVariant $v, string $productName): string
    {
        $n = trim((string) $v->name);

        return $n !== '' && $n !== $productName ? $n : ($v->sku ?: "Option {$v->id}");
    }

    /**
     * The options of a product, or the packages of a service, that can be featured on their own, for the picker.
     * @return array<int,array{variant_id:int,variant:string,sku:?string,price:?float,image:?string,in_stock:?bool,is_default:bool}>
     */
    public function variants(int $id, string $type = 'product'): array
    {
        if (! $this->active()) {
            return [];
        }
        if ($type === 'service') {
            $service = Service::find($id);

            return ! $service ? [] : ServiceVariant::active()->where('service_id', $id)->orderByDesc('is_default')->orderBy('position')->orderBy('id')->get()->map(fn ($v) => [
                'variant_id' => $v->id, 'variant' => trim((string) $v->name) !== '' ? trim($v->name) : "Package {$v->id}", 'sku' => null,
                'price' => $v->price !== null ? (float) $v->price : ($service->base_price !== null ? (float) $service->base_price : null), 'image' => null, 'in_stock' => null, 'is_default' => (bool) $v->is_default,
            ])->values()->all();
        }
        $product = Product::find($id);
        if (! $product) {
            return [];
        }
        $variants = ProductVariant::active()->with('units')->where('product_id', $id)->orderByDesc('is_default')->orderBy('id')->get();
        $images = ProductImage::whereIn('variant_id', $variants->pluck('id'))->orderBy('position')->get(['variant_id', 'path'])->unique('variant_id')->keyBy('variant_id');

        return $variants->map(fn ($v) => [
            'variant_id' => $v->id, 'variant' => $this->variantLabel($v, $product->name), 'sku' => $v->sku, 'price' => $this->variantPrice($v) ?? ($product->price !== null ? (float) $product->price : null),
            'image' => $images[$v->id]->path ?? null, 'in_stock' => (float) $v->stock_quantity > 0, 'is_default' => (bool) $v->is_default,
        ])->values()->all();
    }

    private function row(string $type, int $id, ?string $name, ?string $sku, ?string $image, $price, ?string $currency, string $link): array
    {
        return ['key' => "{$type}:{$id}", 'type' => $type, 'id' => $id, 'variant_id' => 0, 'name' => $name, 'sku' => $sku, 'image' => $image, 'price' => $price !== null ? (float) $price : null, 'currency' => $currency, 'link' => $link, 'available' => true];
    }
}
