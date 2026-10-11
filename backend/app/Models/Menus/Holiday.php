<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A public holiday, for every branch or one. */
class Holiday extends Model
{
    protected $table = 'menus_holidays';

    protected $guarded = [];

    protected $casts = ['holiday_date' => 'date:Y-m-d'];
}
