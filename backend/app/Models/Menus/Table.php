<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A table on the floor. */
class Table extends Model
{
    protected $table = 'menus_tables';

    protected $fillable = ['area_id', 'name', 'seats', 'shape', 'x', 'y', 'w', 'h', 'qr_token', 'resource_id', 'state', 'guests', 'seated_at', 'bill_asked_at', 'merged_into', 'sort_order', 'is_active'];

    protected $casts = ['seats' => 'integer', 'x' => 'integer', 'y' => 'integer', 'w' => 'integer', 'h' => 'integer', 'is_active' => 'boolean', 'seated_at' => 'datetime', 'bill_asked_at' => 'datetime'];

    public function area(): BelongsTo
    {
        return $this->belongsTo(Area::class, 'area_id');
    }
}
