<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** The quiz behind a quiz lesson. */
class Quiz extends Model
{
    public const SHOW = ['never' => 'Never', 'after_pass' => 'After the student passes', 'after_each' => 'After every attempt'];

    protected $table = 'course_quizzes';

    protected $guarded = [];

    protected $casts = ['pass_pct' => 'integer', 'max_attempts' => 'integer', 'time_limit_minutes' => 'integer', 'shuffle' => 'boolean'];

    public function questions(): HasMany
    {
        return $this->hasMany(Question::class, 'quiz_id')->orderBy('sort_order')->orderBy('id');
    }
}
