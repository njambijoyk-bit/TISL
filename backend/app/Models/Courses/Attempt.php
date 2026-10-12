<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** One go at a quiz. */
class Attempt extends Model
{
    protected $table = 'course_attempts';

    protected $guarded = [];

    protected $casts = ['answers' => 'array', 'marks' => 'array', 'max_score' => 'decimal:2', 'score' => 'decimal:2', 'score_pct' => 'decimal:2', 'passed' => 'boolean', 'started_at' => 'datetime', 'expires_at' => 'datetime', 'submitted_at' => 'datetime', 'marked_at' => 'datetime'];
}
