<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A month's payroll: draft (worked out, still changeable) → approved (posted to the books) → paid. */
class PayrollRun extends Model
{
    protected $fillable = ['number', 'period_start', 'period_end', 'status', 'total_gross', 'total_deductions', 'total_net', 'total_employer', 'journal_voucher_id', 'payment_voucher_id', 'notes',
        'created_by', 'approved_by', 'approved_at', 'paid_at'];

    protected $casts = ['period_start' => 'date:Y-m-d', 'period_end' => 'date:Y-m-d', 'approved_at' => 'datetime', 'paid_at' => 'datetime', 'total_gross' => 'float', 'total_deductions' => 'float', 'total_net' => 'float', 'total_employer' => 'float'];

    public function lines()
    {
        return $this->hasMany(PayrollLine::class, 'run_id');
    }
}
