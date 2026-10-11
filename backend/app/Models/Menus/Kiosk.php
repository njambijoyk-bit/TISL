<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A self-order screen in the venue. The secret in its address is its only key. */
class Kiosk extends Model
{
    protected $table = 'menus_kiosks';

    protected $fillable = ['name', 'location_id', 'token', 'pay_at_screen', 'pay_at_counter', 'idle_seconds', 'welcome', 'is_active'];

    protected $casts = ['pay_at_screen' => 'boolean', 'pay_at_counter' => 'boolean', 'is_active' => 'boolean', 'idle_seconds' => 'integer'];

    protected $hidden = ['token'];
}
