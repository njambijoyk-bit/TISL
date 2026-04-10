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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique(); // e.g., "TISL-2024-0001"
            
            // Customer Information (Required - Every order must have a customer)
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            
            // Who placed this order (optional - tracks who created it)
            $table->foreignId('placed_by')->nullable()->constrained('users')->onDelete('set null');
            // placed_by = customer's user if self-placed
            // placed_by = admin/sales rep if created on behalf
            // placed_by = null if guest/automated
            
            // Pricing
            $table->decimal('subtotal', 12, 2)->default(0); // Sum of all items
            $table->decimal('tax', 10, 2)->default(0); // VAT or tax amount
            $table->decimal('discount', 10, 2)->default(0); // Discount applied
            $table->decimal('shipping_cost', 10, 2)->default(0); // Delivery fee
            $table->decimal('total', 12, 2)->default(0); // Final total
            
            // Payment Information
            $table->enum('payment_method', [
                'request_invoice',
                'pay_on_delivery', 
                'mpesa',
                'bank_transfer',
                'credit_card',
                'credit' // For B2B customers
            ])->default('request_invoice');
            $table->enum('payment_status', [
                'unpaid',
                'partially_paid',
                'paid',
                'refunded',
                'failed'
            ])->default('unpaid');
            $table->string('payment_reference')->nullable(); // M-Pesa code, transaction ID, etc.
            $table->timestamp('paid_at')->nullable();
            
            // Order Status & Tracking
            $table->enum('status', [
                'pending',           // Just placed
                'confirmed',         // Admin confirmed
                'processing',        // Being prepared
                'ready_for_pickup',  // Ready at warehouse
                'shipped',           // Out for delivery
                'delivered',         // Completed
                'cancelled',         // Cancelled by customer/admin
                'failed'             // Failed delivery
            ])->default('pending');
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            
            // Shipping/Delivery Information
            $table->text('shipping_address')->nullable();
            $table->enum('delivery_method', [
                'pickup',
                'standard_delivery',
                'express_delivery',
                'courier'
            ])->default('standard_delivery');
            $table->string('tracking_number')->nullable();
            $table->string('courier_company')->nullable(); // e.g., DHL, G4S, etc.
            $table->timestamp('estimated_delivery_date')->nullable();
            $table->timestamp('delivered_at')->nullable();
            
            // Billing Address (if different from shipping)
            $table->text('billing_address')->nullable();
            $table->boolean('billing_same_as_shipping')->default(true);
            
            // Order Type
            $table->enum('order_type', [
                'standard',    // Regular order
                'quotation',   // Converted from quote
                'bulk',        // Bulk/wholesale order
                'b2b'          // Business to business
            ])->default('standard');
            $table->foreignId('quote_id')->nullable()->constrained('quotes')->onDelete('set null'); // If converted from quote
            
            // Referral Code Used (if any)
            $table->foreignId('referral_code_id')->nullable()->constrained('referral_codes')->onDelete('set null');
            $table->decimal('referral_discount', 10, 2)->default(0); // Discount from referral code
            
            // Additional Information
            $table->text('customer_notes')->nullable(); // Customer's special instructions
            $table->text('admin_notes')->nullable(); // Internal admin notes
            $table->json('metadata')->nullable(); // Any additional data
            
            // Invoice
            $table->string('invoice_number')->nullable()->unique();
            $table->timestamp('invoice_generated_at')->nullable();
            
            // Status History & Audit
            $table->foreignId('assigned_to')->nullable()->constrained('users')->onDelete('set null'); // Admin handling order
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            
            // Customer Feedback
            $table->integer('rating')->nullable(); // 1-5 rating of service
            $table->text('feedback')->nullable();
            
            $table->timestamps();
            $table->softDeletes(); // Soft delete for record keeping
            
            // Indexes
            $table->index('order_number');
            $table->index('customer_id');
            $table->index('placed_by');
            $table->index('status');
            $table->index('payment_status');
            $table->index('created_at');
            $table->index('referral_code_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};