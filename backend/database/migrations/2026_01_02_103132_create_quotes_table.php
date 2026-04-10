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
            $table->string('quote_number')->unique(); // e.g., "QT-2024-0001"
            
            // Customer Information (Required - Every quote must have a customer)
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            
            // Who submitted this quote (optional - tracks who created it)
            $table->foreignId('submitted_by')->nullable()->constrained('users')->onDelete('set null');
            // submitted_by = customer's user if self-submitted
            // submitted_by = admin/sales rep if submitted on behalf
            // submitted_by = null if guest/automated
            
            // Quote Status
            $table->enum('status', [
                'pending',      // Just submitted, awaiting admin review
                'reviewed',     // Admin has seen it
                'quoted',       // Admin sent price quote
                'accepted',     // Customer accepted quote
                'rejected',     // Customer rejected quote
                'expired',      // Quote validity expired
                'converted'     // Converted to order
            ])->default('pending');
            
            // Quote Details
            $table->text('message')->nullable(); // Customer's message/requirements
            $table->json('requested_items')->nullable(); // Products customer is interested in
            
            // Admin Response
            $table->decimal('quoted_amount', 12, 2)->nullable(); // Total quoted price
            $table->text('admin_notes')->nullable(); // Admin's response/notes
            $table->json('quoted_items')->nullable(); // Detailed quote breakdown
            
            // Validity
            $table->timestamp('valid_until')->nullable(); // Quote expiration date
            $table->integer('validity_days')->default(30); // How many days quote is valid

            // Pricing Terms
            $table->enum('payment_terms', [
                'immediate',
                'net_7',
                'net_15',
                'net_30',
                'net_60',
                'negotiable'
            ])->nullable();
            
            // Delivery Information
            $table->text('delivery_address')->nullable();
            $table->string('delivery_method')->nullable(); // pickup, delivery
            $table->decimal('delivery_cost', 10, 2)->nullable();
            
            // Priority
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            
            // Admin Assignment
            $table->foreignId('assigned_to')->nullable()->constrained('users')->onDelete('set null');
            
            // Timestamps for tracking
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('quoted_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('expired_at')->nullable();
            $table->text('rejection_reason')->nullable();
            
            // Attachments
            $table->json('attachments')->nullable(); // Customer uploaded files (specs, drawings, etc.)
            
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('quote_number');
            $table->index('customer_id');
            $table->index('submitted_by');
            $table->index('status');
            $table->index('created_at');
            $table->index('assigned_to');
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