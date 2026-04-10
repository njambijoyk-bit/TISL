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
        Schema::create('referral_code_usage', function (Blueprint $table) {
            $table->id();
            
            // ====================
            // RELATIONSHIPS
            // ====================
            $table->foreignId('referral_code_id')->constrained('referral_codes')->onDelete('cascade');
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade'); // Who used it
            
            // Order ID - NO constraint yet (orders table doesn't exist)
            // Foreign key will be added when orders table is created
            $table->unsignedBigInteger('order_id')->nullable();
            
            // ====================
            // USAGE STATUS
            // ====================
            $table->enum('status', [
                'pending',    // Registered with code but no order yet
                'completed',  // First order completed, rewards given
                'expired',    // Took too long to complete first order
                'cancelled',  // Order was cancelled
            ])->default('pending');
            
            // ====================
            // DISCOUNT DETAILS
            // ====================
            $table->decimal('discount_amount', 10, 2)->default(0); // KSh amount discounted
            $table->string('discount_type')->nullable(); // percentage, fixed_amount, etc.
            $table->decimal('order_value', 10, 2)->default(0); // Total order amount before discount
            $table->decimal('final_price', 10, 2)->default(0); // After discount
            
            // ====================
            // REFERRER REWARD (if applicable)
            // ====================
            $table->foreignId('referrer_id')->nullable()->constrained('customers')->onDelete('set null');
            $table->decimal('referrer_reward_amount', 10, 2)->nullable();
            $table->string('referrer_reward_type')->nullable(); // store_credit, percentage, etc.
            $table->boolean('referrer_reward_paid')->default(false);
            $table->timestamp('referrer_reward_paid_at')->nullable();
            
            // ====================
            // TRACKING CONTEXT
            // ====================
            $table->ipAddress('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->string('source')->nullable(); // web, mobile, api
            $table->string('utm_source')->nullable(); // Marketing tracking
            $table->string('utm_medium')->nullable();
            $table->string('utm_campaign')->nullable();
            
            // ====================
            // TIMESTAMPS
            // ====================
            $table->timestamp('registered_at')->nullable(); // When customer registered with code
            $table->timestamp('completed_at')->nullable(); // When first order was completed
            $table->timestamps();
            
            // ====================
            // INDEXES
            // ====================
            $table->index('referral_code_id');
            $table->index('customer_id');
            $table->index('referrer_id');
            $table->index('order_id'); // Index for performance (constraint added later when orders exist)
            $table->index('status');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('referral_code_usage');
    }
};