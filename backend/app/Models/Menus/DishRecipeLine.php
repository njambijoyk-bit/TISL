<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One ingredient in a recipe, in the ingredient's base or alternate unit, with the waste lost in preparing it. */
class DishRecipeLine extends Model
{
    protected $table = 'menus_recipe_lines';

    protected $fillable = ['recipe_id', 'ingredient_id', 'quantity', 'unit', 'waste_pct', 'position'];

    protected $casts = ['quantity' => 'decimal:4', 'waste_pct' => 'decimal:2', 'position' => 'integer'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
