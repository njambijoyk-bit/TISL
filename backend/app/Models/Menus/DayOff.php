<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A chef's time away: leave, sick days or days off. Asked for by the chef (or recorded by a manager), approved or declined. */
class DayOff extends Model
{
    public const KINDS = ['off' => 'Day off', 'leave' => 'Leave', 'sick' => 'Sick', 'other' => 'Other'];

    public const STATUSES = ['requested' => 'Waiting', 'approved' => 'Approved', 'declined' => 'Declined', 'cancelled' => 'Cancelled'];

    protected $table = 'menus_days_off';

    protected $guarded = [];

    protected $casts = ['from_date' => 'date:Y-m-d', 'to_date' => 'date:Y-m-d', 'decided_at' => 'datetime'];

    public function days(): int
    {
        return (int) round($this->from_date->copy()->startOfDay()->diffInDays($this->to_date->copy()->startOfDay())) + 1;
    }
}
