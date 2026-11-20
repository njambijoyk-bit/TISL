<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectUpdates;
use Illuminate\Console\Command;

/** Friday: Mimi drafts this week's update for each open work with a client; its lead sends it or throws it away (Projects build 12.6). */
class ProjectsWeeklyUpdates extends Command
{
    protected $signature = 'projects:weekly-updates';

    protected $description = 'Draft this week\'s client update for each open piece of work (nothing is sent)';

    public function handle(ProjectUpdates $updates): int
    {
        $this->info($updates->fridays() . ' weekly update drafts made.');

        return self::SUCCESS;
    }
}
