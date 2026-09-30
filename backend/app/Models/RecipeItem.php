<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RecipeItem extends Model
{
    public $timestamps = false;
    protected $table = 'recipe_items';

    protected $fillable = ['recipe_id', 'variant_id', 'quantity'];

    protected $casts = ['quantity' => 'decimal:4'];
}
