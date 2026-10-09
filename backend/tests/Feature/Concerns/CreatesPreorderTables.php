<?php

namespace Tests\Feature\Concerns;

use Illuminate\Support\Facades\Schema;

/** The in-memory tables the preorder tests share (the repo builds its database from SQL scripts). */
trait CreatesPreorderTables
{
    protected function createPreorderTables(): void
    {
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->string('sku')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); $t->string('sku')->nullable(); $t->boolean('is_default')->default(false); $t->string('status')->default('active'); $t->softDeletes(); $t->timestamps(); });
        Schema::create('variant_location_stock', function ($t) { $t->id(); $t->unsignedBigInteger('product_variant_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 12, 4)->default(0); $t->decimal('reorder_level', 12, 4)->nullable(); $t->boolean('preorder_enabled')->default(false); $t->timestamps(); });
        Schema::create('campaigns', function ($t) { $t->id(); $t->string('slug'); $t->string('title'); $t->string('type')->default('awareness_sale'); $t->string('goal')->default('sales'); $t->dateTime('starts_at')->nullable(); $t->dateTime('ends_at')->nullable(); $t->dateTime('teaser_at')->nullable(); $t->dateTime('early_access_at')->nullable(); $t->json('early_access_audience')->nullable(); $t->dateTime('published_at')->nullable(); $t->boolean('is_published')->default(true); $t->boolean('is_paused')->default(false); $t->dateTime('archived_at')->nullable(); $t->json('audience_rule')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->softDeletes(); $t->timestamps(); });
        Schema::create('campaign_items', function ($t) { $t->id(); $t->unsignedBigInteger('campaign_id'); $t->unsignedBigInteger('section_id')->nullable(); $t->string('item_type'); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('variant_id')->default(0); $t->integer('position')->default(0); $t->dateTime('available_from')->nullable(); $t->string('label_override')->nullable(); $t->timestamps(); });
        Schema::create('hampers', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->nullable(); $t->decimal('price', 12, 2)->default(0); $t->string('status')->default('active'); $t->boolean('is_visible')->default(true); $t->unsignedBigInteger('location_id')->nullable(); $t->timestamps(); });
        Schema::create('hamper_items', function ($t) { $t->id(); $t->unsignedBigInteger('hamper_id'); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->integer('quantity')->default(1); $t->decimal('sale_price', 12, 2)->nullable(); $t->json('snapshot')->nullable(); });
        Schema::create('preorder_offers', function ($t) { $t->id(); $t->unsignedBigInteger('campaign_id'); $t->unsignedBigInteger('product_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedInteger('limit_total')->nullable(); $t->unsignedInteger('max_per_customer')->nullable(); $t->dateTime('closes_at')->nullable(); $t->date('expected_from')->nullable(); $t->date('expected_until')->nullable(); $t->string('terms', 500)->nullable(); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('preorder_lines', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('offer_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('location_id'); $t->date('promised_date')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('customer_id')->nullable(); $t->json('meta')->nullable(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('status')->default('posted'); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->date('date')->nullable(); $t->string('voucher_number')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->boolean('is_header')->default(false); $t->decimal('quantity', 12, 4)->default(0); $t->decimal('unit_factor', 12, 4)->default(1); $t->decimal('delivered_quantity', 12, 4)->default(0); $t->unsignedBigInteger('source_item_id')->nullable(); $t->decimal('amount', 12, 2)->default(0); });
    }
}
