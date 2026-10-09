<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/** A department at one branch (Sales at A and Sales at B are two rows). It has its own cost centre under the branch's. Script 101. */
class Department extends Model
{
    protected $fillable = ['location_id', 'name', 'code', 'cost_centre_id', 'manager_employee_id', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('departments') && Schema::hasColumn('employees', 'department_id');
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function costCentre()
    {
        return $this->belongsTo(CostCentre::class, 'cost_centre_id');
    }

    public function employees()
    {
        return $this->hasMany(Employee::class, 'department_id');
    }
}
