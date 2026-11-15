<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Nothing in Projects is erased when someone deletes it: it goes to the trash, where it can be taken back out for a number of days the company
 * sets. Deleting for good is a separate permission (`projects.purge`), and is refused for anything the books already know: a project or phase
 * whose cost centre carries vouchers can only be closed and frozen, because its money history must stay explainable.
 * A person sees in the trash only what they could have opened before it was deleted.
 */
class ProjectTrash
{
    public function __construct(private ProjectAccess $access) {}

    private function days(): int
    {
        return (int) app(ProjectSettings::class)->get('general')['trash_days'];
    }

    /** Put a project in the trash. Its role on the project must let the person change it, and their TISL role must hold `projects.delete`. */
    public function deleteProject(object $project, User $by): void
    {
        $this->access->authorize($by, 'edit', $project);
        $this->needDelete($by, (int) $project->id, 'project.deleted');
        DB::table('projects')->where('id', $project->id)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
        ProjectLog::record((int) $project->id, $by, 'project.deleted', 'project', (int) $project->id, ['number' => $project->number, 'title' => $project->title], null);
    }

    /** What is in the trash that this person may see. @return array<int, array<string, mixed>> */
    public function list(User $user): array
    {
        if (! ProjectsSetup::ready()) {
            return [];
        }
        $days = $this->days();
        $left = fn ($at) => max(0, $days - (int) floor(\Carbon\Carbon::parse($at)->diffInDays(now())));
        $out = [];
        foreach (DB::table('projects as p')->leftJoin('users as u', 'u.id', '=', 'p.deleted_by')->whereNotNull('p.deleted_at')->orderByDesc('p.deleted_at')->get(['p.*', 'u.name as deleted_by_name']) as $p) {
            if ($this->couldOpen($user, $p)) {
                $out[] = ['type' => 'project', 'id' => (int) $p->id, 'label' => $p->number . ' ' . $p->title, 'within' => null, 'deleted_at' => $p->deleted_at, 'deleted_by' => $p->deleted_by_name,
                    'days_left' => $left($p->deleted_at), 'in_the_books' => $this->inTheBooks($this->costCentresOf($p))];
            }
        }
        // a phase shows once, as the top of what was deleted together (the phases under it come back with it)
        $phases = DB::table('project_phases as ph')->join('projects as p', 'p.id', '=', 'ph.project_id')->leftJoin('users as u', 'u.id', '=', 'ph.deleted_by')
            ->whereNotNull('ph.deleted_at')->whereNull('p.deleted_at')->orderByDesc('ph.deleted_at')->get(['ph.*', 'p.number', 'p.title', 'u.name as deleted_by_name']);
        $deletedIds = $phases->pluck('id')->all();
        foreach ($phases as $ph) {
            if ($ph->parent_id && in_array($ph->parent_id, $deletedIds)) {
                continue;
            }
            $project = DB::table('projects')->where('id', $ph->project_id)->first();
            if ($project && $this->access->allows($user, 'open', $project)) {
                $out[] = ['type' => 'phase', 'id' => (int) $ph->id, 'label' => trim(($ph->code ? $ph->code . ' ' : '') . $ph->name), 'within' => $ph->number . ' ' . $ph->title, 'deleted_at' => $ph->deleted_at,
                    'deleted_by' => $ph->deleted_by_name, 'days_left' => $left($ph->deleted_at), 'in_the_books' => $this->inTheBooks($this->phaseCostCentres($this->phaseWithDeletedChildren($ph)))];
            }
        }

        return $out;
    }

