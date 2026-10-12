<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;

/** One invoice of a membership. */
class Period extends Model
{
    protected $table = 'membership_periods';

    protected $guarded = [];

    protected $casts = ['period_from' => 'date', 'period_to' => 'date', 'due_date' => 'date', 'amount' => 'decimal:2', 'paid_amount' => 'decimal:2', 'invoiced_at' => 'datetime', 'paid_at' => 'datetime', 'reminded_before_at' => 'datetime', 'reminded_after_at' => 'datetime'];

    public function owing(): float
    {
        return max(0.0, round((float) $this->amount - (float) $this->paid_amount, 2));
    }
}
