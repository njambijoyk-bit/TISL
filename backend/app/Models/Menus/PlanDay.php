<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A dish on a weekday of a week of a plan's rotating menu. */
class PlanDay extends Model
{
    protected $table = 'menus_plan_days';

    protected $guarded = [];
}
