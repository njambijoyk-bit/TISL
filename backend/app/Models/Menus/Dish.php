<?php

namespace App\Models\Menus;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Recipe;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** What a customer sees on a menu. Behind it is one hidden stock item (a product variant) so the books, stock and recipes treat it like any other item. */
class Dish extends Model
{
    protected $table = 'menus_dishes';

    protected $fillable = ['name', 'slug', 'description', 'photo', 'product_id', 'variant_id', 'prep_minutes', 'lead_hours', 'station_id', 'chef_id', 'allergens_override', 'tags_override', 'sold_out_on', 'sort_order', 'is_active', 'created_by'];

    protected $casts = ['allergens_override' => 'array', 'tags_override' => 'array', 'sold_out_on' => 'date:Y-m-d', 'is_active' => 'boolean', 'prep_minutes' => 'integer', 'lead_hours' => 'integer', 'sort_order' => 'integer'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    /** The recipe written on ingredients (Menus' own stock). Takes the place of `recipe()`, which pointed at product variants. */
    public function menuRecipe(): HasOne
    {
        return $this->hasOne(DishRecipe::class, 'dish_id');
    }

    public function recipe(): HasOne
    {
        return $this->hasOne(Recipe::class, 'variant_id', 'variant_id');
    }
}
