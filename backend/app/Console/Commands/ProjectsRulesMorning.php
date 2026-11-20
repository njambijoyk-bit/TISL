<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectRules;
use Illuminate\Console\Command;

/** The rules that start from time passing: late tasks and snags, missing timesheets on Tuesdays, and every-morning rules (Projects build 12.5). */
class ProjectsRulesMorning extends Command
{
    protected $signature = 'projects:rules-morning';

    protected $description = 'Run the switched-on Projects rules that start from tasks or snags going late, missing timesheets and every morning';

    public function handle(ProjectRules $rules): int
    {
        $this->info($rules->morning() . ' rule runs logged.');

        return self::SUCCESS;
    }
}
