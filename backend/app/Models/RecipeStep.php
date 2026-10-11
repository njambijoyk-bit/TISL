<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One step of a recipe's method. */
class RecipeStep extends Model
{
    protected $table = 'recipe_steps';

    protected $fillable = ['recipe_id', 'position', 'body', 'minutes', 'image'];

    protected $casts = ['position' => 'integer', 'minutes' => 'integer'];
}
