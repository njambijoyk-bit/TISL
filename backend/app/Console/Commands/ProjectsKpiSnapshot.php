<?php

namespace App\Console\Commands;

use App\Services\Projects\ProjectKpis;
use Illuminate\Console\Command;

/** This week's scorecards for every open work and every person; a work that turns red is told to its lead (Projects build 12.2). */
class ProjectsKpiSnapshot extends Command
{
    protected $signature = 'projects:kpi-snapshot';

    protected $description = 'Keep this week\'s KPI statuses for every open piece of work and every person';

    public function handle(ProjectKpis $kpis): int
    {
        $r = $kpis->snapshot();
        $this->info("{$r['works']} works and {$r['people']} people kept; {$r['turned_red']} turned red.");

        return self::SUCCESS;
    }
}
