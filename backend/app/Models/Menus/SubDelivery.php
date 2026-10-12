<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One delivery day of a subscription: what is in it, whether it was skipped, and the kitchen order made for it. */
class SubDelivery extends Model
{
    public const STATUSES = ['scheduled' => 'Coming', 'skipped' => 'Skipped', 'ordered' => 'In the kitchen', 'missed' => 'Not made (unpaid)', 'cancelled' => 'Cancelled'];

    protected $table = 'menus_sub_deliveries';

    protected $guarded = [];

    protected $casts = ['delivery_date' => 'date:Y-m-d', 'free' => 'boolean', 'meals' => 'array', 'item_ids' => 'array', 'skipped_at' => 'datetime'];
}
