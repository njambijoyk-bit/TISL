<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockJobLine extends Model
{
    public $timestamps = false;

    protected $table = 'stock_job_lines';

    protected $fillable = ['job_id', 'variant_id', 'batch_id', 'quantity', 'unit_cost', 'voucher_id', 'issued_at'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:4', 'issued_at' => 'datetime'];
}
