<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** A dated class of an offering. */
class ClassSession extends Model
{
    public const MODES = ['in_person' => 'In person', 'online' => 'Online'];

    protected $table = 'course_sessions';

    protected $guarded = [];

    protected $hidden = ['checkin_code'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'self_checkin' => 'boolean'];
}
