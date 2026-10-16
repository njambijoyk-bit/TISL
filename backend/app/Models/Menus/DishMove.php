<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One change to the portions of a made-ahead dish (in is positive, out is negative). */
class DishMove extends Model
{
    protected $table = 'menus_dish_moves';

    protected $fillable = ['dish_id', 'location_id', 'batch_id', 'kind', 'quantity', 'unit_cost', 'use_id', 'production_id', 'ref_type', 'ref_id', 'note', 'moved_on', 'created_by'];

    protected $casts = ['moved_on' => 'date', 'quantity' => 'decimal:4', 'unit_cost' => 'decimal:6'];
}
