<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A dish ordered, with its name, price and choices as they were when ordered. */
class MenuOrderLine extends Model
{
    protected $table = 'menus_order_lines';

    protected $guarded = [];

    /** Has script 203 been run: can a line keep the size and the sides it was ordered with? */
    public static function keepsSelection(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasColumn('menus_order_lines', 'selection');
    }

    protected $casts = ['quantity' => 'decimal:2', 'base_price' => 'decimal:2', 'unit_price' => 'decimal:2', 'options' => 'array', 'uses' => 'array', 'linked' => 'array', 'selection' => 'array', 'round' => 'integer'];
}
