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
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            
            // Basic Authentication Info
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            
            // Phone for SMS/WhatsApp
            $table->string('phone')->unique()->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            
            // User Role & Permissions
            $table->enum('role', [
                'super_admin',    // Full access to everything
                'admin',          // Most admin privileges
                'manager',        // Can manage orders, products
                'sales_rep',      // Can view/manage assigned customers
                'customer'        // Regular customer
            ])->default('customer');
            
            $table->json('permissions')->nullable(); // Specific permissions for granular control
            
            // Account Status
            $table->enum('status', [
                'active',
                'inactive',
                'suspended',
                'pending_verification'
            ])->default('pending_verification');
            
            // Profile Information
            $table->string('profile_picture')->nullable();
            $table->text('bio')->nullable();
            
            // OAuth/Social Login
            $table->string('google_id')->unique()->nullable();
            $table->string('apple_id')->unique()->nullable();
            $table->string('microsoft_id')->unique()->nullable();
            $table->enum('oauth_provider', ['google', 'apple', 'microsoft', 'email'])->default('email');
            
            // Security & Activity Tracking
            $table->timestamp('last_login_at')->nullable();
            $table->ipAddress('last_login_ip')->nullable();
            $table->string('last_login_user_agent')->nullable();
            $table->integer('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable(); // Account lockout after failed attempts
            
            // Password Reset
            $table->timestamp('password_changed_at')->nullable();
            $table->boolean('force_password_change')->default(false); // Force change on next login
            
            // Notifications & Preferences
            $table->boolean('email_notifications')->default(true);
            $table->boolean('sms_notifications')->default(false);
            
            // Admin-specific fields
            $table->string('employee_id')->unique()->nullable(); // For admin/staff users
            $table->string('department')->nullable(); // Sales, Warehouse, Finance, etc.
            $table->timestamp('hired_at')->nullable();
            
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('email');
            $table->index('phone');
            $table->index('role');
            $table->index('status');
            $table->index('google_id');
            $table->index('apple_id');
            $table->index('microsoft_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};