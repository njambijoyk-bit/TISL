<?php

namespace App\Services\Events;

use App\Models\Events\EventOrganiser;
use App\Models\Events\EventOrganiserMember;
use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\Schema;

/**
 * Whose events a person may see and work on. TISL's own staff see every event (as before); a person who only acts for outside organisers sees those organisers' events and nothing else.
 * A person who also holds events.admin, or acts for TISL itself, is staff.
 */
final class EventAccess
{
    public static function ready(): bool
    {
        return Schema::hasTable('event_organisers') && Schema::hasColumn('events', 'organiser_id');
    }

    /** The organisers this person acts for (with their role). @return array<int, string> organiser id => role */
    public function memberships(?User $u): array
    {
        if (! $u || ! self::ready()) {
            return [];
        }

        return EventOrganiserMember::where('user_id', $u->id)->pluck('role', 'organiser_id')->all();
    }

    /**
     * The organiser ids a person is limited to, or null for no limit (staff).
     *
     * @return ?array<int, int>
     */
    public function organiserIds(?User $u): ?array
    {
        if (! self::ready()) {
            return null;
        }
        if (! $u) {
            return [];
        }
        $mine = $this->memberships($u);
        if (! $mine || app(Authorizer::class)->allows($u, 'events.admin')) {
            return null;   // no organiser of their own, or the platform's admin: TISL staff
        }
        $internal = EventOrganiser::where('is_internal', 1)->whereIn('id', array_keys($mine))->exists();

        return $internal ? null : array_map('intval', array_keys($mine));
    }

    /** Limit an events query to what the person may see. */
    public function scope($query, ?User $u, string $column = 'organiser_id')
    {
        $ids = $this->organiserIds($u);

        return $ids === null ? $query : $query->whereIn($column, $ids ?: [0]);
    }

    /** Is this person limited to outside organisers (so they may not pick another owner for an event)? */
    public function isOutside(?User $u): bool
    {
        return $this->organiserIds($u) !== null;
    }

    /** The organiser a new event is made under: the person's own (the one asked for if they act for several), else TISL itself for staff. */
    public function organiserFor(?User $u, ?int $asked = null): ?EventOrganiser
    {
        if (! self::ready()) {
            return null;
        }
        $ids = $this->organiserIds($u);
        if ($ids === null) {
            return $asked ? EventOrganiser::find($asked) : EventOrganiser::where('is_internal', 1)->first();
        }
        $id = $asked && in_array($asked, $ids, true) ? $asked : ($ids[0] ?? null);

        return $id ? EventOrganiser::find($id) : null;
    }

    /** May this person work on events of this organiser? */
    public function canAct(?User $u, ?int $organiserId): bool
    {
        $ids = $this->organiserIds($u);

        return $ids === null || ($organiserId !== null && in_array($organiserId, $ids, true));
    }
}
