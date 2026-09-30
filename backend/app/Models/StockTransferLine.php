<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockTransferLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['transfer_id', 'variant_id', 'batch_id', 'quantity', 'received_qty', 'unit_cost'];

    protected $casts = ['quantity' => 'decimal:4', 'received_qty' => 'decimal:4', 'unit_cost' => 'decimal:4'];
}
