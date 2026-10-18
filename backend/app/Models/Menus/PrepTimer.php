<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A batch on the stove: how long it should take and when it is ready (script 214). */
class PrepTimer extends Model
{
    protected $table = 'menus_prep_timers';

    protected $guarded = [];

    protected $casts = ['planned_qty' => 'decimal:4', 'expected_minutes' => 'integer', 'started_at' => 'datetime', 'ready_at' => 'datetime', 'finished_at' => 'datetime'];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'recipe_id');
    }

    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class, 'chef_id');
    }
}
