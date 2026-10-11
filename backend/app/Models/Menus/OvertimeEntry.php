<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A chef's overtime for one day, waiting for a manager before payroll may pay it. */
class OvertimeEntry extends Model
{
    public const STATUSES = ['pending' => 'Waiting', 'approved' => 'Approved', 'rejected' => 'Not approved'];

    protected $table = 'menus_overtime';

    protected $guarded = [];

    protected $casts = ['work_date' => 'date:Y-m-d', 'decided_at' => 'datetime', 'minutes' => 'integer'];
}
