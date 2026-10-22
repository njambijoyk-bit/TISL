<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Ecommerce\Brand;
use App\Models\Ecommerce\Category;
use App\Models\Ecommerce\Product;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;
use App\Services\Location\VariantStockService;

/**
 * E-commerce → Products: the catalogue entry (name, SKU, category, price, unit, the sales account that sets its tax). Stock does not come in
 * this way: opening quantities need a cost and a date, so they are received on the stock screens, which post the voucher.
 */
class ProductsEntity extends AbstractEntity
{
    use TradingColumns;

    public function key(): string
    {
        return 'ecommerce.products';
    }

    public function module(): string
    {
        return 'ecommerce';
    }

    public function label(): string
    {
        return 'Products';
    }

    public function description(): string
    {
        return 'Things you sell. Needs categories in the system first. Stock quantities are received on the stock screens, not imported.';
    }

    public function requires(): array
    {
        return [['label' => 'Product categories', 'entity' => 'ecommerce.categories', 'present' => fn () => Category::query()->exists()]];
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Name', 'text', ['max' => 255, 'example' => 'Wheat flour 2kg']),
            $this->optional('sku', 'SKU', 'text', ['max' => 255, 'example' => 'FLOUR-2KG', 'help' => 'Empty means a fresh one is made. Must not be used by any product, variant or service.']),
            $this->required('category', 'Category', 'text', ['example' => 'Baking', 'help' => 'A category already in the system.']),
            $this->optional('brand', 'Brand', 'text', ['example' => 'Exe', 'help' => 'A brand already in the system.']),
            $this->required('price', 'Price', 'number', ['example' => '250']),
            $this->optional('currency', 'Currency', 'text', ['example' => 'KES', 'help' => 'Empty means the base currency.']),
            $this->required('unit', 'Unit', 'text', ['example' => 'each', 'aliases' => ['defaultunit'], 'help' => 'The unit stock is counted in (a code or name from Units).']),
            $this->optional('alt_unit', 'Alternate unit', 'text', ['help' => 'Must measure the same thing as the unit.']),
            $this->required('sales_account', 'Sales account', 'text', ['example' => 'Sales - Goods', 'help' => 'A sales account with its tax set; it decides the tax. Name or code.']),
            $this->optional('purchase_account', 'Purchase account', 'text', ['help' => 'A purchase account, name or code.']),
            $this->optional('description', 'Description', 'text'),
            $this->optional('short_description', 'Short description', 'text', ['max' => 500]),
            $this->optional('status', 'Status', 'enum', ['options' => ['draft', 'active', 'inactive'], 'example' => 'active', 'help' => 'Empty means active.']),
            $this->optional('is_visible', 'Visible in the shop', 'boolean', ['example' => 'yes', 'help' => 'Empty means yes.']),
        ];
    }

    public function examples(): array
    {
        return [
            ['name' => 'Wheat flour 2kg', 'sku' => 'FLOUR-2KG', 'category' => 'Baking', 'brand' => '', 'price' => '250', 'currency' => 'KES', 'unit' => 'each', 'alt_unit' => '', 'sales_account' => 'Sales', 'purchase_account' => '', 'description' => 'Plain white flour', 'short_description' => '', 'status' => 'active', 'is_visible' => 'yes'],
        ];
    }

    public function identity(array $r): ?string
    {
        return $this->str($r, 'sku') ? 'sku:'.mb_strtolower($r['sku']) : null;   // two products may share a name; a SKU is one thing only
    }

    public function check(array $r, ImportContext $ctx): void
    {
        $this->skuFree($r);
        if ($r['price'] < 0) {
            throw new RowProblem('The price can not be negative.', RowProblem::INVALID, 'price');
        }
        if (! $ctx->category($r['category'])) {
            throw new RowProblem("The category \"{$r['category']}\" is not in the system. Import or add it first.", RowProblem::MISSING_REF, 'category');
        }
        if ($this->str($r, 'brand') && ! Brand::whereRaw('LOWER(name) = ?', [mb_strtolower($r['brand'])])->exists()) {
            throw new RowProblem("The brand \"{$r['brand']}\" is not in the system. Add it under Brands first.", RowProblem::MISSING_REF, 'brand');
        }
        $this->units($r, $ctx);
        $this->currencyId($r);
        $this->account($r, 'sales_account', $ctx, 'sales', 'product');
        $this->account($r, 'purchase_account', $ctx, 'purchase', 'product');
    }

    /** @return array{0: int, 1: ?int} */
    private function units(array $r, ImportContext $ctx): array
    {
        $default = $this->unitId($r, 'unit', $ctx);
        $alt = $this->unitId($r, 'alt_unit', $ctx);
        if ($alt) {
            if ($alt === $default) {
                throw new RowProblem('The alternate unit must differ from the unit.', RowProblem::INVALID, 'alt_unit');
            }
            if ($ctx->unit($r['unit'])->dimension !== $ctx->unit($r['alt_unit'])->dimension) {
                throw new RowProblem('The alternate unit must measure the same thing as the unit (both counts, both weights...).', RowProblem::INVALID, 'alt_unit');
            }
        }

        return [$default, $alt];
    }

    public function store(array $r, ImportContext $ctx): void
    {
        [$default, $alt] = $this->units($r, $ctx);
        $product = Product::create([
            'name' => $r['name'],
            'slug' => $this->uniqueSlug(Product::class, $r['name']),
            'sku' => $this->str($r, 'sku') ?? app(\App\Services\Ecommerce\SkuGenerator::class)->generate(),
            'category_id' => $ctx->category($r['category'])->id,
            'brand_id' => $this->str($r, 'brand') ? Brand::whereRaw('LOWER(name) = ?', [mb_strtolower($r['brand'])])->value('id') : null,
            'price' => $r['price'],
            'currency_id' => $this->currencyId($r) ?? $this->baseCurrencyId(),
            'default_unit_id' => $default,
            'alternate_unit_id' => $alt,
            'in_stock' => true,
            'stock_quantity' => 0,
            'description' => $r['description'] ?? null,
            'short_description' => $r['short_description'] ?? null,
            'status' => $r['status'] ?? 'active',
            'is_visible' => $r['is_visible'] ?? true,
            'is_for_sale' => true,
            'track_expiry' => false,
            'created_by' => $ctx->userId,
        ]);
        $product->forceFill([
            'sales_ledger_id' => $this->account($r, 'sales_account', $ctx, 'sales', 'product'),
            'purchase_ledger_id' => $this->account($r, 'purchase_account', $ctx, 'purchase', 'product'),
        ])->save();
        app(VariantStockService::class)->ensureDefaultVariant($product);   // every product starts with its "Standard" variant, so it can be stocked and sold
    }
}