    public function restore(string $type, int $id, User $by): void
    {
        $this->needDelete($by, null, 'trash.restored');
        if ($type === 'project') {
            $p = $this->trashedProject($id, $by);
            DB::table('projects')->where('id', $p->id)->update(['deleted_at' => null, 'deleted_by' => null]);
            ProjectLog::record((int) $p->id, $by, 'project.restored', 'project', (int) $p->id);

            return;
        }
        $ph = $this->trashedPhase($id, $by);
        if ($ph->parent_id && DB::table('project_phases')->where('id', $ph->parent_id)->whereNotNull('deleted_at')->exists()) {
            throw new ProjectException('The phase it sits under is in the trash too. Restore that one and this comes back with it.');
        }
        $ids = $this->phaseWithDeletedChildren($ph);
        DB::table('project_phases')->whereIn('id', $ids)->update(['deleted_at' => null, 'deleted_by' => null]);
        ProjectLog::record((int) $ph->project_id, $by, 'phase.restored', 'phase', (int) $ph->id, null, ['with_children' => count($ids) - 1]);
    }

    /** Delete for good. Needs `projects.purge`; refused for anything whose cost centre carries vouchers. */
    public function purge(string $type, int $id, User $by): void
    {
        if (! $by->hasPermission('projects.purge')) {
            ProjectLog::refused(null, $by, 'trash.purged', 'Does not hold projects.purge', $type, $id);
            throw new ProjectException('You may not delete things for good.', 403);
        }
        if ($type === 'project') {
            $p = $this->trashedProject($id, $by);
            $ccs = $this->costCentresOf($p);
            if ($this->inTheBooks($ccs)) {
                throw new ProjectException('The books hold vouchers for this. It cannot be deleted for good: restore it, then close and freeze it instead.');
            }
            $this->eraseProject($p, $ccs);
            ProjectLog::record(null, $by, 'project.purged', 'project', (int) $p->id, ['number' => $p->number, 'title' => $p->confidential ? null : $p->title], null);

            return;
        }
        $ph = $this->trashedPhase($id, $by);
        $ids = $this->phaseWithDeletedChildren($ph);
        $ccs = $this->phaseCostCentres($ids);
        if ($this->inTheBooks($ccs)) {
            throw new ProjectException('The books hold vouchers for this. It cannot be deleted for good: restore it and mark it done instead.');
        }
        DB::transaction(function () use ($ids, $ccs) {
            DB::table('project_phases')->whereIn('id', $ids)->delete();
            $this->retireCostCentres($ccs);
        });
        ProjectLog::record((int) $ph->project_id, $by, 'phase.purged', 'phase', (int) $ph->id, ['name' => $ph->name, 'with_children' => count($ids) - 1], null);
    }

    /**
     * Remove what has been in the trash longer than the company keeps it. What the books know about stays in the trash until a person deals with it.
     *
     * @return array{projects: int, phases: int, kept: int}
     */
    public function empty(): array
    {
        $done = ['projects' => 0, 'phases' => 0, 'kept' => 0];
        if (! ProjectsSetup::ready()) {
            return $done;
        }
        $before = now()->subDays($this->days());
        foreach (DB::table('projects')->whereNotNull('deleted_at')->where('deleted_at', '<', $before)->get() as $p) {
            $ccs = $this->costCentresOf($p);
            if ($this->inTheBooks($ccs)) {
                $done['kept']++;
                continue;
            }
            $this->eraseProject($p, $ccs);
            ProjectLog::record(null, null, 'project.purged', 'project', (int) $p->id, ['number' => $p->number, 'reason' => 'Trash emptied after the keeping period'], null);
            $done['projects']++;
        }
        foreach (DB::table('project_phases')->whereNotNull('deleted_at')->where('deleted_at', '<', $before)->get() as $ph) {
            if (! DB::table('project_phases')->where('id', $ph->id)->exists()) {
                continue;   // went with its parent a moment ago
            }
            if ($ph->cost_centre_id && $this->inTheBooks([(int) $ph->cost_centre_id])) {
                $done['kept']++;
                continue;
            }
            DB::table('project_phases')->where('id', $ph->id)->delete();
            $this->retireCostCentres($ph->cost_centre_id ? [(int) $ph->cost_centre_id] : []);
            $done['phases']++;
        }

        return $done;
    }

