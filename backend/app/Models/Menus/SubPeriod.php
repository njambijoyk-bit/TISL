<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One week of a subscription, billed ahead as a Sales Order. */
class SubPeriod extends Model
{
    protected $table = 'menus_sub_periods';

    protected $guarded = [];

    protected $casts = ['week_start' => 'date:Y-m-d', 'subtotal' => 'decimal:2', 'tax_total' => 'decimal:2', 'total' => 'decimal:2', 'pay_by' => 'datetime', 'paid_at' => 'datetime', 'reminded_at' => 'datetime'];

    public function deliveries(): HasMany
    {
        return $this->hasMany(SubDelivery::class, 'period_id')->orderBy('delivery_date');
    }
}
