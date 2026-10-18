<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What a batch used of one ingredient: what the recipe said and what was really used, in the ingredient's base unit. */
class PrepRunInput extends Model
{
    protected $table = 'menus_prep_run_inputs';

    protected $fillable = ['run_id', 'ingredient_id', 'expected_qty', 'used_qty', 'cost'];

    protected $casts = ['expected_qty' => 'decimal:4', 'used_qty' => 'decimal:4', 'cost' => 'decimal:2'];

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
