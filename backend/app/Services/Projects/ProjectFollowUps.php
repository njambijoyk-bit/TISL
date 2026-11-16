<?php

namespace App\Services\Projects;

/**
 * The next action on a lead, a client or an opportunity (docs/PROJECTS_STAGE3_SPEC.md, build 3.4).
 * Build 3.1 only needs its question answered; until 3.4 nothing has a next action.
 */
class ProjectFollowUps
{
    /** The open next action of each subject. @param int[] $ids @return array<int, array<string, mixed>> subject id => its next action */
    public function nextFor(string $type, array $ids): array
    {
        return [];
    }
}
