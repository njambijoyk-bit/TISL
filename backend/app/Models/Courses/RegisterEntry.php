<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** One student's mark for one class. */
class RegisterEntry extends Model
{
    public const STATUSES = ['present' => 'Present', 'late' => 'Late', 'absent' => 'Absent', 'excused' => 'Excused', 'asked' => 'Excuse asked'];

    protected $table = 'course_register';

    protected $guarded = [];

    protected $casts = ['marked_at' => 'datetime'];
}
