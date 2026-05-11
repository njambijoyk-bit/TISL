<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveLog extends Model
{
    protected $fillable = [
        'employee_id',
        'action',
        'days',
        'reason',
        'balance_before',
        'balance_after',
        'actioned_by',
    ];

    protected $casts = [
        'days'           => 'decimal:1',
        'balance_before' => 'decimal:1',
        'balance_after'  => 'decimal:1',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function actionedBy()
    {
        return $this->belongsTo(User::class, 'actioned_by');
    }
}