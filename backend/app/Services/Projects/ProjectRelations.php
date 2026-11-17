<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Who may see, and write about, a relationship (docs/PROJECTS_STAGE3_SPEC.md, build 3.4). The history and the next actions of a lead, a client,
 * a party or an opportunity are seen by whoever may see that record, and written by those who also hold `projects.interactions`.
 */
class ProjectRelations
{
    public const SUBJECTS = ['lead', 'customer', 'party', 'opportunity'];

    /** Stop here unless this person may see (or write about) the subject. @return string its name, for messages */
    public function authorize(string $type, int $id, User $user, bool $toWrite): string
    {
        if (! in_array($type, self::SUBJECTS, true) || ! ProjectsSetup::relationships()) {
            throw new ProjectException('Not found.', 404);
        }
        $name = match ($type) {
            'lead' => app(ProjectLeads::class)->find($id, $user)->name,
            'opportunity' => app(ProjectPipeline::class)->find($id, $user)->title,
            'customer' => $this->customer($id, $user),
            'party' => $this->party($id, $user),
        };
        if ($toWrite && ! $user->hasPermission('projects.interactions')) {
            ProjectLog::refused(null, $user, 'history.write', 'Does not hold projects.interactions', $type, $id);
            throw new ProjectException('You may not write the history of relationships.', 403);
        }

        return $name;
    }

    /** May this person see what was said about this project? A confidential one only by the people on it. */
    public function mayReadAbout(?int $projectId, User $user): bool
    {
        if (! $projectId) {
            return true;
        }
        $p = DB::table('projects')->where('id', $projectId)->first();

        return $p && app(ProjectAccess::class)->base($user, 'open', $p)['allowed'];
    }

    private function customer(int $id, User $user): string
    {
        $c = DB::table('customers')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $c) {
            throw new ProjectException('Not found.', 404);
        }
        if (! $user->hasPermission('projects.clients.view') && ! $user->hasPermission('projects.clients.manage')) {
            ProjectLog::refused(null, $user, 'client.view', 'Does not hold projects.clients.view', 'customer', $id);
            throw new ProjectException('You may not see clients.', 403);
        }

        return $c->company_name ?: trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''));
    }

    private function party(int $id, User $user): string
    {
        $p = DB::table('project_parties')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $p) {
            throw new ProjectException('Not found.', 404);
        }

        return $p->name;
    }
}
