<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectSnags;
use Illuminate\Console\Command;

/** Tells whoever a late snag is given to, once a day (Projects build 10.7). */
class ProjectsSnagReminders extends Command
{
    protected $signature = 'projects:snag-reminders';

    protected $description = 'Remind whoever late snags are given to';

    public function handle(ProjectSnags $snags): int
    {
        $this->info($snags->remind() . ' late snags told.');

        return self::SUCCESS;
    }
}
