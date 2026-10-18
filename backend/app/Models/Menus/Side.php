<?php

namespace App\Models\Menus;

use App\Models\UnitOfMeasure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** What is served (ugali, kale, a soda): made from a recipe of its own, or a ready-to-serve ingredient, with how much of it goes in each serving size. */
class Side extends Model
{
    protected $table = 'menus_sides';

    protected $fillable = ['name', 'recipe_id', 'ingredient_id', 'from_dish_id', 'unit_id', 'base_amount', 'station_id', 'task_minutes', 'note', 'sort_order', 'is_active'];

    protected $casts = ['base_amount' => 'decimal:4', 'sort_order' => 'integer', 'is_active' => 'boolean'];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'recipe_id');
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_id');
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class, 'station_id');
    }

    public function amounts(): HasMany
    {
        return $this->hasMany(SideAmount::class, 'side_id');
    }
}
