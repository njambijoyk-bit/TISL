<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A stock take at a branch: what was counted against what the system expected. */
class Count extends Model
{
    protected $table = 'menus_counts';

    protected $fillable = ['number', 'location_id', 'counted_on', 'note', 'value_change', 'journal_id', 'created_by'];

    protected $casts = ['counted_on' => 'date', 'value_change' => 'decimal:2'];

    public function lines(): HasMany
    {
        return $this->hasMany(CountLine::class, 'count_id');
    }
}
