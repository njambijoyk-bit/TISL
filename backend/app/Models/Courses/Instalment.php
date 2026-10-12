<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** One payment of the schedule of an enrolment. */
class Instalment extends Model
{
    protected $table = 'course_instalments';

    protected $guarded = [];

    protected $casts = ['due_date' => 'date:Y-m-d', 'amount' => 'decimal:2', 'paid_amount' => 'decimal:2', 'reminded_at' => 'datetime', 'lapsed_told_at' => 'datetime'];

    public function owing(): float
    {
        return max(0.0, round((float) $this->amount - (float) $this->paid_amount, 2));
    }
}
