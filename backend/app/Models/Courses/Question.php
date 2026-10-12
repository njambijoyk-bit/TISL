<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** One question of a quiz. */
class Question extends Model
{
    public const KINDS = ['single' => 'One right answer', 'multiple' => 'Several right answers', 'truefalse' => 'True or false', 'short' => 'Short text'];

    protected $table = 'course_questions';

    protected $guarded = [];

    protected $casts = ['options' => 'array', 'correct' => 'array', 'points' => 'integer'];
}
