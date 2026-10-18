<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One batch of a recipe made: how much was planned and came out, who made it, what it cost, and how long it was expected to take and took. */
class PrepRun extends Model
{
    protected $table = 'menus_prep_runs';

    protected $fillable = ['number', 'recipe_id', 'location_id', 'chef_id', 'status', 'planned_qty', 'qty', 'unit_id', 'expected_minutes', 'started_at', 'finished_at', 'cost', 'unit_cost',
        'lot_id', 'use_id', 'client_key', 'note', 'made_on', 'created_by', 'cancelled_at'];

    protected $casts = ['made_on' => 'date', 'started_at' => 'datetime', 'finished_at' => 'datetime', 'cancelled_at' => 'datetime', 'planned_qty' => 'decimal:4', 'qty' => 'decimal:4',
        'cost' => 'decimal:2', 'unit_cost' => 'decimal:6', 'expected_minutes' => 'integer'];

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(DishRecipe::class, 'recipe_id');
    }

    public function chef(): BelongsTo
    {
        return $this->belongsTo(Chef::class, 'chef_id');
    }

    public function inputs(): HasMany
    {
        return $this->hasMany(PrepRunInput::class, 'run_id')->orderBy('id');
    }

    /** How long it took, in minutes, when both times were noted. */
    public function actualMinutes(): ?int
    {
        return $this->started_at && $this->finished_at ? (int) round($this->started_at->diffInSeconds($this->finished_at, false) / 60) : null;
    }
}
