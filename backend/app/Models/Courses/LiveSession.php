<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/** A dated session with a join link. The link is shown only to people with access, and only shortly before it starts. */
class LiveSession extends Model
{
    public const PROVIDERS = ['zoom' => 'Zoom', 'meet' => 'Google Meet', 'teams' => 'Microsoft Teams', 'other' => 'Another link'];

    protected $table = 'course_live';

    protected $guarded = [];

    protected $hidden = ['join_url', 'meeting_id', 'passcode'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'capacity' => 'integer'];

    /** @return array{0: Carbon, 1: Carbon} */
    public function span(): array
    {
        return [$this->starts_at->copy(), $this->ends_at->copy()];
    }
}
