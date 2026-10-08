<?php

namespace App\Observers;

use App\Models\Location;
use App\Services\CostCentres\CostCentreService;

/** Every location has its own cost centre, made when the location is made and renamed with it. */
class LocationCostCentreObserver
{
    public function saved(Location $l): void
    {
        if ($l->wasRecentlyCreated || $l->wasChanged('name')) {
            try {
                app(CostCentreService::class)->ensureForLocation($l);
            } catch (\Throwable) {
                // never stop a location being saved because of cost centres
            }
        }
    }
}
