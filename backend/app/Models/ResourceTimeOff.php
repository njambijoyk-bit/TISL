<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A time a resource is not available: leave, a blocked day, a repair. */
class ResourceTimeOff extends Model
{
    protected $table = 'resource_time_off';

    protected $fillable = ['resource_id', 'starts_at', 'ends_at', 'reason', 'created_by'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime'];
}
