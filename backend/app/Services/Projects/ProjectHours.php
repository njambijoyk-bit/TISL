<?php

namespace App\Services\Projects;

use App\Models\User;

/**
 * The hours a project can be opened, and each person's own hours on it (docs/PROJECTS_STAGE2_SPEC.md, build 2.2).
 * Build 2.1 only needs its questions answered; with no hours set every answer is "any time".
 */
class ProjectHours
{
    /** The hours of a project (member 0) or of one person's place on it, in words; null when none are set. */
    public function wordsFor(int $projectId, int $memberId): ?string
    {
        return null;
    }

    /** Is this person held back right now by hours or by security? Null when not. @return array{0: string, 1: string}|null */
    public function heldWords(object $project, object $member, User $user): ?array
    {
        return null;
    }
}
