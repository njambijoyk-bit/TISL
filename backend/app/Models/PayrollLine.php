<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One person's payslip in a run, with every component as it was worked out (so a later change to the rates never rewrites a past payslip). */
class PayrollLine extends Model
{
    protected $fillable = ['run_id', 'user_id', 'basic', 'days_expected', 'days_unpaid', 'overtime_hours', 'absence_deduction', 'overtime_pay', 'gross', 'taxable', 'total_deductions', 'net', 'employer_cost',
        'unverified_days', 'accepted_unverified', 'adjustments', 'breakdown'];

    protected $casts = ['basic' => 'float', 'days_expected' => 'float', 'days_unpaid' => 'float', 'overtime_hours' => 'float', 'absence_deduction' => 'float', 'overtime_pay' => 'float', 'gross' => 'float', 'taxable' => 'float',
        'total_deductions' => 'float', 'net' => 'float', 'employer_cost' => 'float', 'unverified_days' => 'integer', 'accepted_unverified' => 'boolean', 'adjustments' => 'array', 'breakdown' => 'array'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
