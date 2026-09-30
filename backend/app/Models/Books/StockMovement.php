<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    public $timestamps = false;

    protected $table = 'stock_movements';

    protected $fillable = ['voucher_id', 'voucher_item_id', 'variant_id', 'location_id', 'quantity', 'movement_type', 'movement_date', 'reversed', 'created_at', 'batch_id', 'unit_cost', 'ref_type', 'ref_id'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:4', 'reversed' => 'boolean', 'movement_date' => 'date:Y-m-d'];
}
