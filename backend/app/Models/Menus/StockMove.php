<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One change to ingredient stock (base unit; in is positive, out is negative). */
class StockMove extends Model
{
    protected $table = 'menus_stock_moves';

    protected $fillable = ['item_id', 'location_id', 'batch_id', 'kind', 'quantity', 'unit_cost', 'use_id', 'receipt_id', 'voucher_id', 'ref_type', 'ref_id', 'note', 'moved_on', 'created_by'];

    protected $casts = ['moved_on' => 'date', 'quantity' => 'decimal:4', 'unit_cost' => 'decimal:6'];
}
