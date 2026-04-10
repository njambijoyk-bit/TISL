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
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            
            // Polymorphic relationship (can be User or Customer)
            $table->string('notifiable_type'); // App\Models\User or App\Models\Customer
            $table->unsignedBigInteger('notifiable_id');
            $table->index(['notifiable_type', 'notifiable_id']);
            
            // Notification Type
            $table->string('type'); // 'order_placed', 'payment_received', 'referral_earned', etc.
            
            // Content
            $table->string('title');
            $table->text('message');
            $table->string('icon')->nullable(); // Icon name (e.g., 'shopping-cart', 'bell')
            $table->string('color')->nullable(); // Color for UI (e.g., 'blue', 'green', 'red')
            
            // Action
            $table->string('action_url')->nullable(); // URL to navigate to when clicked
            $table->string('action_text')->nullable(); // Button text (e.g., 'View Order', 'See Details')
            
            // Additional Data
            $table->json('data')->nullable(); // Extra data (order_id, amount, etc.)
            
            // Delivery Channels
            $table->json('channels')->nullable(); // ['database', 'email', 'sms', 'push']
            
            // Status
            $table->timestamp('read_at')->nullable(); // When user read the notification
            $table->timestamp('sent_at')->nullable(); // When notification was sent
            $table->timestamp('email_sent_at')->nullable(); // When email was sent
            $table->timestamp('sms_sent_at')->nullable(); // When SMS was sent
            $table->timestamp('push_sent_at')->nullable(); // When push notification was sent
            
            // Priority
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');
            
            $table->timestamps();
            
            // Indexes
            $table->index('type');
            $table->index('read_at');
            $table->index('created_at');
            $table->index('priority');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};