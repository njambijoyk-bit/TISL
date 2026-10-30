<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A person who acts for an organiser, and their part in it. */
class EventOrganiserMember extends Model
{
    protected $table = 'event_organiser_members';

    protected $fillable = ['organiser_id', 'user_id', 'role'];

    public function organiser(): BelongsTo
    {
        return $this->belongsTo(EventOrganiser::class, 'organiser_id');
    }
}
