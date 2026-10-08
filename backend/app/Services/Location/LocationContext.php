<?php

namespace App\Services\Location;

use App\Models\Location;

/**
 * The branch in context for the current request.
 *
 * Set by SetLocationContext middleware from ?location= or an X-Location header.
 * Falls back to the default branch. Held for the request only — never persisted
 * as state. Single-branch businesses always resolve to "Main".
 */
class LocationContext
{
    private ?Location $current = null;
    private bool $resolved = false;

    /** Explicitly set the current branch (middleware). Null clears it. */
    public function set(?Location $location): void
    {
        $this->current = $location;
        $this->resolved = $location !== null;
    }

    /** Set by id; ignores unknown/inactive ids (falls back to default). */
    public function setById(?int $id): void
    {
        if ($id === null) {
            return;
        }
        // the customer's branch: only one customers can buy from (a warehouse id sent by hand is ignored)
        $loc = Location::query()->sellsToCustomers()->find($id);
        if ($loc) {
            $this->set($loc);
        }
    }

    /** The current branch, resolving the default the first time it's needed. */
    public function current(): ?Location
    {
        if (!$this->resolved) {
            $this->current = Location::defaultSelling() ?? Location::default();
            $this->resolved = true;
        }
        return $this->current;
    }

    public function id(): ?int
    {
        return $this->current()?->id;
    }
}
