<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A line in the record of waiting people being told (script 112). */
class StockWatchRun extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected $casts = ['stock' => 'float'];
}
