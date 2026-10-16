<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One time ingredient stock was used for a dish: what it cost and the journal that booked it, so it can be undone. */
class StockUse extends Model
{
    protected $table = 'menus_uses';

    protected $fillable = ['ref_type', 'ref_id', 'dish_id', 'recipe_id', 'location_id', 'portions', 'cost', 'journal_id', 'status', 'created_by'];

    protected $casts = ['portions' => 'decimal:4', 'cost' => 'decimal:2'];
}
