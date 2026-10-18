<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a recipe: an ingredient (in its base or alternate unit) or, when `sub_recipe_id` is set, another recipe of its own (in that recipe's unit, or portions), with the waste lost in preparing it.
 */
class DishRecipeLine extends Model
{
    protected $table = 'menus_recipe_lines';

    protected $fillable = ['recipe_id', 'ingredient_id', 'sub_recipe_id', 'quantity', 'unit', 'waste_pct', 'position'];

    protected $casts = ['quantity' => 'decimal:4', 'waste_pct' => 'decimal:2', 'position' => 'integer'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    public function subRecipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'sub_recipe_id');
    }
}
