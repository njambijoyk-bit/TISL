<?php

namespace App\Console\Commands;

use App\Services\Events\HoldReaper;
use Illuminate\Console\Command;

class EventsReleaseHolds extends Command
{
    protected $signature = 'events:release-holds';

    protected $description = 'Give back the seats of ticket purchases that were not paid in time, and cancel the unpaid orders a day later.';

    public function handle(HoldReaper $reaper): int
    {
        $r = $reaper->run();
        if ($r['released'] || $r['cancelled']) {
            $this->info("Released {$r['released']} held ticket(s); cancelled {$r['cancelled']} unpaid order(s).");
        }

        return self::SUCCESS;
    }
}
