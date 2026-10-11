<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recipe extends Model
{

    protected $table = 'recipes';

    public const VISIBILITY = ['internal' => 'Kitchen only', 'publishable' => 'May be shown on the website and in courses'];

    protected $fillable = ['variant_id', 'yield_qty', 'deduct_on_sale', 'note', 'is_active', 'visibility', 'prep_minutes', 'cook_minutes'];

    protected $casts = ['yield_qty' => 'decimal:4', 'deduct_on_sale' => 'boolean', 'is_active' => 'boolean'];

    public function steps(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(RecipeStep::class, 'recipe_id')->orderBy('position')->orderBy('id');
    }

    public function items(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(RecipeItem::class, 'recipe_id');
    }
}
