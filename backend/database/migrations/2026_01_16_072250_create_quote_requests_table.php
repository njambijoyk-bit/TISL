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
        Schema::create('quote_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number')->unique();
            $table->foreignId('customer_id')->constrained('customers')->onDelete('cascade');
            
            // Request Type
            $table->enum('request_type', ['product', 'service', 'mixed', 'not_sure'])->default('not_sure');
            
            // What they want
            $table->string('request_title');
            $table->text('request_description');
            
            // Items Requested (can be multiple)
            $table->json('requested_items')->nullable();
            
            // Customer Requirements
            $table->string('budget_range', 100)->nullable();
            $table->string('timeline_needed', 100)->nullable();
            $table->text('delivery_location')->nullable();
            
            // Attachments (specs, images, reference docs)
            $table->json('attachments')->nullable();
            
            // Status
            $table->enum('status', ['pending', 'reviewing', 'quoted', 'rejected', 'expired'])->default('pending');
            $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium');
            
            // Assignment
            $table->foreignId('assigned_to')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('assigned_at')->nullable();
            
            // Quote Creation
            $table->foreignId('quote_id')->nullable()->constrained('quotes')->onDelete('set null');
            $table->timestamp('quoted_at')->nullable();
            
            // Communication
            $table->text('customer_notes')->nullable();
            $table->text('admin_notes')->nullable();
            $table->text('rejection_reason')->nullable();
            
            // Follow-up
            $table->boolean('requires_clarification')->default(false);
            $table->text('clarification_notes')->nullable();
            $table->timestamp('customer_responded_at')->nullable();
            
            // Timestamps
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes
            $table->index('request_number');
            $table->index('customer_id');
            $table->index('status');
            $table->index('assigned_to');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quote_requests');
    }
};