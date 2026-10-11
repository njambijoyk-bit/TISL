<?php

namespace App\Services\Menus;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\CurrencyConversionService;
use App\Services\Location\VariantStockService;
use App\Services\SkuGenerator;
use Illuminate\Support\Str;

/**
 * The hidden stock item behind a dish: an ordinary product with one "Standard" variant. It is for sale (an order can put it on a voucher) but not visible, so the shop never lists it:
 * the menus are how it is sold.
 * Everything that is true of a product (price, tax account, batches, cost of sales, refunds) is then true of the dish with no new code in the books.
 */
class DishItems
{
    public function __construct(private VariantStockService $variants, private SkuGenerator $skus, private CurrencyConversionService $currencies)
    {
    }

    /** @return array{0: Product, 1: ProductVariant} */
    public function make(string $name, float $price, int $salesLedgerId, ?int $categoryId, ?int $by): array
    {
        $product = new Product([
            'name' => $name, 'slug' => $this->slug($name), 'sku' => $this->skus->generate(), 'type' => 'dish', 'category_id' => $categoryId, 'price' => $price,
            'currency_id' => $this->currencies->getBaseCurrency()->id, 'in_stock' => true, 'stock_quantity' => 0, 'status' => 'active',
            'is_visible' => false, 'is_for_sale' => true, 'track_expiry' => false, 'created_by' => $by,
        ]);
        $product->forceFill(['sales_ledger_id' => $salesLedgerId])->save();

        return [$product, $this->variants->ensureDefaultVariant($product)];
    }

    /** A dish made before orders existed had a product that was not for sale; this puts it right (and keeps it out of the shop). */
    public function makeSellable(Product $product): void
    {
        if (! $product->is_for_sale || $product->is_visible) {
            $product->forceFill(['is_for_sale' => true, 'is_visible' => false])->save();
        }
    }

    /** Keep the price of the hidden item in step with the dish's. */
    public function setPrice(Product $product, ProductVariant $variant, float $price): void
    {
        $product->forceFill(['price' => $price])->save();
        $variant->units()->where('role', 'base')->update(['price' => $price]);
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'dish';
        $slug = $base;
        for ($i = 2; Product::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }
}
