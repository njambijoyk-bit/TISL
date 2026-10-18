<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A recipe, written on ingredients (Menus' own stock): the lines are for `yield_qty` portions. Made to order: a sale uses the ingredients.
 * It is either a dish's recipe (`dish_id` set, named after the dish) or a recipe of its own (`dish_id` empty, with a `name`).
 */
class DishRecipe extends Model
{
    public const VISIBILITY = ['internal' => 'The kitchen only', 'public' => 'May be shown on the website and in courses'];

    protected $table = 'menus_recipes';

    protected $fillable = ['dish_id', 'copied_from_recipe_id', 'name', 'yield_qty', 'yield_unit_id', 'made_to_order', 'note', 'visibility', 'prep_minutes', 'cook_minutes', 'is_active'];

    protected $casts = ['yield_qty' => 'decimal:4', 'made_to_order' => 'boolean', 'is_active' => 'boolean'];

    /** What to call it: its own name, else the dish's. */
    public function title(): string
    {
        return $this->name ?: ($this->dish?->name ?? 'Recipe');
    }

    public function scopeStandalone($q)
    {
        return $q->whereNull('dish_id');
    }

    /** The unit a batch is counted in; empty means portions. */
    public function yieldUnit(): BelongsTo
    {
        return $this->belongsTo(\App\Models\UnitOfMeasure::class, 'yield_unit_id');
    }

    /** What one batch makes, in words: "2 kg" or "4 portions". */
    public function yieldLabel(): string
    {
        $n = rtrim(rtrim(number_format((float) $this->yield_qty, 3, '.', ''), '0'), '.');

        return $n.' '.($this->yieldUnit?->code ?? ((float) $this->yield_qty === 1.0 ? 'portion' : 'portions'));
    }

    public function dish(): BelongsTo
    {
        return $this->belongsTo(Dish::class, 'dish_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(DishRecipeLine::class, 'recipe_id')->orderBy('position')->orderBy('id');
    }

    /** The time by batch size, smallest first (script 196). */
    public function times(): HasMany
    {
        return $this->hasMany(DishRecipeTime::class, 'recipe_id')->orderBy('up_to_qty');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(DishRecipeStep::class, 'recipe_id')->orderBy('position')->orderBy('id');
    }
}
