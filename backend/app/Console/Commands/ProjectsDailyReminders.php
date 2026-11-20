<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectDaily;
use Illuminate\Console\Command;

/** Tells the lead of each open work that keeps a daily record and has none today (Projects build 10.5). */
class ProjectsDailyReminders extends Command
{
    protected $signature = 'projects:daily-reminders';

    protected $description = 'Remind leads of works with no daily record today';

    public function handle(ProjectDaily $daily): int
    {
        $this->info($daily->remind() . ' leads told.');

        return self::SUCCESS;
    }
}
