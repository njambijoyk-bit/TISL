<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What a count found for one recipe's prepared food: expected, counted, the difference and what it is worth. */
class PrepCountLine extends Model
{
    protected $table = 'menus_prep_count_lines';

    protected $fillable = ['count_id', 'recipe_id', 'expected', 'counted', 'variance', 'value_change'];

    protected $casts = ['expected' => 'decimal:4', 'counted' => 'decimal:4', 'variance' => 'decimal:4', 'value_change' => 'decimal:2'];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'recipe_id');
    }
}
