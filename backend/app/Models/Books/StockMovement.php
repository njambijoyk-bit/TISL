<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    public $timestamps = false;

    protected $table = 'stock_movements';

    protected $fillable = ['voucher_id', 'voucher_item_id', 'variant_id', 'location_id', 'quantity', 'movement_type', 'movement_date', 'reversed', 'created_at', 'batch_id', 'unit_cost', 'ref_type', 'ref_id', 'item_type', 'item_id'];

    /** A movement of a product variant names it twice (variant_id and item_type/item_id) so the stock reports can treat every kind of item alike. */
    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if ($m->item_id === null && $m->variant_id !== null && self::hasItemColumns('stock_movements')) {
                $m->item_type = 'product_variant';
                $m->item_id = $m->variant_id;
            }
        });
    }

    /** False until script 49 has been run, so saving stock keeps working in the meantime. */
    public static function hasItemColumns(string $table): bool
    {
        static $known = [];

        return $known[$table] ??= \Illuminate\Support\Facades\Schema::hasColumn($table, 'item_id');
    }

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:4', 'reversed' => 'boolean', 'movement_date' => 'date:Y-m-d'];
}