    // ------------------------------------------------------------------ inside

    private function needDelete(User $by, ?int $projectId, string $action): void
    {
        if (! $by->hasPermission('projects.delete')) {
            ProjectLog::refused($projectId, $by, $action, 'Does not hold projects.delete');
            throw new ProjectException('You may not use the trash.', 403);
        }
    }

    /** Could this person open it if it were not in the trash? */
    private function couldOpen(User $user, object $project): bool
    {
        $asIfThere = clone $project;
        $asIfThere->deleted_at = null;

        return $this->access->allows($user, 'open', $asIfThere);
    }

    private function trashedProject(int $id, User $by): object
    {
        $p = DB::table('projects')->where('id', $id)->whereNotNull('deleted_at')->first();
        if (! $p || ! $this->couldOpen($by, $p)) {
            throw new ProjectException('Not found.', 404);
        }

        return $p;
    }

    private function trashedPhase(int $id, User $by): object
    {
        $ph = DB::table('project_phases')->where('id', $id)->whereNotNull('deleted_at')->first();
        $project = $ph ? DB::table('projects')->where('id', $ph->project_id)->first() : null;
        if (! $ph || ! $project || ! $this->access->allows($by, 'open', $project)) {
            throw new ProjectException('Not found.', 404);
        }

        return $ph;
    }

    /** A deleted phase and the deleted phases under it. @return int[] */
    private function phaseWithDeletedChildren(object $phase): array
    {
        $all = DB::table('project_phases')->where('project_id', $phase->project_id)->whereNotNull('deleted_at')->get(['id', 'parent_id']);
        $ids = [(int) $phase->id];
        for ($i = 0; $i < count($ids); $i++) {
            foreach ($all as $r) {
                if ((int) $r->parent_id === $ids[$i]) {
                    $ids[] = (int) $r->id;
                }
            }
        }

        return $ids;
    }

    /** @param int[] $phaseIds @return int[] */
    private function phaseCostCentres(array $phaseIds): array
    {
        return DB::table('project_phases')->whereIn('id', $phaseIds)->whereNotNull('cost_centre_id')->pluck('cost_centre_id')->map(fn ($i) => (int) $i)->all();
    }

    /** The project's cost centre and those of all its phases. @return int[] */
    private function costCentresOf(object $project): array
    {
        $ids = DB::table('project_phases')->where('project_id', $project->id)->whereNotNull('cost_centre_id')->pluck('cost_centre_id')->map(fn ($i) => (int) $i)->all();
        if ($project->cost_centre_id) {
            $ids[] = (int) $project->cost_centre_id;
        }

        return $ids;
    }

    /** Do the books hold a voucher, or a line of one, that carries any of these cost centres? @param int[] $costCentreIds */
    private function inTheBooks(array $costCentreIds): bool
    {
        if (! $costCentreIds) {
            return false;
        }
        foreach (['voucher_entries', 'vouchers'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'cost_centre_id') && DB::table($table)->whereIn('cost_centre_id', $costCentreIds)->exists()) {
                return true;
            }
        }

        return false;
    }

    /** @param int[] $costCentreIds */
    private function eraseProject(object $p, array $costCentreIds): void
    {
        DB::transaction(function () use ($p, $costCentreIds) {
            foreach (['project_members', 'project_links', 'project_field_values', 'project_phases'] as $t) {
                DB::table($t)->where('project_id', $p->id)->delete();
            }
            DB::table('projects')->where('id', $p->id)->delete();
            $this->retireCostCentres($costCentreIds);
        });
    }

    /** A cost centre nothing was ever posted to is switched off (kept, so nothing in the books points at a hole). @param int[] $ids */
    private function retireCostCentres(array $ids): void
    {
        if ($ids && Schema::hasTable('cost_centres')) {
            DB::table('cost_centres')->whereIn('id', $ids)->update(['is_active' => 0, 'updated_at' => now()]);
        }
    }
}
