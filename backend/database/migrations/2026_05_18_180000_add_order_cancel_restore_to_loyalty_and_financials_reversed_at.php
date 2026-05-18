<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add order_cancel and order_restore to loyalty_point_transactions.type ENUM
        DB::statement("ALTER TABLE `loyalty_point_transactions` MODIFY `type` ENUM(
            'order_earn',
            'admin_grant',
            'admin_deduct',
            'referral_bonus',
            'birthday_bonus',
            'review_bonus',
            'redemption',
            'expiry',
            'adjustment',
            'order_cancel',
            'order_restore'
        ) NOT NULL");

        // 2. Add financials_reversed_at to hamper_orders for idempotent cancel/restore
        Schema::table('hamper_orders', function (Blueprint $table) {
            $table->timestamp('financials_reversed_at')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        // Revert ENUM (only safe if no rows use the new values)
        DB::statement("ALTER TABLE `loyalty_point_transactions` MODIFY `type` ENUM(
            'order_earn',
            'admin_grant',
            'admin_deduct',
            'referral_bonus',
            'birthday_bonus',
            'review_bonus',
            'redemption',
            'expiry',
            'adjustment'
        ) NOT NULL");

        Schema::table('hamper_orders', function (Blueprint $table) {
            $table->dropColumn('financials_reversed_at');
        });
    }
};
