<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\Project;
use App\Models\ProjectActivity;

trait LogsProjectActivity
{
    /**
     * Record an activity entry on the project.
     *
     * @param Project      $project
     * @param string       $action      e.g. 'PROJECT_CREATED', 'LINK_ADDED', 'STATUS_CHANGED'
     * @param string|null  $entityType  e.g. 'project', 'project_link', 'project_milestone'
     * @param int|null     $entityId    PK of the affected entity
     * @param array        $metadata    Optional extra context (JSON)
     */
    protected function logActivity(
        Project $project,
        string  $action,
        ?string $entityType = null,
        ?int    $entityId   = null,
        array   $metadata   = []
    ): ProjectActivity {
        return ProjectActivity::create([
            'project_id'    => $project->id,
            'actor_user_id' => auth()->id(),   // null = system action
            'action'        => $action,
            'entity_type'   => $entityType,
            'entity_id'     => $entityId,
            'metadata'      => !empty($metadata) ? $metadata : null,
            'created_at'    => now(),
        ]);
    }
}