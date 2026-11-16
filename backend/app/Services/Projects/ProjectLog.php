<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The one record of what happened in Projects: every action, and every refusal with its reason. Rows are only ever added; nothing in the
 * application changes or removes one. Writing to the log must never stop the action it describes.
 */
class ProjectLog
{
    public const DONE = 'done';
    public const REFUSED = 'refused';

    /**
     * @param array<string, mixed>|null $old the values before (only the ones that changed)
     * @param array<string, mixed>|null $new the values after
     */
    public static function record(?int $projectId, ?User $by, string $action, ?string $subjectType = null, ?int $subjectId = null, ?array $old = null, ?array $new = null,
        string $result = self::DONE, ?string $reason = null): void
    {
        if (! ProjectsSetup::ready()) {
            return;
        }
        try {
            DB::table('project_log')->insert([
                'project_id' => $projectId, 'actor_id' => $by?->id, 'action' => mb_substr($action, 0, 60), 'subject_type' => $subjectType, 'subject_id' => $subjectId,
                'old_values' => $old === null ? null : json_encode($old), 'new_values' => $new === null ? null : json_encode($new),
                'result' => $result, 'reason' => $reason === null ? null : mb_substr($reason, 0, 200), 'ip' => request()?->ip(), 'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public static function refused(?int $projectId, ?User $by, string $action, string $reason, ?string $subjectType = null, ?int $subjectId = null): void
    {
        self::record($projectId, $by, $action, $subjectType, $subjectId, null, null, self::REFUSED, $reason);
        try {
            app(ProjectSecurity::class)->afterRefusal($by);   // stage 2: is this one refusal too many?
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
