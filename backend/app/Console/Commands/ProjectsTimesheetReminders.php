<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectTimesheets;
use Illuminate\Console\Command;

/** Monday at 10:00: tells people whose time from last week is not submitted, and people who have time waiting for them to approve. */
class ProjectsTimesheetReminders extends Command
{
    protected $signature = 'projects:timesheet-reminders';

    protected $description = 'Remind people of unsubmitted time and of time waiting for their approval in Projects';

    public function handle(ProjectTimesheets $sheets): int
    {
        $this->info($sheets->remind() . ' people reminded.');

        return self::SUCCESS;
    }
}
