<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recipe extends Model
{

    protected $table = 'recipes';

    protected $fillable = ['variant_id', 'yield_qty', 'deduct_on_sale', 'note', 'is_active'];

    protected $casts = ['yield_qty' => 'decimal:4', 'deduct_on_sale' => 'boolean', 'is_active' => 'boolean'];

    public function items(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(RecipeItem::class, 'recipe_id');
    }
}
