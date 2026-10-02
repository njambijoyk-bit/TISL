<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Someone assigned to mark and verify a colleague's attendance, besides that colleague's manager. */
class AttendanceMarker extends Model
{
    protected $fillable = ['staff_user_id', 'marker_user_id'];
}
