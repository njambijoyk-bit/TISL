<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One stretch of a resource's working week (0 = Sunday … 6 = Saturday). */
class ResourceHour extends Model
{
    public $timestamps = false;

    protected $table = 'resource_hours';

    protected $fillable = ['resource_id', 'weekday', 'starts_at', 'ends_at'];

    protected $casts = ['weekday' => 'integer'];
}
