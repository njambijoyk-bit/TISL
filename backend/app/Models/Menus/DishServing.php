<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A size a dish is sold in and its price. */
class DishServing extends Model
{
    protected $table = 'menus_dish_servings';

    protected $fillable = ['dish_id', 'serving_id', 'price'];

    protected $casts = ['price' => 'decimal:2'];

    public function serving(): BelongsTo
    {
        return $this->belongsTo(Serving::class, 'serving_id');
    }
}
