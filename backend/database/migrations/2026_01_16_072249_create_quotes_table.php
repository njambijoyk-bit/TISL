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
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('quote_number')->unique();
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->onDelete('set null');
            
            // Financial
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('tax', 10, 2)->default(0.00);
            $table->decimal('discount', 10, 2)->default(0.00);
            $table->decimal('discount_percentage', 5, 2)->nullable();
            $table->decimal('shipping_cost', 10, 2)->default(0.00);
            $table->decimal('total', 12, 2)->default(0.00);
            
            // Quote Type & Status
            $table->enum('quote_type', ['product', 'service', 'mixed'])->default('product');
            $table->enum('status', ['draft', 'pending', 'revised', 'approved', 'rejected', 'expired', 'converted'])->default('draft');
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            
            // Validity Period
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            
            // Conversion Tracking
            $table->foreignId('converted_to_order_id')->nullable()->constrained('orders')->onDelete('set null');
            $table->timestamp('converted_at')->nullable();
            
            // Customer Interaction
            $table->text('customer_notes')->nullable();
            $table->text('admin_notes')->nullable();
            $table->text('terms_and_conditions')->nullable();
            $table->string('payment_terms')->nullable();
            $table->text('delivery_terms')->nullable();
            
            // Communication Tracking
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('viewed_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->text('rejection_reason')->nullable();
            
            // Pricing Context
            $table->enum('pricing_type', ['standard', 'bulk', 'negotiated', 'custom'])->default('standard');
            $table->boolean('is_negotiable')->default(false);
            $table->string('currency', 10)->default('KES');
            
            // Service-Specific (when quote_type includes service)
            $table->timestamp('service_start_date')->nullable();
            $table->timestamp('service_end_date')->nullable();
            $table->enum('billing_schedule', ['one_time', 'milestone_based', 'monthly', 'hourly', 'fixed_price'])->nullable();
            
            // Reference & Versioning
            $table->string('reference_number')->nullable();
            $table->integer('version')->default(1);
            $table->foreignId('parent_quote_id')->nullable()->constrained('quotes')->onDelete('set null');
            $table->json('metadata')->nullable();
            
            // Address
            $table->text('shipping_address')->nullable();
            $table->text('billing_address')->nullable();
            $table->boolean('billing_same_as_shipping')->default(true);
            
            // Timestamps
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('quote_number');
            $table->index('customer_id');
            $table->index('created_by');
            $table->index('assigned_to');
            $table->index('status');
            $table->index('sent_at');
            $table->index('reference_number');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quotes');
    }
};