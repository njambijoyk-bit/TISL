<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An ingredient lot on the road between branches (script 187): quantities in the ingredient's base unit. */
class StockTransferIngredientLine extends Model
{
    protected $table = 'stock_transfer_ingredient_lines';

    protected $fillable = ['transfer_id', 'item_id', 'batch_id', 'quantity', 'unit_cost', 'received_qty'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:6', 'received_qty' => 'decimal:4'];
}
