<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One thing on a calendar. Modules write entries (a booking, a task due, a milestone…) pointing back to what they are; the calendar and
 * the availability checks read them. visibility: staff = only the owner, team = managers and the team, customer = the customer sees it in their own portal too.
 */
class CalendarEntry extends Model
{
    public const VISIBILITY = ['staff', 'team', 'customer'];

    protected $table = 'calendar_entries';

    protected $fillable = ['user_id', 'resource_id', 'source_type', 'source_id', 'kind', 'title', 'starts_at', 'ends_at', 'all_day', 'location_id', 'customer_id', 'status', 'visibility', 'url', 'meta'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'all_day' => 'boolean', 'meta' => 'array'];
}
