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
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->onDelete('cascade');
            $table->foreignId('product_id')->nullable()->constrained('products')->onDelete('set null');
            $table->foreignId('quote_item_id')->nullable()->constrained('quote_items')->onDelete('set null');
            
            // Product snapshot (in case product details change later)
            $table->string('product_name'); // Store name at time of order
            $table->string('product_sku')->nullable();
            $table->string('brand_name')->nullable(); // Store brand name
            $table->string('product_image')->nullable(); // Store main image
            
            // Quantity & Pricing
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 10, 2); // Price per unit at time of order
            $table->decimal('line_total', 12, 2); // quantity × unit_price
            $table->decimal('discount_amount', 10, 2)->default(0); // If item-level discount
            $table->decimal('line_total_after_discount', 12, 2); // line_total - discount
            
            // Variant Information (if product has size/color variants)
            $table->json('variant_details')->nullable(); // e.g., {"size": "10mm", "color": "blue"}
            
            // Stock handling
            $table->enum('stock_status', [
                'in_stock',
                'out_of_stock',
                'backordered',
                'reserved'
            ])->default('in_stock');
            $table->timestamp('reserved_at')->nullable(); // When stock was reserved
            
            // Special pricing (bulk, negotiated, etc.)
            $table->boolean('is_bulk_pricing')->default(false);
            $table->boolean('is_negotiated_price')->default(false);
            $table->text('pricing_notes')->nullable();
            
            // Item-specific notes
            $table->text('notes')->nullable(); // Customer notes for this specific item
            
            // Return/Refund tracking
            $table->integer('quantity_returned')->default(0);
            $table->decimal('refund_amount', 10, 2)->default(0);
            $table->enum('return_status', [
                'none',
                'requested',
                'approved',
                'rejected',
                'completed'
            ])->default('none');
            
            $table->timestamps();
            
            // Indexes
            $table->index('order_id');
            $table->index('product_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};