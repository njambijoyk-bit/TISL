<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** One step of an offering. */
class Lesson extends Model
{
    public const KINDS = ['text' => 'Reading', 'video' => 'Video', 'file' => 'File', 'recipe' => 'Recipe', 'live' => 'Live session', 'quiz' => 'Quiz'];

    protected $table = 'course_lessons';

    protected $guarded = [];

    protected $casts = ['is_preview' => 'boolean', 'is_required' => 'boolean', 'duration_minutes' => 'integer', 'drip_days' => 'integer'];

    public function live(): HasOne
    {
        return $this->hasOne(LiveSession::class, 'lesson_id');
    }
}
