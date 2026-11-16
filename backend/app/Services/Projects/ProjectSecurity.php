<?php

namespace App\Services\Projects;

use App\Models\User;

/**
 * Watching for people trying doors (docs/PROJECTS_STAGE2_SPEC.md, build 2.5). The other parts of the control room tell it what happened;
 * until build 2.5 it only listens.
 */
class ProjectSecurity
{
    public function noteLockBlocked(object $project, User $user, string $area): void {}
}
