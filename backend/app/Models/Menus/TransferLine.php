<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One variant sent. */
class TransferLine extends Model
{
    protected $table = 'menus_transfer_lines';

    protected $fillable = ['transfer_id', 'item_id', 'quantity', 'unit_cost'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:6'];
}
