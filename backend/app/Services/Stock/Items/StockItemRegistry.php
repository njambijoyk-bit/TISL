<?php

namespace App\Services\Stock\Items;

/**
 * The kinds of stocked item the platform knows. Products are built in; another module adds its own from
 * its service provider:  StockItemRegistry::register(new IngredientSource());
 */
class StockItemRegistry
{
    /** @var array<string,StockItemSource> */
    private static array $sources = [];

    public static function register(StockItemSource $source): void
    {
        self::$sources[$source->type()] = $source;
    }

    /** @return array<string,StockItemSource> */
    public static function all(): array
    {
        if (! isset(self::$sources[ProductVariantSource::TYPE])) {
            self::register(new ProductVariantSource());
        }

        return self::$sources;
    }

    public static function get(string $type): ?StockItemSource
    {
        return self::all()[$type] ?? null;
    }

    /** What a movement of an unknown (module switched off, source gone) type is shown as. */
    public static function unknown(string $type, int $id): array
    {
        return ['name' => ucfirst(str_replace('_', ' ', $type)) . " #{$id}", 'sku' => null, 'group' => 'Other', 'unit' => null, 'sale_price' => null, 'currency' => null, 'url' => null];
    }
}
