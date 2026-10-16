<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** What a choice does to the recipe: use more of an ingredient (add) or leave a recipe line out (remove). */
class OptionUse extends Model
{
    protected $table = 'menus_option_uses';

    public $timestamps = false;

    protected $fillable = ['option_id', 'mode', 'ingredient_id', 'unit', 'family_id', 'variant_id', 'quantity', 'unit_id'];

    protected $casts = ['quantity' => 'decimal:4'];
}
