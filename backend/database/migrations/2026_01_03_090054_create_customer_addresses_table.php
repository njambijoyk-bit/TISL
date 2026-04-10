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
        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            
            // Address Type & Label
            $table->enum('address_type', [
                'home',
                'office',
                'warehouse',
                'billing',
                'shipping',
                'other'
            ])->default('home');
            $table->string('label')->nullable(); // e.g., "Main Office", "Warehouse 2"
            
            // Contact Information
            $table->string('contact_name')->nullable();
            $table->string('contact_phone')->nullable();
            
            // Address Details
            $table->string('address_line_1');
            $table->string('address_line_2')->nullable();
            $table->string('city');
            $table->string('state')->nullable(); // County/State
            $table->string('postal_code')->nullable();
            $table->string('country')->default('Kenya');
            $table->string('landmark')->nullable(); // Near landmark for easier delivery
            $table->text('delivery_instructions')->nullable();
            
            // Default Settings
            $table->boolean('is_default_shipping')->default(false);
            $table->boolean('is_default_billing')->default(false);
            
            // Geolocation (Optional - for distance calculation & delivery zones)
            $table->decimal('latitude', 10, 8)->nullable();
            $table->decimal('longitude', 11, 8)->nullable();
            
            // Verification
            $table->boolean('verified')->default(false);
            $table->timestamp('verified_at')->nullable();
            
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('customer_id');
            $table->index('address_type');
            $table->index(['is_default_shipping', 'customer_id']);
            $table->index(['is_default_billing', 'customer_id']);
            $table->index('city');
            $table->index('verified');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customer_addresses');
    }
};