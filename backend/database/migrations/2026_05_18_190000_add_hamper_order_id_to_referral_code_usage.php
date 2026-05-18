<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('referral_code_usage', function (Blueprint $table) {
            $table->unsignedBigInteger('hamper_order_id')->nullable()->after('order_id');
            $table->index('hamper_order_id');
        });
    }

    public function down(): void
    {
        Schema::table('referral_code_usage', function (Blueprint $table) {
            $table->dropIndex(['hamper_order_id']);
            $table->dropColumn('hamper_order_id');
        });
    }
};
