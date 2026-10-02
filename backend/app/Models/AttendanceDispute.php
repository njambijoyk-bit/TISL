<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A colleague's report that a day's attendance was wrong. Who reported it, and when, is private to the super admin. */
class AttendanceDispute extends Model
{
    public const KINDS = ['did_not_attend' => 'Did not attend', 'left_early' => 'Left early', 'no_overtime' => 'Did not reach the overtime recorded', 'other' => 'Other'];

    protected $fillable = ['subject_user_id', 'work_date', 'kind', 'note', 'reporter_user_id', 'reported_at', 'status', 'resolved_by', 'resolved_at', 'resolution_note'];

    protected $casts = ['work_date' => 'date:Y-m-d', 'reported_at' => 'datetime', 'resolved_at' => 'datetime'];

    /** The reporter's identity and the time they reported must never leave the server except to the super admin. */
    protected $hidden = ['reporter_user_id', 'reported_at'];
}
