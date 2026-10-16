<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A variant of an ingredient: "Exe 2 kg", "Pembe 24 kg". It uses the ingredient's units; its pack size (kept in the base unit) lets stock be counted in packs. */
class IngredientItem extends Model
{
    protected $table = 'menus_ingredient_items';

    protected $fillable = ['ingredient_id', 'name', 'code', 'pack_size', 'track_expiry', 'preference', 'is_allowed', 'is_active'];

    protected $casts = ['pack_size' => 'decimal:6', 'track_expiry' => 'boolean', 'preference' => 'integer', 'is_allowed' => 'boolean', 'is_active' => 'boolean'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
