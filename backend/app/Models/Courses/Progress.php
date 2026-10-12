<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** Where one student is in one lesson. */
class Progress extends Model
{
    protected $table = 'course_progress';

    protected $guarded = [];

    protected $casts = ['position_seconds' => 'integer', 'started_at' => 'datetime', 'done_at' => 'datetime'];
}
