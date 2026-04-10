<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * This migration adds foreign key constraints AFTER all tables exist.
     * This solves the circular dependency problem:
     * - referral_codes.customer_id → customers.id
     * - customers.referred_by_code_id → referral_codes.id
     * 
     * By creating both tables first, then adding constraints, we avoid the circular dependency.
     */
    public function up(): void
    {
        // Add foreign key from referral_codes.customer_id to customers.id
        Schema::table('referral_codes', function (Blueprint $table) {
            $table->foreign('customer_id')
                ->references('id')
                ->on('customers')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('referral_codes', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
        });
    }
};