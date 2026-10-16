<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** What a stock count asks about one ingredient variant (script 187): quantities are in the base unit, input_qty/input_unit are as typed. */
class StockCountIngredientLine extends Model
{
    protected $table = 'stock_count_ingredient_lines';

    protected $fillable = ['count_id', 'item_id', 'expected_qty', 'counted_qty', 'input_qty', 'input_unit', 'unit_cost', 'variance_qty', 'value_change'];

    protected $casts = ['expected_qty' => 'decimal:4', 'counted_qty' => 'decimal:4', 'input_qty' => 'decimal:4', 'unit_cost' => 'decimal:6', 'variance_qty' => 'decimal:4', 'value_change' => 'decimal:2'];
}
