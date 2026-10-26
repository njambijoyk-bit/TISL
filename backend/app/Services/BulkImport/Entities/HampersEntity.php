<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Books\Ledger;
use App\Models\Ecommerce\Hamper;
use App\Models\Ecommerce\HamperItem;
use App\Models\Ecommerce\Product;
use App\Models\Ecommerce\ProductVariant;
use App\Models\Location;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;
use App\Services\CurrencyConversionService;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Str;

/**
 * E-commerce → Hampers: a price for a bundle of products, one row per product in it (the rows of a hamper share its name). Every product must
 * already be in the catalogue, active and visible, and in stock at the hamper's branch, exactly as when a hamper is built on screen.
 */
class HampersEntity extends AbstractEntity
{
    use TradingColumns;

    public function key(): string
    {
        return 'ecommerce.hampers';
    }

    public function module(): string
    {
        return 'ecommerce';
    }

    public function label(): string
    {
        return 'Hampers';
    }

    public function description(): string
    {
        return 'A bundle sold at one price. One row per product in it. The products must be in the catalogue and in stock at the hamper\'s branch.';
    }

    public function groupBy(): ?string
    {
        return 'name';
    }

    public function requires(): array
    {
        return [['label' => 'Products', 'entity' => 'ecommerce.products', 'present' => fn () => Product::query()->exists()]];
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Hamper', 'text', ['max' => 255, 'aliases' => ['hamper'], 'example' => 'Baker\'s box', 'help' => 'Repeat it on every row of the hamper.']),
            $this->required('price', 'Price', 'number', ['example' => '1800', 'help' => 'The price of the whole hamper.']),
            $this->required('location', 'Branch', 'text', ['aliases' => ['branch'], 'example' => 'Main', 'help' => 'The branch it is sold from (name or code). Its products are taken from this branch\'s stock.']),
            $this->required('sales_account', 'Sales account', 'text', ['example' => 'Sales', 'help' => 'A sales account with its tax set. Name or code.']),
            $this->optional('currency', 'Currency', 'text', ['example' => 'KES', 'help' => 'Empty means the base currency.']),
            $this->optional('description', 'Description', 'text'),
            $this->optional('status', 'Status', 'enum', ['options' => ['draft', 'active', 'inactive'], 'example' => 'draft', 'help' => 'Empty means draft, so nothing goes on sale by surprise.']),
            $this->optional('total_stock', 'Editions', 'integer', ['example' => '50', 'help' => 'How many may be sold. Empty means no limit.']),
            $this->optional('max_purchases_per_customer', 'Limit per customer', 'integer'),
            $this->optional('valid_from', 'Valid from', 'date', ['example' => '2026-12-01']),
            $this->optional('valid_until', 'Valid until', 'date', ['example' => '2026-12-31']),
            $this->required('item_sku', 'Item SKU', 'text', ['perRow' => true, 'aliases' => ['sku', 'product'], 'example' => 'FLOUR-2KG', 'help' => 'The SKU of a product (or of one of its variants).']),
            $this->required('quantity', 'Item quantity', 'integer', ['perRow' => true, 'example' => '2']),
            $this->optional('item_price', 'Item price', 'number', ['perRow' => true, 'help' => 'What this item counts for inside the hamper. Empty means its catalogue price.']),
        ];
    }

    public function examples(): array
    {
        $head = ['name' => 'Baker\'s box', 'price' => '1800', 'location' => 'Main', 'sales_account' => 'Sales', 'currency' => 'KES', 'description' => '', 'status' => 'draft', 'total_stock' => '50', 'max_purchases_per_customer' => '', 'valid_from' => '', 'valid_until' => ''];

        return [$head + ['item_sku' => 'FLOUR-2KG', 'quantity' => '2', 'item_price' => ''], $head + ['item_sku' => 'SUGAR-1KG', 'quantity' => '1', 'item_price' => '']];
    }

    private function location(array $r): ?Location
    {
        return Location::where('is_active', true)->where(fn ($q) => $q->whereRaw('LOWER(name) = ?', [mb_strtolower($r['location'])])->orWhereRaw('LOWER(code) = ?', [mb_strtolower($r['location'])]))->first();
    }

    /** The variant an item SKU names: a variant's own SKU, else the default variant of the product with that SKU. */
    private function variant(string $sku): ?ProductVariant
    {
        $v = ProductVariant::with('product')->whereRaw('LOWER(sku) = ?', [mb_strtolower($sku)])->first();
        if ($v) {
            return $v;
        }
        $p = Product::whereRaw('LOWER(sku) = ?', [mb_strtolower($sku)])->first();
        $id = $p ? app(VariantStockService::class)->defaultVariantId((int) $p->id) : null;

        return $id ? ProductVariant::with('product')->find($id) : null;
    }

    public function check(array $r, ImportContext $ctx): void
    {
        if (Hamper::whereRaw('LOWER(name) = ?', [mb_strtolower($r['name'])])->exists()) {
            throw new RowProblem("There is already a hamper called {$r['name']}.", RowProblem::EXISTS, 'name');
        }
        if (! ($loc = $this->location($r))) {
            throw new RowProblem("The branch \"{$r['location']}\" is not an active branch. Use a branch's name or code.", RowProblem::MISSING_REF, 'location');
        }
        $this->currencyId($r);
        $account = $this->account($r, 'sales_account', $ctx, 'sales', 'product');
        if (! empty($r['valid_from']) && ! empty($r['valid_until']) && $r['valid_until'] < $r['valid_from']) {
            throw new RowProblem('Valid until is before valid from.', RowProblem::INVALID, 'valid_until');
        }
        if (isset($r['total_stock']) && $r['total_stock'] < 1) {
            throw new RowProblem('Editions must be at least 1 (or empty for no limit).', RowProblem::INVALID, 'total_stock');
        }
        $stock = app(VariantStockService::class);
        $seen = [];
        $need = [];
        foreach ($r['_lines'] as $l) {
            $row = $l['_row'];
            $variant = $this->variant($l['item_sku']);
            if (! $variant) {
                throw new RowProblem("No product or variant has the SKU \"{$l['item_sku']}\". Import or add the product first.", RowProblem::MISSING_REF, 'item_sku', $row);
            }
            $product = $variant->product;
            if ($product->status !== 'active' || ! $product->is_visible) {
                throw new RowProblem("{$product->name} is not active and visible in the shop, so it can not go in a hamper.", RowProblem::NOT_ALLOWED, 'item_sku', $row);
            }
            if ($l['quantity'] < 1) {
                throw new RowProblem('The quantity must be at least 1.', RowProblem::INVALID, 'quantity', $row);
            }
            if (isset($seen[$variant->id])) {
                throw new RowProblem("{$product->name} is listed twice in this hamper (row {$seen[$variant->id]}): add the quantities together.", RowProblem::DUPLICATE, 'item_sku', $row);
            }
            $seen[$variant->id] = $row;
            $a = $stock->availability($variant->id, (int) $loc->id, (float) $l['quantity']);
            if (! $a['ok']) {
                throw new RowProblem("{$loc->name} is out of stock".($a['quantity'] > 0 ? " (only {$a['quantity']} left)" : '')." for {$product->name}.", RowProblem::NOT_ALLOWED, 'quantity', $row);
            }
        }
    }

    public function store(array $r, ImportContext $ctx): void
    {
        $loc = $this->location($r);
        $currency = $this->currencyId($r) ?? $this->baseCurrencyId();
        $hamper = Hamper::create([
            'name' => $r['name'], 'slug' => Str::slug($r['name']).'-'.Str::random(6), 'description' => $r['description'] ?? null,
            'price' => $r['price'], 'currency_id' => $currency, 'location_id' => $loc->id,
            'status' => $r['status'] ?? 'draft', 'eligibility_type' => 'all', 'is_visible' => true,
            'allow_promo_codes' => true, 'allow_store_credit' => true, 'earn_loyalty_points' => true,
            'max_purchases_per_customer' => $r['max_purchases_per_customer'] ?? null,
            'total_stock' => $r['total_stock'] ?? null, 'stock_remaining' => $r['total_stock'] ?? null,
            'valid_from' => $r['valid_from'] ?? null, 'valid_until' => $r['valid_until'] ?? null,
            'created_by' => $ctx->userId,
        ]);
        // the sales account sets the tax, as on the Hampers screen
        $hamper->forceFill(['sales_ledger_id' => $this->account($r, 'sales_account', $ctx, 'sales', 'product')]);
        $account = Ledger::find($hamper->sales_ledger_id);
        $taxed = $account && in_array($account->tax_nature, ['taxable', 'zero_rated'], true) && $account->tax_rate_ledger_id;
        $hamper->forceFill(['tax_rate_id' => $taxed ? $account->tax_rate_ledger_id : null, 'apply_vat' => (bool) $taxed])->save();

        $money = app(CurrencyConversionService::class);
        foreach ($r['_lines'] as $l) {
            $variant = $this->variant($l['item_sku']);
            $product = $variant->product;
            $catalogue = $money->convert((float) ($variant->price ?? $product->price ?? 0), $money->currencyFrom($product->currency_id), $money->currencyFrom($currency));
            HamperItem::create([
                'hamper_id' => $hamper->id, 'product_id' => $product->id, 'variant_id' => $variant->id, 'quantity' => $l['quantity'],
                'sale_price' => $l['item_price'] ?? $catalogue,
                'snapshot' => array_merge(HamperItem::buildSnapshot($product), ['variant_id' => $variant->id, 'variant_name' => $variant->name]),
            ]);
        }
    }
}
