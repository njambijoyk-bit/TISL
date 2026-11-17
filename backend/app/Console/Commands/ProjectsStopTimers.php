<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectTime;
use Illuminate\Console\Command;

/** Stops timers in Projects that were left running longer than the company allows, logs the time up to the cap, and tells each person. */
class ProjectsStopTimers extends Command
{
    protected $signature = 'projects:stop-timers';

    protected $description = 'Stop timers in Projects left running past the cap';

    public function handle(ProjectTime $time): int
    {
        $this->info($time->stopForgotten() . ' timers stopped.');

        return self::SUCCESS;
    }
}
