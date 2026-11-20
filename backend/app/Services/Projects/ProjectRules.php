<?php

namespace App\Services\Projects;

use App\Models\User;

/** Rules (docs/PROJECTS_STAGE12_SPEC.md, build 12.5). Until that build, nothing is run. */
class ProjectRules
{
    /** Something happened on a piece of work: run the rules it starts. */
    public function fire(string $event, ?object $project, ?User $by = null, array $about = []): void
    {
    }
}
