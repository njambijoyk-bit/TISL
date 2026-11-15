<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Reading the project log: one project's history, or the whole module's for someone who holds `projects.log.view`. The module-wide view never
 * shows a line of a project the reader could not open (a confidential one they are not on), so the log cannot be used to look around a wall.
 */
class ProjectActivity
{
    public function __construct(private ProjectAccess $access) {}

    /** @param array<string, mixed> $f result (done|refused), q, page, per_page @return array<string, mixed> */
    public function forProject(object $project, array $f): array
    {
        return $this->page(DB::table('project_log as l')->where('l.project_id', $project->id), $f);
    }

    /** @param array<string, mixed> $f @return array<string, mixed> */
    public function all(User $user, array $f): array
    {
        $q = DB::table('project_log as l')->leftJoin('projects as p', 'p.id', '=', 'l.project_id')
            ->where(function ($w) use ($user) {
                // settings, roles, the trash: about no one project. (The lines of a project deleted for good stay in the table but are shown to nobody:
                // once it is gone there is no telling whether it was confidential. That it was deleted is a line about no project, and shows.)
                $w->whereNull('l.project_id')
                    ->orWhere(fn ($x) => $this->access->visible($x, $user)->orWhere(fn ($y) => $y->whereNotNull('p.deleted_at')->where('p.confidential', 0)));
            });

        return $this->page($q->addSelect('p.number as project_number', 'p.confidential as project_confidential'), $f);
    }

    /** @param array<string, mixed> $f @return array<string, mixed> */
    private function page($q, array $f): array
    {
        if (in_array($f['result'] ?? null, ['done', 'refused'], true)) {
            $q->where('l.result', $f['result']);
        }
        if (($term = trim((string) ($f['q'] ?? ''))) !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term) . '%';
            $q->where(fn ($w) => $w->where('l.action', 'like', $like)->orWhere('l.reason', 'like', $like)
                ->orWhereExists(fn ($u) => $u->from('users as su')->whereColumn('su.id', 'l.actor_id')->where('su.name', 'like', $like)));
        }
        $per = min(100, max(10, (int) ($f['per_page'] ?? 50)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $total = (clone $q)->count();
        $rows = $q->leftJoin('users as a', 'a.id', '=', 'l.actor_id')->addSelect('l.*', 'a.name as actor_name')->orderByDesc('l.id')->offset(($page - 1) * $per)->limit($per)->get();

        return ['data' => $rows->map(fn ($r) => [
            'id' => (int) $r->id, 'at' => $r->created_at, 'actor' => $r->actor_name ?? ($r->actor_id ? 'Someone who has left' : 'The system'),
            'action' => $r->action, 'what' => self::describe($r->action), 'project_id' => $r->project_id ? (int) $r->project_id : null, 'project_number' => $r->project_number ?? null,
            'result' => $r->result, 'reason' => $r->reason, 'old' => json_decode((string) $r->old_values, true), 'new' => json_decode((string) $r->new_values, true),
        ])->all(), 'total' => $total, 'page' => $page, 'per_page' => $per];
    }

    /** project.created -> "Project created"; stage.moved -> "Stage moved". The screen puts the industry's word in where it says project. */
    public static function describe(string $action): string
    {
        return Str::ucfirst(str_replace(['.', '_'], ' ', $action));
    }
}
