<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A place food is made, with its own screen. */
class Station extends Model
{
    protected $table = 'menus_stations';

    protected $fillable = ['name', 'location_id', 'target_minutes', 'is_default', 'is_active', 'sort_order'];

    protected $casts = ['is_default' => 'boolean', 'is_active' => 'boolean', 'target_minutes' => 'integer', 'sort_order' => 'integer'];
}
