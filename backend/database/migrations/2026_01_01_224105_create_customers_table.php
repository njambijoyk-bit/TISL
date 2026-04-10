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
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            
            // Link to users table (for registered customers)
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->onDelete('cascade');
            
            // Basic Information
            $table->string('customer_number')->unique(); // e.g., "CUST-2024-0001"
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique();
            $table->string('phone')->unique();
            $table->string('profile_image')->nullable(); // Profile picture
            $table->date('birthday')->nullable(); // For birthday campaigns
            $table->string('alternate_phone')->nullable();
            
            // Company Information (for B2B customers)
            $table->string('company_name')->nullable();
            $table->string('company_registration_number')->nullable();
            $table->string('tax_id')->nullable(); // KRA PIN or VAT number
            
            // Customer Type & Classification
            $table->enum('customer_type', [
                'individual',    // Retail customer
                'business',      // B2B customer
                'wholesale',     // Wholesale buyer
                'contractor'     // Construction/project contractor
            ])->default('individual');
            
            $table->enum('tier', [
                'bronze',   // New customer
                'silver',   // Regular customer
                'gold',     // VIP customer
                'platinum'  // Top-tier customer
            ])->default('bronze');
            
            // Default Addresses
            $table->text('default_shipping_address')->nullable();
            $table->text('default_billing_address')->nullable();
            
            // Business/Credit Terms (for B2B customers)
            $table->boolean('has_credit_account')->default(false);
            $table->decimal('credit_limit', 12, 2)->nullable(); // Maximum credit allowed
            $table->decimal('credit_used', 12, 2)->default(0.00); // Current credit used
            
            // Customer Statistics (auto-calculated)
            $table->integer('total_orders')->default(0);
            $table->decimal('total_spent', 12, 2)->default(0.00);
            $table->decimal('average_order_value', 10, 2)->default(0.00);
            $table->timestamp('first_order_date')->nullable();
            $table->timestamp('last_order_date')->nullable();
            
            // Loyalty & Rewards
            $table->decimal('discount_percentage', 5, 2)->default(0.00); // e.g., 15.00 = 15% discount
            $table->decimal('store_credit', 10, 2)->default(0.00); // Account credit balance
            $table->integer('loyalty_points')->default(0); // Loyalty program points
            
            // Account Status
            $table->enum('status', [
                'active',
                'inactive',
                'suspended',
                'blacklisted'
            ])->default('active');
            $table->text('status_reason')->nullable(); // Why suspended/blacklisted
            
            // Verification & KYC
            $table->boolean('is_verified')->default(false);
            $table->boolean('email_verified')->default(false);
            $table->boolean('phone_verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            
            // Tags & Notes (for admin use)
            $table->json('tags')->nullable(); // e.g., ["bulk_buyer", "contractor", "repeat_customer"]
            $table->text('notes')->nullable(); // Internal admin notes
            
            // Referral System (Connection to referrer)
            $table->foreignId('referred_by_code_id')->nullable()
                ->constrained('referral_codes')
                ->onDelete('set null'); // Which referral code was used
            
            $table->foreignId('referred_by_customer_id')->nullable()
                ->constrained('customers')
                ->onDelete('set null'); // Who referred them
            
            $table->timestamp('referral_registered_at')->nullable(); // When they registered with referral
            $table->timestamp('referral_completed_at')->nullable(); // When first order completed
            
            // Sales Representative Assignment
            $table->foreignId('assigned_sales_rep')->nullable()->constrained('users')->onDelete('set null');
            
            // Preferences & Settings
            $table->json('preferences')->nullable(); // Favorite brands, categories, newsletter, etc.
            
            // Social Media & Additional Info
            $table->string('website')->nullable();
            $table->string('whatsapp')->nullable();
            
            // Audit Trail
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('last_login_at')->nullable();
            $table->ipAddress('last_login_ip')->nullable();
            
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('customer_number');
            $table->index('email');
            $table->index('phone');
            $table->index('customer_type');
            $table->index('status');
            $table->index('tier');
            $table->index('user_id');
            $table->index('referred_by_code_id');
            $table->index('referred_by_customer_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};