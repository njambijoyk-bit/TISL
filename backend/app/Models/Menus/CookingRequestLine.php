<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One line of a quote: a dish (with the choices made) or a free line staff typed. */
class CookingRequestLine extends Model
{
    protected $table = 'menus_request_lines';

    protected $guarded = [];

    protected $casts = ['quantity' => 'decimal:2', 'unit_price' => 'decimal:2', 'per_head' => 'boolean', 'options' => 'array'];
}
