<?php

namespace App\Models\Menus;

use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A real stock item in an ingredient family, and how much of the family's unit one stock unit of it holds. */
class IngredientVariant extends Model
{
    protected $table = 'menus_ingredient_variants';

    protected $fillable = ['family_id', 'variant_id', 'preference', 'units_per_stock', 'is_allowed', 'sell_retail'];

    protected $casts = ['preference' => 'integer', 'units_per_stock' => 'decimal:6', 'is_allowed' => 'boolean', 'sell_retail' => 'boolean'];

    public function family(): BelongsTo
    {
        return $this->belongsTo(IngredientFamily::class, 'family_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }
}
