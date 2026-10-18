<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One packaging item on an order, as it was checked out (script 209). */
class OrderPackaging extends Model
{
    protected $table = 'menus_order_packaging';

    protected $guarded = [];

    protected $casts = ['quantity' => 'integer', 'asked' => 'integer', 'unit_price' => 'decimal:2', 'amount' => 'decimal:2', 'charged' => 'boolean', 'compulsory' => 'boolean'];
}
