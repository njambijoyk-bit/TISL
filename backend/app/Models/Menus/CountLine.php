<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One variant counted. */
class CountLine extends Model
{
    protected $table = 'menus_count_lines';

    protected $fillable = ['count_id', 'item_id', 'input_qty', 'input_unit', 'expected', 'counted', 'variance', 'value_change'];

    protected $casts = ['input_qty' => 'decimal:4', 'expected' => 'decimal:4', 'counted' => 'decimal:4', 'variance' => 'decimal:4', 'value_change' => 'decimal:2'];
}
