<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A dish's recipe, written on ingredients (Menus' own stock): the lines are for `yield_qty` portions. Made to order: a sale uses the ingredients. */
class DishRecipe extends Model
{
    public const VISIBILITY = ['internal' => 'The kitchen only', 'public' => 'May be shown on the website and in courses'];

    protected $table = 'menus_recipes';

    protected $fillable = ['dish_id', 'yield_qty', 'made_to_order', 'note', 'visibility', 'prep_minutes', 'cook_minutes', 'is_active'];

    protected $casts = ['yield_qty' => 'decimal:4', 'made_to_order' => 'boolean', 'is_active' => 'boolean'];

    public function dish(): BelongsTo
    {
        return $this->belongsTo(Dish::class, 'dish_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(DishRecipeLine::class, 'recipe_id')->orderBy('position')->orderBy('id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(DishRecipeStep::class, 'recipe_id')->orderBy('position')->orderBy('id');
    }
}
