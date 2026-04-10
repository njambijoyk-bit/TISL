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
            $table->foreignId('product_id')->nullable()->constrained('products')->onDelete('set null');
            
            // Product Information (snapshot)
            $table->string('product_name');
            $table->string('product_sku')->nullable();
            $table->string('brand_name')->nullable();
            $table->text('description')->nullable(); // Additional details/specs
            
            // 1. Discount tracking (if admin gives item-level discounts)
$table->decimal('original_price', 10, 2)->nullable(); 
$table->decimal('discount_amount', 10, 2)->default(0);
$table->decimal('discount_percentage', 5, 2)->default(0);

// 2. Tax tracking
$table->decimal('tax_amount', 10, 2)->default(0);

// 3. Alternative products suggested by admin
$table->json('alternative_products')->nullable(); // [id1, id2, id3]

// 4. Status per item (some items may be unavailable)
$table->enum('status', [
    'pending',      // Awaiting admin review
    'quoted',       // Admin provided price
    'accepted',     // Customer accepts this item
    'rejected',     // Customer rejects this item
    'substituted'   // Replaced with alternative
])->default('pending');
            // Quantity
            $table->integer('quantity')->default(1);
            
            // Pricing
            $table->decimal('unit_price', 10, 2)->nullable(); // Admin's quoted price per unit
            $table->decimal('line_total', 12, 2)->nullable(); // quantity × unit_price
            
            // Product details
            $table->json('specifications')->nullable(); // Custom specifications requested
            $table->json('variant_details')->nullable(); // Size, color, etc.
            
            // Notes
            $table->text('customer_notes')->nullable(); // Customer's requirements for this item
            $table->text('admin_notes')->nullable(); // Admin's notes about pricing/availability
            
            // Availability
            $table->enum('availability', [
                'in_stock',
                'out_of_stock',
                'order_on_demand',
                'discontinued'
            ])->default('in_stock');
            $table->integer('lead_time_days')->nullable(); // How many days to fulfill
            
            $table->timestamps();
            
            // Indexes
            $table->index('quote_id');
            $table->index('product_id');
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
