<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** Something thrown away or eaten by staff. */
class Waste extends Model
{
    public const KINDS = ['spoilage' => 'Spoilage', 'over_prep' => 'Made too much', 'plate' => 'Plate waste', 'staff_meal' => 'Staff meal', 'other' => 'Other'];

    protected $table = 'menus_waste';

    protected $fillable = ['location_id', 'variant_id', 'quantity', 'cost', 'kind', 'note', 'voucher_ids', 'user_id', 'wasted_on', 'voided_at', 'voided_by'];

    protected $casts = ['quantity' => 'decimal:4', 'cost' => 'decimal:2', 'voucher_ids' => 'array', 'wasted_on' => 'date:Y-m-d', 'voided_at' => 'datetime'];
}
