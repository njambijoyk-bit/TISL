<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Prepared stock of a recipe on the shelf at a branch: what a batch made and how much is left, costed for each unit. */
class PrepLot extends Model
{
    protected $table = 'menus_prep_lots';

    protected $fillable = ['recipe_id', 'location_id', 'run_id', 'lot_no', 'made_on', 'expiry_date', 'unit_cost', 'qty_in', 'qty_left', 'status'];

    protected $casts = ['made_on' => 'date', 'expiry_date' => 'date', 'unit_cost' => 'decimal:6', 'qty_in' => 'decimal:4', 'qty_left' => 'decimal:4'];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'recipe_id');
    }
}
