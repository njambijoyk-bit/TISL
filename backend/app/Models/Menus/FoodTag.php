<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** An allergen or a "what it is" tag, kept by the admin. `rules_out` lists the diet badges it rules out. */
class FoodTag extends Model
{
    public const KINDS = ['allergen' => 'Allergen', 'tag' => 'What it is'];

    protected $table = 'menus_food_tags';

    protected $fillable = ['kind', 'code', 'label', 'rules_out', 'sort_order'];

    protected $casts = ['rules_out' => 'array', 'sort_order' => 'integer'];
}
