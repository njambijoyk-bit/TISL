<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockCountLine extends Model
{
    public $timestamps = false;
    protected $table = 'stock_count_lines';

    protected $fillable = ['count_id', 'variant_id', 'batch_id', 'expected_qty', 'counted_qty', 'unit_cost'];

    protected $casts = ['expected_qty' => 'decimal:4', 'counted_qty' => 'decimal:4', 'unit_cost' => 'decimal:4'];
}
