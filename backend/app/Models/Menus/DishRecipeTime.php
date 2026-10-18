<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** "A batch of up to `up_to_qty` takes `minutes`": one row of a recipe's time by batch size. */
class DishRecipeTime extends Model
{
    protected $table = 'menus_recipe_times';

    protected $fillable = ['recipe_id', 'up_to_qty', 'minutes'];

    protected $casts = ['up_to_qty' => 'decimal:4', 'minutes' => 'integer'];
}
