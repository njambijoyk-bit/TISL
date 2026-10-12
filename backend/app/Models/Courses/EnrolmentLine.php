<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** What was charged on an enrolment: a copy of a fee at the time. */
class EnrolmentLine extends Model
{
    protected $table = 'course_enrolment_lines';

    protected $guarded = [];

    protected $casts = ['amount' => 'decimal:2', 'once_per_student' => 'boolean', 'refundable' => 'boolean'];
}
