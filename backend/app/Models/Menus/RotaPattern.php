<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A repeating weekly pattern for a chef: one weekday, from and until, from a day to a day. It plans draft shifts; it is never itself a promise to the chef. */
class RotaPattern extends Model
{
    public const DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    protected $table = 'menus_rota_patterns';

    protected $guarded = [];

    protected $casts = ['valid_from' => 'date:Y-m-d', 'valid_to' => 'date:Y-m-d', 'is_active' => 'boolean', 'weekday' => 'integer'];
}
