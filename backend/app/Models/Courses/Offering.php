<?php

namespace App\Models\Courses;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Something taught or sold: a course, a recipe, notes and files, or a live class. Money is not here: fees and invoices live in the books. */
class Offering extends Model
{
    public const KINDS = ['course' => 'Course', 'recipe' => 'Recipe', 'notes' => 'Notes and files', 'live' => 'Live class'];
    public const LEVELS = ['all' => 'Any level', 'beginner' => 'Beginner', 'intermediate' => 'Intermediate', 'advanced' => 'Advanced'];
    public const DELIVERY = ['online' => 'Online', 'in_person' => 'In person', 'hybrid' => 'In person and online'];
    public const STATUSES = ['draft' => 'Draft', 'published' => 'Published', 'archived' => 'Archived'];

    protected $table = 'course_offerings';

    protected $guarded = [];

    protected $casts = ['tags' => 'array', 'free_preview' => 'boolean', 'certificate' => 'boolean', 'access_days' => 'integer', 'min_attendance_pct' => 'integer'];

    public function sections(): HasMany
    {
        return $this->hasMany(Section::class, 'offering_id')->orderBy('sort_order')->orderBy('id');
    }

    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class, 'offering_id')->orderBy('sort_order')->orderBy('id');
    }

    public function instructor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'instructor_user_id');
    }
}
