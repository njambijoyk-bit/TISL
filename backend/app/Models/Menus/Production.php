<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A batch of a made-ahead dish made from ingredients. */
class Production extends Model
{
    protected $table = 'menus_productions';

    protected $fillable = ['number', 'dish_id', 'recipe_id', 'location_id', 'portions', 'cost', 'unit_cost', 'batch_id', 'use_id', 'status', 'note', 'made_on', 'created_by', 'cancelled_at'];

    protected $casts = ['made_on' => 'date', 'cancelled_at' => 'datetime', 'portions' => 'decimal:4', 'cost' => 'decimal:2', 'unit_cost' => 'decimal:6'];
}
