<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectFileRequests;
use Illuminate\Console\Command;

/** Reminds whoever was asked for a file or a sign-off that is due today or late, once a day (Projects build 9.3). */
class ProjectsRequestReminders extends Command
{
    protected $signature = 'projects:request-reminders';

    protected $description = 'Remind people of file and sign-off requests due today or late';

    public function handle(ProjectFileRequests $requests): int
    {
        $this->info($requests->remind() . ' reminders sent.');

        return self::SUCCESS;
    }
}
