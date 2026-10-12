<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A dated run of an offering with its own places. */
class Intake extends Model
{
    protected $table = 'course_intakes';

    protected $guarded = [];

    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'enrol_until' => 'date', 'capacity' => 'integer'];
}
