<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a recipe: an ingredient (in its base or alternate unit) or, when `sub_recipe_id` is set, another recipe of its own (in that recipe's unit, or portions), with the waste lost in preparing it.
 * An ingredient line may name the variant it takes (`item_id`, script 225); empty leaves it to the ingredient's pick rule.
 * An ingredient line of a recipe made to order may say the customer can leave it out (`removable`) or ask for more of it (`extra_allowed`), from script 205.
 */
class DishRecipeLine extends Model
{
    protected $table = 'menus_recipe_lines';

    protected $fillable = ['recipe_id', 'ingredient_id', 'sub_recipe_id', 'quantity', 'unit', 'waste_pct', 'position', 'removable', 'extra_allowed', 'item_id'];

    protected $casts = ['quantity' => 'decimal:4', 'waste_pct' => 'decimal:2', 'position' => 'integer', 'removable' => 'boolean', 'extra_allowed' => 'boolean', 'item_id' => 'integer'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    public function subRecipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'sub_recipe_id');
    }
}
