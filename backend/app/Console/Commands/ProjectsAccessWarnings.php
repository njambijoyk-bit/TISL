<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectAccessList;
use Illuminate\Console\Command;

/** Tells each project lead, once, about people whose place on the project ends soon (Projects configuration says how many days ahead). */
class ProjectsAccessWarnings extends Command
{
    protected $signature = 'projects:access-warnings';

    protected $description = 'Tell project leads about people whose access to a project ends soon';

    public function handle(ProjectAccessList $list): int
    {
        $this->info($list->warnOfEndings() . ' warning(s) sent.');

        return self::SUCCESS;
    }
}
