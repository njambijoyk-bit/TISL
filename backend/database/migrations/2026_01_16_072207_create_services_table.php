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
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('sku')->nullable()->unique();
            
            // Classification
            $table->foreignId('category_id')->nullable()->constrained('service_categories')->onDelete('set null');
            $table->string('service_category')->nullable(); // Editable alternative
            $table->string('type', 100)->nullable();
            
            // Pricing
            $table->decimal('base_price', 10, 2)->nullable();
            $table->boolean('price_is_negotiable')->default(true);
            $table->enum('pricing_model', ['fixed', 'hourly', 'daily', 'project_based', 'subscription'])->default('fixed');
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->decimal('daily_rate', 10, 2)->nullable();
            $table->decimal('minimum_charge', 10, 2)->nullable();
            
            // Description
            $table->text('description')->nullable();
            $table->text('short_description')->nullable();
            $table->json('features')->nullable();
            $table->json('deliverables')->nullable();
            $table->json('requirements')->nullable();
            
            // Service Details
            $table->string('estimated_duration', 100)->nullable();
            $table->string('unit_of_measure', 50)->default('project');
            $table->boolean('requires_site_visit')->default(false);
            $table->boolean('is_remote_available')->default(false);
            $table->text('service_area')->nullable();
            $table->integer('max_concurrent_bookings')->nullable();
            
            // Pricing Tiers
            $table->json('pricing_tiers')->nullable();
            
            // Media & Documentation
            $table->json('images')->nullable();
            $table->string('main_image')->nullable();
            $table->string('brochure_url')->nullable();
            $table->string('video_url')->nullable();
            
            // Availability
            $table->boolean('is_available')->default(true);
            $table->enum('status', ['draft', 'active', 'inactive', 'discontinued'])->default('active');
            $table->boolean('is_visible')->default(true);
            $table->string('lead_time', 100)->nullable();
            $table->boolean('booking_required')->default(false);
            
            // Related Items
            $table->json('related_services')->nullable();
            $table->json('required_products')->nullable();
            $table->json('optional_products')->nullable();
            
            // SEO & Marketing
            $table->string('meta_title')->nullable();
            $table->text('meta_description')->nullable();
            $table->json('meta_keywords')->nullable();
            $table->string('badge')->nullable();
            $table->boolean('is_featured')->default(false);
            
            // Statistics
            $table->decimal('rating', 3, 2)->default(0.00);
            $table->unsignedInteger('review_count')->default(0);
            $table->integer('quote_count')->default(0);
            $table->integer('order_count')->default(0);
            $table->integer('view_count')->default(0);
            
            // Admin
            $table->text('admin_notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            
            // Timestamps
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('slug');
            $table->index('sku');
            $table->index('category_id');
            $table->index('status');
            $table->index('is_available');
            $table->index('is_featured');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};