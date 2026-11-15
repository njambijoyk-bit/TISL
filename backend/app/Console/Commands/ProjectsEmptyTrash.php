<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectTrash;
use Illuminate\Console\Command;

/**
 * Projects keeps what was deleted in a trash for the number of days the company sets (Projects configuration). After that it is removed for good,
 * except anything the books hold vouchers for: that stays until a person restores it and closes it. Runs daily.
 */
class ProjectsEmptyTrash extends Command
{
    protected $signature = 'projects:empty-trash';

    protected $description = 'Remove what has been in the Projects trash longer than the company keeps it';

    public function handle(ProjectTrash $trash): int
    {
        $r = $trash->empty();
        $this->info("{$r['projects']} project(s) and {$r['phases']} phase(s) removed; {$r['kept']} kept because the books hold vouchers for them.");

        return self::SUCCESS;
    }
}
