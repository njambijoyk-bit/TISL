<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectChecklists;
use Illuminate\Console\Command;

/** Reminds whoever does a joining or leaving step that is due today or late, once a day (Projects build 8.4). */
class ProjectsChecklistReminders extends Command
{
    protected $signature = 'projects:checklist-reminders';

    protected $description = 'Remind people of joining and leaving checklist steps due today or late';

    public function handle(ProjectChecklists $checklists): int
    {
        $this->info($checklists->remind() . ' steps reminded.');

        return self::SUCCESS;
    }
}
