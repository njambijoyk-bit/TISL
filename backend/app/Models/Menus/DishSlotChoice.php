<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A side a slot may be filled with, with what choosing it adds to the price. */
class DishSlotChoice extends Model
{
    protected $table = 'menus_dish_slot_choices';

    protected $fillable = ['slot_id', 'side_id', 'upcharge', 'is_default', 'sort_order'];

    protected $casts = ['upcharge' => 'decimal:2', 'is_default' => 'boolean', 'sort_order' => 'integer'];

    public function slot(): BelongsTo
    {
        return $this->belongsTo(DishSlot::class, 'slot_id');
    }

    public function side(): BelongsTo
    {
        return $this->belongsTo(Side::class, 'side_id');
    }
}
