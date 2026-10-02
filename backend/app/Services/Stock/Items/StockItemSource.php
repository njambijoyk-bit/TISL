<?php

namespace App\Services\Stock\Items;

/**
 * Something that can hold stock. A module that has its own kind of stocked item (product variants, menu
 * ingredients, course books…) registers one of these with StockItemRegistry; the stock reports then describe
 * its items without knowing which table they live in. Movements and batches carry item_type + item_id.
 */
interface StockItemSource
{
    /** The item_type stored on movements and batches, e.g. 'product_variant'. */
    public function type(): string;

    /** What to call this kind of item in a filter, e.g. 'Products'. */
    public function label(): string;

    /**
     * Describe items. Must return, for every id it knows:
     *   [id => ['name' => string, 'sku' => ?string, 'group' => ?string, 'unit' => ?string,
     *           'sale_price' => ?float, 'currency' => ?string, 'url' => ?string]]
     *
     * @param  array<int,int>  $ids
     * @return array<int,array<string,mixed>>
     */
    public function describe(array $ids): array;

    /** Ids whose name or code matches a search, for the report's search box. @return array<int,int> */
    public function search(string $q, int $limit = 500): array;
}
