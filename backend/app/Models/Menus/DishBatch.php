<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** Portions of a made-ahead dish on the shelf at a branch, costed per portion. */
class DishBatch extends Model
{
    protected $table = 'menus_dish_batches';

    protected $fillable = ['dish_id', 'location_id', 'production_id', 'batch_no', 'made_on', 'expiry_date', 'unit_cost', 'qty_in', 'qty_left', 'status'];

    protected $casts = ['made_on' => 'date', 'expiry_date' => 'date', 'unit_cost' => 'decimal:6', 'qty_in' => 'decimal:4', 'qty_left' => 'decimal:4'];
}
