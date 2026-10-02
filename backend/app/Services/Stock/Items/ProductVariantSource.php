<?php

namespace App\Services\Stock\Items;

use Illuminate\Support\Facades\DB;

/** Products: a stocked item is a product variant; its group is the product's category. */
class ProductVariantSource implements StockItemSource
{
    public const TYPE = 'product_variant';

    public function type(): string
    {
        return self::TYPE;
    }

    public function label(): string
    {
        return 'Products';
    }

    public function describe(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $out = [];
        foreach (array_chunk(array_values(array_unique($ids)), 500) as $chunk) {
            $rows = DB::table('product_variants as pv')
                ->join('products as p', 'p.id', '=', 'pv.product_id')
                ->leftJoin('categories as c', 'c.id', '=', 'p.category_id')
                ->leftJoin('currencies as cu', 'cu.id', '=', 'p.currency_id')
                ->leftJoin('product_variant_units as u', fn ($j) => $j->on('u.variant_id', '=', 'pv.id')->where('u.role', 'base'))
                ->leftJoin('units_of_measure as um', 'um.id', '=', 'u.unit_id')
                ->whereIn('pv.id', $chunk)
                ->get(['pv.id', 'pv.sku', 'pv.name as variant', 'p.id as product_id', 'p.name as product', 'c.name as category', 'u.price', 'cu.code as currency', 'um.code as unit']);
            foreach ($rows as $r) {
                $standard = in_array(strtolower((string) $r->variant), ['', 'standard', 'default'], true);
                $out[(int) $r->id] = [
                    'name' => $standard ? $r->product : "{$r->product} — {$r->variant}", 'sku' => $r->sku, 'group' => $r->category ?: 'Uncategorised',
                    'unit' => $r->unit, 'sale_price' => $r->price !== null ? (float) $r->price : null, 'currency' => $r->currency, 'url' => "/admin/products/{$r->product_id}/edit",
                ];
            }
        }

        return $out;
    }

    public function search(string $q, int $limit = 500): array
    {
        return DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->where(fn ($w) => $w->where('p.name', 'like', "%{$q}%")->orWhere('pv.sku', 'like', "%{$q}%")->orWhere('pv.name', 'like', "%{$q}%"))
            ->limit($limit)->pluck('pv.id')->map(fn ($i) => (int) $i)->all();
    }
}
