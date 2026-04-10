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
        Schema::create('referral_codes', function (Blueprint $table) {
            $table->id();
            
            // ====================
            // CAMPAIGN INFO
            // ====================
            $table->string('name'); // "Christmas Sale 2024", "John's Referral Code"
            $table->string('code')->unique(); // "XMAS2024", "JOHN2024ABC"
            $table->text('description')->nullable();
            
            // ====================
            // CODE TYPE & OWNERSHIP
            // ====================
            $table->enum('type', [
                'general',           // Public promo code (anyone can use)
                'customer_referral', // Personal customer referral code
                'first_time',        // Only for new customers
                'bulk_order',        // For wholesale/bulk purchases
                'vip',              // Exclusive VIP codes
                'birthday',         // Birthday special
                'event',            // Special events (Black Friday, etc)
            ])->default('general');
            
            // Owner customer ID - NO constraint yet (customers table doesn't exist)
            // Foreign key will be added in a later migration
            $table->unsignedBigInteger('customer_id')->nullable();
            
            // ====================
            // USAGE LIMITS
            // ====================
            $table->integer('max_uses')->nullable(); // null = unlimited, number = max total uses
            $table->integer('times_used')->default(0); // How many times used so far
            $table->integer('max_uses_per_customer')->default(1); // How many times ONE customer can use
            
            // ====================
            // VALIDITY PERIOD
            // ====================
            $table->timestamp('valid_from')->nullable(); // When code becomes active
            $table->timestamp('valid_until')->nullable(); // When code expires (null = never)
            
            // ====================
            // ORDER REQUIREMENTS
            // ====================
            $table->decimal('min_order_value', 10, 2)->nullable(); // Minimum cart total
            $table->integer('min_items')->nullable(); // Minimum items in cart
            
            // ====================
            // REFEREE REWARDS (Person using the code)
            // ====================
            $table->enum('reward_type', [
                'percentage',     // % discount
                'fixed_amount',   // Fixed KSh off
                'free_shipping',  // Free delivery
                'store_credit',   // Account credit
            ]);
            $table->decimal('reward_value', 10, 2); // e.g., 10.00 for 10% or KSh 1000
            
            // ====================
            // REFERRER REWARDS (Owner of customer_referral code)
            // ====================
            $table->enum('referrer_reward_type', [
                'none',
                'percentage',     // Permanent discount increase
                'fixed_amount',   // One-time payment
                'store_credit',   // Credit to account
                'points',         // Loyalty points
            ])->default('none');
            $table->decimal('referrer_reward_value', 10, 2)->nullable();
            
            // Total rewards given to referrer
            $table->decimal('total_referrer_rewards', 10, 2)->default(0);
            
            // ====================
            // CONDITIONS & RESTRICTIONS
            // ====================
            $table->json('applicable_categories')->nullable(); // [1, 5, 8] Category IDs
            $table->json('applicable_products')->nullable(); // [12, 45, 67] Product IDs
            $table->json('excluded_products')->nullable(); // [10, 20] Products that can't use code
            $table->json('applicable_customer_types')->nullable(); // ['business', 'wholesale']
            $table->json('applicable_tiers')->nullable(); // ['gold', 'platinum']
            
            // ====================
            // COMBINABILITY
            // ====================
            $table->boolean('stackable')->default(false); // Can combine with other codes?
            $table->json('cannot_combine_with')->nullable(); // Code IDs that can't be used together
            
            // ====================
            // STATISTICS & TRACKING
            // ====================
            $table->decimal('total_discount_given', 12, 2)->default(0); // Total KSh discounted
            $table->integer('total_orders')->default(0); // How many orders used this code
            $table->decimal('total_revenue', 12, 2)->default(0); // Total order value with this code
            $table->decimal('average_order_value', 10, 2)->default(0); // AVG order size
            
            // Conversion tracking
            $table->integer('views')->default(0); // How many times viewed/seen
            $table->integer('attempts')->default(0); // How many times tried to apply
            $table->integer('successful_uses')->default(0); // How many successful applications
            $table->decimal('conversion_rate', 5, 2)->default(0); // successful_uses / attempts * 100
            
            // ====================
            // STATUS & VISIBILITY
            // ====================
            $table->enum('status', [
                'draft',     // Not yet active
                'active',    // Currently usable
                'paused',    // Temporarily disabled
                'expired',   // Past valid_until date
                'depleted',  // Reached max_uses
                'archived',  // Historical record
            ])->default('draft');
            
            $table->boolean('is_public')->default(true); // Show in "Available Codes" list?
            $table->boolean('auto_apply')->default(false); // Apply automatically if conditions met?
            
            // ====================
            // NOTIFICATIONS & MARKETING
            // ====================
            $table->string('promo_image')->nullable(); // Banner image URL
            $table->string('promo_color')->nullable(); // Brand color for UI (hex code)
            $table->json('display_tags')->nullable(); // ["Hot Deal", "Limited Time", "VIP Only"]
            
            // Notification settings
            $table->boolean('notify_on_use')->default(false); // Notify owner when code used
            $table->boolean('notify_on_expiry')->default(false); // Warn before expiring
            
            // ====================
            // AUDIT & METADATA
            // ====================
            $table->foreignId('created_by')->constrained('users')->onDelete('cascade');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            
            $table->text('admin_notes')->nullable(); // Internal notes
            $table->json('metadata')->nullable(); // Extra flexible data
            
            $table->timestamps();
            $table->softDeletes();
            
            // ====================
            // INDEXES
            // ====================
            $table->index('code');
            $table->index('type');
            $table->index('status');
            $table->index('customer_id'); // Index for performance (constraint added later)
            $table->index(['valid_from', 'valid_until']);
            $table->index('is_public');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('referral_codes');
    }
};