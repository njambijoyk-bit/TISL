<?php

namespace App\Services\Menus;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\CurrencyConversionService;
use App\Services\Location\VariantStockService;
use App\Services\SkuGenerator;
use Illuminate\Support\Str;

/**
 * A stock item made from the Menus screen, so a kitchen does not need the E-commerce module (and its Products screens) to have ingredients:
 * an ordinary product with one "Standard" variant, counted in the unit chosen ("pack", "kg", "tray"), kept out of the shop and not for sale.
 * It is bought, received, counted and expires through Purchases and Stock like any product; the ingredient then says how much of a recipe unit it holds.
 */
class IngredientItems
{
    public function __construct(private VariantStockService $variants, private SkuGenerator $skus, private CurrencyConversionService $currencies)
    {
    }

    /** @return array{0: Product, 1: ProductVariant} */
    public function make(string $name, int $unitId, bool $expires, ?int $by): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new BooksException('Give the stock item a name, for example "Exe Flour 2 kg".');
        }
        $unit = UnitOfMeasure::find($unitId);
        if (! $unit || ! $unit->is_active) {
            throw new BooksException('Choose the unit it is bought and counted in (pack, kg, tray...).');
        }
        if (Product::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            throw new BooksException("There is already a stock item called {$name}. Search for it instead.");
        }
        $product = new Product([
            'name' => $name, 'slug' => $this->slug($name), 'sku' => $this->skus->generate(), 'type' => 'ingredient', 'price' => 0,
            'currency_id' => $this->currencies->getBaseCurrency()->id, 'default_unit_id' => $unit->id, 'in_stock' => true, 'stock_quantity' => 0, 'status' => 'active',
            'is_visible' => false, 'is_for_sale' => false, 'track_expiry' => $expires, 'created_by' => $by,
        ]);
        $product->save();

        return [$product, $this->variants->ensureDefaultVariant($product)];
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'ingredient';
        $slug = $base;
        for ($i = 2; Product::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }
}
