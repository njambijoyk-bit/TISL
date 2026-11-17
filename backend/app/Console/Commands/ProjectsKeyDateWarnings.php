<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectKeyDates;
use Illuminate\Console\Command;

/** Warns, once a day, about key dates coming up and on the day, and marks the ones that passed while still open as missed. */
class ProjectsKeyDateWarnings extends Command
{
    protected $signature = 'projects:key-date-warnings';

    protected $description = 'Warn about key dates in Projects coming up or today, and mark passed ones missed';

    public function handle(ProjectKeyDates $dates): int
    {
        $this->info($dates->warn() . ' warnings sent.');

        return self::SUCCESS;
    }
}
