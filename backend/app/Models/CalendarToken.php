<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A staff member's secret link for subscribing to their calendar in Google, Outlook or Apple Calendar. */
class CalendarToken extends Model
{
    public $timestamps = false;

    protected $table = 'calendar_tokens';

    protected $fillable = ['user_id', 'token', 'created_at'];
}
