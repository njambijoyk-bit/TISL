<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;

/** A scan at the door: the good ones and the refused ones. */
class EventCheckin extends Model
{
    protected $table = 'event_checkins';

    protected $fillable = ['event_id', 'ticket_id', 'session_id', 'result', 'code_text', 'checked_by', 'note'];
}
