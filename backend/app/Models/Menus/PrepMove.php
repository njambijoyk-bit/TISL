<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One change to prepared stock (in is positive, out is negative). */
class PrepMove extends Model
{
    protected $table = 'menus_prep_moves';

    protected $fillable = ['recipe_id', 'location_id', 'lot_id', 'kind', 'quantity', 'unit_cost', 'run_id', 'ref_type', 'ref_id', 'note', 'moved_on', 'created_by'];

    protected $casts = ['moved_on' => 'date', 'quantity' => 'decimal:4', 'unit_cost' => 'decimal:6'];
}
