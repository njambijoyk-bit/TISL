<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A count of the prepared food on the shelf at a branch. */
class PrepCount extends Model
{
    protected $table = 'menus_prep_counts';

    protected $fillable = ['number', 'location_id', 'counted_on', 'note', 'value_change', 'journal_id', 'created_by'];

    protected $casts = ['counted_on' => 'date', 'value_change' => 'decimal:2'];

    public function lines(): HasMany
    {
        return $this->hasMany(PrepCountLine::class, 'count_id')->orderBy('id');
    }
}
