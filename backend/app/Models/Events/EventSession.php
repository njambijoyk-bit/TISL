<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** One date and time of an event. */
class EventSession extends Model
{
    protected $table = 'event_sessions';

    protected $fillable = ['event_id', 'label', 'starts_at', 'ends_at', 'capacity', 'is_cancelled'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_cancelled' => 'boolean', 'capacity' => 'integer'];

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function ticketTypes(): BelongsToMany
    {
        return $this->belongsToMany(EventTicketType::class, 'event_ticket_type_sessions', 'session_id', 'ticket_type_id');
    }
}
