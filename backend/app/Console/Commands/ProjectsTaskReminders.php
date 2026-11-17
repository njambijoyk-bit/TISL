<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectTasks;
use Illuminate\Console\Command;

/** Tells each person, once a day, which of their tasks in Projects are due tomorrow and which became late. */
class ProjectsTaskReminders extends Command
{
    protected $signature = 'projects:task-reminders';

    protected $description = 'Remind people of their tasks in Projects due tomorrow or late since yesterday';

    public function handle(ProjectTasks $tasks): int
    {
        $this->info($tasks->remind() . ' people reminded.');

        return self::SUCCESS;
    }
}
