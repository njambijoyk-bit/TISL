<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductionLine extends Model
{
    public $timestamps = false;
    protected $table = 'production_lines';

    protected $fillable = ['production_id', 'variant_id', 'batch_id', 'quantity', 'unit_cost'];

    protected $casts = ['quantity' => 'decimal:4', 'unit_cost' => 'decimal:4'];
}
