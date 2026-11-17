<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectFollowUps;
use Illuminate\Console\Command;

/** Tells each person, once a day, which of their next actions on leads, clients and opportunities are due or late. */
class ProjectsFollowUpReminders extends Command
{
    protected $signature = 'projects:follow-up-reminders';

    protected $description = 'Remind people of their next actions in Projects that are due or late';

    public function handle(ProjectFollowUps $followUps): int
    {
        $this->info($followUps->remind() . ' people reminded.');

        return self::SUCCESS;
    }
}
