<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A fee line of an offering. It names the sales account it is booked under; the account decides the tax. */
class Fee extends Model
{
    public const KINDS = ['registration' => 'Registration fee', 'tuition' => 'Tuition', 'materials' => 'Materials or kit', 'exam' => 'Exam fee', 'certificate' => 'Certificate fee', 'late' => 'Late fee', 'other' => 'Other'];

    protected $table = 'course_fees';

    protected $guarded = [];

    protected $casts = ['amount' => 'decimal:2', 'is_optional' => 'boolean', 'once_per_student' => 'boolean', 'refundable' => 'boolean', 'is_active' => 'boolean'];
}
