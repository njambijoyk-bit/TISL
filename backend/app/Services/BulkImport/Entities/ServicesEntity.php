<?php

namespace App\Services\BulkImport\Entities;

use App\Models\Service;
use App\Models\ServiceCategory;
use App\Services\BulkImport\AbstractEntity;
use App\Services\BulkImport\ImportContext;
use App\Services\BulkImport\RowProblem;

/** E-commerce → Services: what you do for a customer. Sold under a Service Income account, which sets the tax. Starts with its Standard package and the fees marked "on for new services", as on the Services screen. */
class ServicesEntity extends AbstractEntity
{
    use TradingColumns;

    public function key(): string
    {
        return 'ecommerce.services';
    }

    public function module(): string
    {
        return 'ecommerce';
    }

    public function label(): string
    {
        return 'Services';
    }

    public function description(): string
    {
        return 'Things you do for a customer, priced from a starting amount. Sold under a Service Income account.';
    }

    public function columns(): array
    {
        return [
            $this->required('name', 'Name', 'text', ['max' => 255, 'example' => 'Cake decorating']),
            $this->optional('sku', 'SKU', 'text', ['max' => 255, 'help' => 'Empty means a fresh one is made.']),
            $this->optional('category', 'Service category', 'text', ['example' => 'Catering', 'help' => 'A service category already in the system.']),
            $this->optional('base_price', 'Starting price', 'number', ['example' => '1500']),
            $this->optional('currency', 'Currency', 'text', ['example' => 'KES', 'help' => 'Empty means the base currency.']),
            $this->optional('price_unit', 'Price per', 'text', ['example' => 'hour', 'help' => 'What the price covers: a unit code or name.']),
            $this->required('sales_account', 'Sales account', 'text', ['example' => 'Service Income', 'help' => 'A Service Income account with its tax set. Name or code.']),
            $this->optional('description', 'Description', 'text'),
            $this->optional('short_description', 'Short description', 'text'),
            $this->optional('delivery_mode', 'Delivery', 'enum', ['options' => ['on_site', 'remote', 'in_branch', 'hybrid'], 'example' => 'in_branch']),
            $this->optional('estimated_duration', 'Duration', 'text', ['max' => 100, 'example' => '2 hours']),
            $this->optional('status', 'Status', 'enum', ['options' => ['draft', 'active', 'inactive', 'discontinued'], 'example' => 'active', 'help' => 'Empty means active.']),
            $this->optional('is_visible', 'Visible in the shop', 'boolean', ['help' => 'Empty means yes.']),
        ];
    }

    public function examples(): array
    {
        return [
            ['name' => 'Cake decorating', 'sku' => '', 'category' => '', 'base_price' => '1500', 'currency' => 'KES', 'price_unit' => '', 'sales_account' => 'Service Income', 'description' => '', 'short_description' => '', 'delivery_mode' => 'in_branch', 'estimated_duration' => '2 hours', 'status' => 'active', 'is_visible' => 'yes'],
        ];
    }

    public function identity(array $r): ?string
    {
        return $this->str($r, 'sku') ? 'sku:'.mb_strtolower($r['sku']) : null;
    }

    private function category(array $r): ?ServiceCategory
    {
        return $this->str($r, 'category') ? ServiceCategory::whereRaw('LOWER(name) = ?', [mb_strtolower($r['category'])])->first() : null;
    }

    public function check(array $r, ImportContext $ctx): void
    {
        $this->skuFree($r);
        if (isset($r['base_price']) && $r['base_price'] < 0) {
            throw new RowProblem('The price can not be negative.', RowProblem::INVALID, 'base_price');
        }
        if ($this->str($r, 'category') && ! $this->category($r)) {
            throw new RowProblem("The service category \"{$r['category']}\" is not in the system. Add it under Service categories first.", RowProblem::MISSING_REF, 'category');
        }
        $this->unitId($r, 'price_unit', $ctx);
        $this->currencyId($r);
        $this->account($r, 'sales_account', $ctx, 'sales', 'service');
    }

    public function store(array $r, ImportContext $ctx): void
    {
        $status = $r['status'] ?? 'active';
        $service = Service::create([
            'name' => $r['name'],
            'slug' => $this->uniqueSlug(Service::class, $r['name']),
            'sku' => $this->str($r, 'sku') ?? app(\App\Services\Ecommerce\SkuGenerator::class)->generate(),
            'category_id' => $this->category($r)?->id,
            'base_price' => $r['base_price'] ?? null,
            'currency_id' => $this->currencyId($r) ?? $this->baseCurrencyId(),
            'price_unit_id' => $this->unitId($r, 'price_unit', $ctx),
            'description' => $r['description'] ?? null,
            'short_description' => $r['short_description'] ?? null,
            'delivery_mode' => $r['delivery_mode'] ?? null,
            'estimated_duration' => $r['estimated_duration'] ?? null,
            'status' => $status,
            'is_visible' => $r['is_visible'] ?? true,
            'meta_title' => $r['name'],
            'meta_description' => $r['short_description'] ?? \Illuminate\Support\Str::limit((string) ($r['description'] ?? ''), 160),
            'published_at' => $status === 'active' ? now() : null,
            'created_by' => $ctx->userId,
        ]);
        $service->forceFill(['sales_ledger_id' => $this->account($r, 'sales_account', $ctx, 'sales', 'service')])->save();
        app(\App\Services\ServiceCatalogService::class)->ensureStandardVariant($service);
        app(\App\Services\Books\ServiceFeeService::class)->attachDefaults($service);
    }
}
