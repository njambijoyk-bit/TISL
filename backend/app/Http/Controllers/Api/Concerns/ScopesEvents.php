<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Events\Event;
use App\Services\Events\EventAccess;

/** Staff screens for events: a person who only acts for outside organisers works on those organisers' events, and nothing else. */
trait ScopesEvents
{
    protected function eventAccess(): EventAccess
    {
        return app(EventAccess::class);
    }

    /** The event, if this person may work on it (else a 404, so another organiser's events are not even confirmed to exist). */
    protected function scopedEvent(int $id): Event
    {
        return $this->eventAccess()->scope(Event::query(), request()->user())->findOrFail($id);
    }

    /** Some things post to TISL's own books or settings (cash at the door, refunds, the company's event settings): they stay with TISL's staff while the money passes through TISL. */
    protected function staffOnly(string $what): void
    {
        abort_if($this->eventAccess()->isOutside(request()->user()), 403, "{$what} is done by TISL's staff while ticket money passes through TISL.");
    }
}
