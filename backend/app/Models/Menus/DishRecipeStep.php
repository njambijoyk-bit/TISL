<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

class DishRecipeStep extends Model
{
    protected $table = 'menus_recipe_steps';

    protected $fillable = ['recipe_id', 'position', 'body', 'minutes', 'image'];
}
