<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A free condiment that goes with each sale of a dish (script 211). */
class DishCondiment extends Model
{
    protected $table = 'menus_dish_condiments';

    protected $fillable = ['dish_id', 'ingredient_id', 'quantity'];

    protected $casts = ['quantity' => 'integer'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
