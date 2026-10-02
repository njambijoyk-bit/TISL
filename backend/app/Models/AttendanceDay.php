<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One person's attendance for one day. A record only: it never touches the books. */
class AttendanceDay extends Model
{
    public const STATUSES = ['present', 'late', 'half_day', 'left_early', 'absent', 'leave', 'off', 'holiday'];

    /** Statuses that count as a day worked (the rest are not worked). */
    public const WORKED = ['present', 'late', 'half_day', 'left_early'];

    protected $fillable = ['user_id', 'work_date', 'status', 'sign_in_at', 'sign_out_at', 'sign_source', 'minutes_worked', 'overtime_minutes', 'note', 'marked_by', 'marked_at',
        'verify_status', 'verified_by', 'verified_at', 'verify_note'];

    protected $casts = ['work_date' => 'date:Y-m-d', 'sign_in_at' => 'datetime', 'sign_out_at' => 'datetime', 'marked_at' => 'datetime', 'verified_at' => 'datetime', 'minutes_worked' => 'integer', 'overtime_minutes' => 'integer'];
}
