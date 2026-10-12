<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A group of lessons inside an offering. */
class Section extends Model
{
    protected $table = 'course_sections';

    protected $guarded = [];
}
