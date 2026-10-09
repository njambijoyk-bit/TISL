<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One slice of an employee's pay: a cost centre, a share, and the dates it holds. */
class EmployeeCostCentre extends Model
{
    public const KINDS = ['home' => 'Home (their department)', 'project' => 'Project', 'other' => 'Other'];

    protected $fillable = ['employee_id', 'cost_centre_id', 'kind', 'share_percent', 'valid_from', 'valid_to'];

    protected $casts = ['share_percent' => 'decimal:2', 'valid_from' => 'date:Y-m-d', 'valid_to' => 'date:Y-m-d'];

    public function costCentre()
    {
        return $this->belongsTo(CostCentre::class);
    }
}
