<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** How much of a side goes in one serving size, in the side's unit. */
class SideAmount extends Model
{
    protected $table = 'menus_side_amounts';

    protected $fillable = ['side_id', 'serving_id', 'amount'];

    protected $casts = ['amount' => 'decimal:4'];

    public function serving(): BelongsTo
    {
        return $this->belongsTo(Serving::class, 'serving_id');
    }
}
