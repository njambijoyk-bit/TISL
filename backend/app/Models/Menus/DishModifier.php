<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The policy that prices one removal or extra of an ingredient on a dish (script 206). */
class DishModifier extends Model
{
    public const KINDS = ['remove' => 'Left out', 'extra' => 'Extra'];

    protected $table = 'menus_dish_modifiers';

    protected $fillable = ['dish_id', 'ingredient_id', 'kind', 'policy_id'];

    public function policy(): BelongsTo
    {
        return $this->belongsTo(ModifierPolicy::class, 'policy_id');
    }
}
