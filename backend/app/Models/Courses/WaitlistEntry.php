<?php

namespace App\Models\Courses;

use Illuminate\Database\Eloquent\Model;

/** Someone waiting for a place. */
class WaitlistEntry extends Model
{
    protected $table = 'course_waitlist';

    protected $guarded = [];

    protected $casts = ['offered_at' => 'datetime', 'offer_expires_at' => 'datetime'];
}
