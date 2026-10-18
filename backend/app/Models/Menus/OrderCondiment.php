<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** What an order was allowed and what it was given of one free condiment (script 211). */
class OrderCondiment extends Model
{
    protected $table = 'menus_order_condiments';

    protected $guarded = [];

    protected $casts = ['allowed' => 'integer', 'given' => 'integer'];
}
