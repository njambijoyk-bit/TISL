<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

/** A campaign's offer to sell one variant before it is here: a limit (all branches together), a closing date, expected dates and terms. */
class PreorderOffer extends Model
{
    protected $fillable = ['campaign_id', 'product_id', 'variant_id', 'limit_total', 'max_per_customer', 'deposit_percent', 'closes_at', 'expected_from', 'expected_until', 'terms', 'is_active', 'created_by'];

    protected $casts = ['closes_at' => 'datetime', 'expected_from' => 'date:Y-m-d', 'expected_until' => 'date:Y-m-d', 'is_active' => 'boolean', 'limit_total' => 'integer', 'max_per_customer' => 'integer', 'deposit_percent' => 'integer'];

    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('preorder_offers') && Schema::hasTable('preorder_lines') && Schema::hasColumn('variant_location_stock', 'preorder_enabled');
    }

    /** Has script 107 been run (the per-customer maximum exists)? */
    public static function hasMax(): bool
    {
        static $has;

        return $has ??= Schema::hasTable('preorder_offers') && Schema::hasColumn('preorder_offers', 'max_per_customer');
    }

    /** Has script 115 been run (an offer can take a deposit)? */
    public static function hasDeposit(): bool
    {
        static $has;
        $check = fn () => Schema::hasTable('preorder_offers') && Schema::hasColumn('preorder_offers', 'deposit_percent');

        return app()->runningUnitTests() ? $check() : ($has ??= $check());
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }
}
