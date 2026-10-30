<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\DB;

/** May this person work on what an owner holds (its media, its documents)? One answer for events, organisers, vendors, venues and what belongs to them. */
final class EventOwnerAccess
{
    public function __construct(private EventAccess $events, private EventMarketplace $market)
    {
    }

    public function isAdmin(?User $u): bool
    {
        return $u !== null && app(Authorizer::class)->allows($u, 'events.admin');
    }

    /** The provider (vendor or venue) a package or a space belongs to, as [type, id]; or the owner itself. */
    private function resolve(string $type, int $id): array
    {
        return match ($type) {
            'package' => ['vendor', (int) DB::table('event_vendor_packages')->where('id', $id)->value('vendor_id')],
            'space' => ['venue', (int) DB::table('event_venue_spaces')->where('id', $id)->value('venue_id')],
            default => [$type, $id],
        };
    }

    /** May this person add, change and remove things on the owner? (Events: anyone who may work on the event. Organisers: its people. Providers: owner or manager.) */
    public function canWork(?User $u, string $type, int $id): bool
    {
        if (! $u) {
            return false;
        }
        [$type, $id] = $this->resolve($type, $id);
        if ($id === 0) {
            return false;
        }

        return match ($type) {
            'event' => (bool) $this->events->scope(Event::query(), $u)->whereKey($id)->exists(),
            'organiser' => $this->isAdmin($u) || $this->events->canAct($u, $id),
            'vendor', 'venue' => $this->market->canManage($type, $id, $u, $this->isAdmin($u)),
            default => false,
        };
    }
}
