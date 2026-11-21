<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who a project belongs to (docs/HR_STAGE1B_SPEC.md, build D.3): one or more owners, each a branch, or a branch and one of its departments.
 *   this branch | this branch and its department | this department in two or three branches | these departments in these branches
 * A department always comes with its branch. One owner is the lead: its branch is the project's branch, and the project's cost centre is filed under
 * the lead's department (else the branch's "Projects"), so that department's figures in Books include the project. The others share the work.
 */
class ProjectOwners
{
    public function __construct(private ProjectCostCentres $costCentres) {}

    public static function ready(): bool
    {
        return Schema::hasTable('project_owners') && Schema::hasTable('departments');
    }

    /** @return array<int, array<string, mixed>> */
    public function of(int $projectId): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('project_owners as o')->leftJoin('locations as l', 'l.id', '=', 'o.location_id')->leftJoin('departments as d', 'd.id', '=', 'o.department_id')
            ->where('o.project_id', $projectId)->orderByDesc('o.is_lead')->orderBy('l.name')->orderBy('d.name')
            ->get(['o.location_id', 'l.name as branch', 'o.department_id', 'd.name as department', 'o.is_lead'])
            ->map(fn ($r) => ['location_id' => (int) $r->location_id, 'branch' => $r->branch, 'department_id' => $r->department_id ? (int) $r->department_id : null, 'department' => $r->department,
                'is_lead' => (bool) $r->is_lead, 'label' => trim($r->branch . ($r->department ? " › {$r->department}" : ''))])->all();
    }

    /**
     * Set the owners: [{location_id, department_id?, is_lead?}]. Exactly one lead (the first if none is marked). The project's branch and cost centre
     * follow the lead. @return array<int, array<string, mixed>> the owners as saved
     */
    public function save(object $project, array $owners, ?User $by, bool $starting = false): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = [];
        foreach ($owners as $o) {
            $loc = (int) ($o['location_id'] ?? 0);
            $dep = ! empty($o['department_id']) ? (int) $o['department_id'] : null;
            DB::table('locations')->where('id', $loc)->exists() || throw new ProjectException('Choose a branch for each owner: a project never belongs to a department without its branch.');
            if ($dep) {
                $d = DB::table('departments')->where('id', $dep)->first(['location_id', 'is_active', 'name']);
                $d || throw new ProjectException('Choose a department that is there.');
                (int) $d->location_id === $loc || throw new ProjectException("{$d->name} is not a department of that branch.");
                (bool) $d->is_active || throw new ProjectException("{$d->name} is switched off.");
            }
            if ($by && ! app(\App\Services\Access\Authorizer::class)->canAccessLocation($by, $loc, true)) {
                throw new ProjectException('You may only give work to branches you work in.', 403);
            }
            $rows[$loc . ':' . ($dep ?? 0)] = ['location_id' => $loc, 'department_id' => $dep, 'is_lead' => ! empty($o['is_lead'])];
        }
        $rows = array_values($rows);
        if (! $rows) {
            DB::table('project_owners')->where('project_id', $project->id)->delete();   // no branch, as a project may start

            return [];
        }
        $leads = array_keys(array_filter(array_column($rows, 'is_lead')));
        count($leads) <= 1 || throw new ProjectException('Mark one owner as the lead.');
        $leadAt = $leads[0] ?? 0;
        foreach ($rows as $i => $r) {
            $rows[$i]['is_lead'] = $i === $leadAt;
        }
        // a whole branch and one of its departments both named: the branch alone is enough unless it is the lead
        $lead = $rows[$leadAt];
        $before = $this->of((int) $project->id);
        DB::transaction(function () use ($project, $rows, $lead) {
            DB::table('project_owners')->where('project_id', $project->id)->delete();
            foreach ($rows as $r) {
                DB::table('project_owners')->insert($r + ['project_id' => $project->id, 'is_lead' => $r['is_lead'] ? 1 : 0, 'created_at' => now()]);
            }
            DB::table('projects')->where('id', $project->id)->update(['location_id' => $lead['location_id'], 'updated_at' => now()]);
            $this->costCentres->moveUnder($project->cost_centre_id ? (int) $project->cost_centre_id : null, $this->costCentres->parentFor($lead['location_id'], $lead['department_id']), $lead['location_id']);
        });
        $after = $this->of((int) $project->id);
        if (! $starting && array_column($before, 'label') !== array_column($after, 'label')) {
            ProjectLog::record((int) $project->id, $by, 'owners.changed', 'project', (int) $project->id, ['owners' => array_column($before, 'label')], ['owners' => array_column($after, 'label'), 'lead' => $after[0]['label'] ?? null]);
        }

        return $after;
    }

    /** The departments each branch offers (for the form): branch id => [{id, name}]. @return array<int, array<int, array<string, mixed>>> */
    public function departmentsByBranch(): array
    {
        if (! self::ready()) {
            return [];
        }
        $out = [];
        foreach (DB::table('departments')->where('is_active', 1)->orderBy('name')->get(['id', 'location_id', 'name']) as $d) {
            $out[(int) $d->location_id][] = ['id' => (int) $d->id, 'name' => $d->name];
        }

        return $out;
    }
}
