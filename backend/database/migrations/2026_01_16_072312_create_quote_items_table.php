<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('quote_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')->constrained('quotes')->onDelete('cascade');
            
            // CRITICAL: What type of item is this?
            $table->enum('item_type', ['product', 'service', 'fee', 'custom_product', 'custom_service', 'custom'])->default('product');
            
            // Custom Item Flag
            $table->boolean('is_custom_item')->default(false);
            
            // Product Reference (populated when item_type = 'product')
            $table->foreignId('product_id')->nullable()->constrained('products')->onDelete('set null');
            $table->string('product_name')->nullable();
            $table->string('product_sku')->nullable();
            $table->string('brand_name')->nullable();
            $table->string('product_image')->nullable();
            $table->json('variant_details')->nullable();
            
            // Service Reference (populated when item_type = 'service')
            $table->foreignId('service_id')->nullable()->constrained('services')->onDelete('set null');
            $table->string('service_name')->nullable();
            $table->text('service_description')->nullable();
            $table->string('service_category')->nullable(); // EDITABLE by admin/customer
            
            // Custom Item Details
            $table->json('custom_item_details')->nullable();
            
            // Universal Quantity & Pricing (works for both products and services)
            $table->decimal('quantity', 10, 2)->default(1);
            $table->string('unit_of_measure', 50)->default('each');
            $table->decimal('unit_price', 10, 2);
            $table->decimal('original_price', 10, 2)->nullable();
            $table->decimal('line_total', 12, 2);
            $table->decimal('discount_amount', 10, 2)->default(0.00);
            $table->decimal('line_total_after_discount', 12, 2);
            
            // Service-Specific Fields (nullable, only used when item_type = 'service')
            $table->decimal('estimated_hours', 8, 2)->nullable();
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->decimal('labor_cost', 10, 2)->nullable();
            $table->decimal('material_cost', 10, 2)->nullable();
            $table->string('estimated_duration', 100)->nullable();
            $table->date('scheduled_start_date')->nullable();
            $table->date('scheduled_end_date')->nullable();
            
            // Pricing Flags
            $table->boolean('is_bulk_pricing')->default(false);
            $table->boolean('is_negotiated_price')->default(false);
            $table->boolean('is_taxable')->default(true);
            $table->text('pricing_notes')->nullable();
            
            // Availability & Requirements
            $table->enum('availability_status', ['in_stock', 'available', 'out_of_stock', 'special_order', 'on_request'])->default('available');
            $table->string('lead_time', 100)->nullable();
            $table->boolean('requires_site_visit')->default(false);
            $table->text('prerequisites')->nullable();
            
            // Additional Info
            $table->text('notes')->nullable();
            $table->integer('display_order')->default(0);
            
            // Timestamps
            $table->timestamps();
            
            // Indexes
            $table->index('quote_id');
            $table->index('product_id');
            $table->index('service_id');
            $table->index('item_type');
            $table->index('is_custom_item');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quote_items');
    }
};