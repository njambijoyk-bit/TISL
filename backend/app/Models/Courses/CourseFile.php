<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A private file. Never public: it is served only by short-lived signed links to people who may open it. */
class CourseFile extends Model
{
    protected $table = 'course_files';

    protected $guarded = [];

    protected $casts = ['size_bytes' => 'integer', 'downloads' => 'integer'];
}
