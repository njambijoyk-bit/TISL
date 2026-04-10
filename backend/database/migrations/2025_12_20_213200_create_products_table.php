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
        Schema::create('products', function (Blueprint $table) {
            $table->id(); // Primary key
            
            // Basic Product Info
            $table->string('name'); // Product name
            $table->string('slug')->unique(); // URL-friendly name for SEO
            $table->string('sku')->unique()->nullable(); // Stock Keeping Unit
            
            // Categorization & Branding
            $table->foreignId('category_id')->constrained()->onDelete('cascade'); // Links to categories table
            $table->foreignId('brand_id')->nullable()->constrained()->onDelete('set null'); // Links to brands table
            $table->string('type')->nullable(); // Product type (e.g., consumable, equipment, tool)
            
            // Pricing
            $table->decimal('price', 10, 2); // Numeric price for sorting
            $table->decimal('original_price', 10, 2)->nullable(); // For showing discounts
            $table->boolean('price_is_negotiable')->default(false); // Flag for negotiable prices
            
            // Inventory Management
            $table->boolean('in_stock')->default(true); // Stock availability
            $table->integer('stock_quantity')->default(0); // Actual quantity
            
            // Product Details
            $table->text('description')->nullable(); // Full description
            $table->text('short_description')->nullable(); // Brief summary for listings
            $table->json('features')->nullable(); // Features array as JSON
            $table->json('specifications')->nullable(); // Technical specs as JSON (e.g., dimensions, weight, material)
            $table->json('images')->nullable(); // Multiple images as JSON array
            $table->string('main_image')->nullable(); // Primary product image
            
            // Variants & Options (for products with size/color variations)
            $table->json('variants')->nullable(); // E.g., [{"size": "10mm", "color": "blue", "price": "1200"}]
            $table->boolean('has_variants')->default(false);
            
            // Bulk Pricing Tiers
            $table->json('bulk_pricing')->nullable(); // E.g., [{"min_qty": 10, "max_qty": 50, "price": "1100"}]
            
            // Ratings & Reviews
            $table->decimal('rating', 3, 2)->default(0.00); // Average rating (0.00 to 5.00)
            $table->unsignedInteger('reviews')->default(0); // Number of reviews
            
            // Marketing & Display
            $table->string('badge')->nullable(); // E.g., "New", "Sale", "Hot", "Featured"
            $table->boolean('is_featured')->default(false); // Show on homepage
            $table->boolean('is_new')->default(false); // New arrival
            $table->boolean('on_sale')->default(false); // On sale
            $table->integer('view_count')->default(0); // Track product views
            $table->integer('purchase_count')->default(0); // Track sales
            
            // SEO & Metadata
            $table->string('meta_title')->nullable();
            $table->text('meta_description')->nullable();
            $table->json('meta_keywords')->nullable();
            
            // Related Products
            $table->json('related_products')->nullable(); // Array of product IDs
            $table->json('recommended_products')->nullable(); // Suggested products
            
            // Product Status & Visibility
            $table->enum('status', ['draft', 'active', 'inactive', 'out_of_stock', 'discontinued'])->default('active');
            $table->boolean('is_visible')->default(true); // Show/hide from frontend
            $table->timestamp('published_at')->nullable(); // Schedule product launch
            
            // Admin Notes (internal only)
            $table->text('admin_notes')->nullable();
            
            // Audit Trail
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
            $table->softDeletes(); // Soft delete for data retention
            
            // Indexes for better performance
            $table->index('category_id');
            $table->index('brand_id');
            $table->index('status');
            $table->index('is_featured');
            $table->index('in_stock');
            $table->index('price');
            $table->index('rating');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};