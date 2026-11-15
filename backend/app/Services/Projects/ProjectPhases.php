<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The parts of a project, as a tree to any depth: phases, sections, stages of a design, episodes of care (each industry has its own word).
 * A phase either has its own cost centre in the books, nested under its parent's, or uses its parent's (in the end the project's): so cost can
 * be followed as finely as the work needs and no finer. A cost centre, once made, stays: vouchers may already carry it.
 */
class ProjectPhases
{
    private const MAX_DEPTH = 12;

    public function __construct(private ProjectAccess $access, private ProjectCostCentres $costCentres) {}

    /**
     * The phases of a project as a flat list in tree order, each with its depth and the cost centre its costs land in.
     *
     * @return array<int, array<string, mixed>>
     */
    public function tree(object $project): array
    {
        $rows = DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get();
        $byParent = [];
        foreach ($rows as $r) {
            $byParent[(int) ($r->parent_id ?? 0)][] = $r;
        }
        $out = [];
        $walk = function (int $parent, int $depth, ?int $inherited) use (&$walk, &$out, $byParent) {
            foreach ($byParent[$parent] ?? [] as $r) {
                $own = $r->cost_centre_id ? (int) $r->cost_centre_id : null;
                $out[] = ['id' => (int) $r->id, 'parent_id' => $r->parent_id ? (int) $r->parent_id : null, 'depth' => $depth, 'code' => $r->code, 'name' => $r->name, 'state' => $r->state,
                    'start_date' => $r->start_date ? substr((string) $r->start_date, 0, 10) : null, 'due_date' => $r->due_date ? substr((string) $r->due_date, 0, 10) : null,
                    'has_own_cost_centre' => $own !== null, 'cost_centre_id' => $own ?? $inherited, 'children' => count($byParent[(int) $r->id] ?? [])];
                $walk((int) $r->id, $depth + 1, $own ?? $inherited);
            }
        };
        $walk(0, 0, $project->cost_centre_id ? (int) $project->cost_centre_id : null);

        return $out;
    }

    /** @param array<string, mixed> $d name, code, parent_id, own_cost_centre, start_date, due_date */
    public function create(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'phases', $project);
        $v = $this->clean($d, true);
        $parent = $this->parent($project, $d['parent_id'] ?? null);
        if ($parent && $this->depthOf($parent) + 1 >= self::MAX_DEPTH) {
            throw new ProjectException('That is as deep as phases go.');
        }
        $id = DB::transaction(function () use ($project, $v, $parent, $d, $by) {
            $sort = ((int) DB::table('project_phases')->where('project_id', $project->id)->where('parent_id', $parent?->id)->max('sort_order')) + 10;
            $id = DB::table('project_phases')->insertGetId($v + ['project_id' => $project->id, 'parent_id' => $parent?->id, 'sort_order' => $sort, 'state' => 'open', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            if (! empty($d['own_cost_centre'])) {
                $this->giveCostCentre($project, $id);
            }

            return $id;
        });
        ProjectLog::record((int) $project->id, $by, 'phase.added', 'phase', $id, null, ['name' => $v['name'], 'code' => $v['code'], 'parent_id' => $parent?->id, 'own_cost_centre' => ! empty($d['own_cost_centre'])]);

        return $id;
    }

    /** @param array<string, mixed> $d name, code, start_date, due_date, state (open|done), own_cost_centre (true gives it one; it cannot be taken away), move (up|down) */
    public function update(object $project, int $phaseId, array $d, User $by): void
    {
        $this->access->authorize($by, 'phases', $project);
        $phase = $this->find($project, $phaseId);
        $new = $this->clean($d, false);
        if (array_key_exists('state', $d)) {
            if (! in_array($d['state'], ['open', 'done'], true)) {
                throw new ProjectException('A phase is open or done.');
            }
            $new['state'] = $d['state'];
        }
        $start = $new['start_date'] ?? $phase->start_date;
        $due = $new['due_date'] ?? $phase->due_date;
        if ($start && $due && substr((string) $due, 0, 10) < substr((string) $start, 0, 10)) {
            throw new ProjectException('The end date is before the start date.');
        }
        $changed = array_filter($new, fn ($val, $k) => (string) ($phase->$k ?? '') !== (string) ($val ?? ''), ARRAY_FILTER_USE_BOTH);
        $give = ! empty($d['own_cost_centre']) && ! $phase->cost_centre_id;
        $move = in_array($d['move'] ?? null, ['up', 'down'], true) ? $d['move'] : null;
        if (! $changed && ! $give && ! $move) {
            return;
        }
        $moved = false;
        DB::transaction(function () use ($project, $phase, $changed, $give, $move, &$moved) {
            if ($changed) {
                DB::table('project_phases')->where('id', $phase->id)->update($changed + ['updated_at' => now()]);
            }
            if ($give) {
                $this->giveCostCentre($project, (int) $phase->id);
            } elseif ($phase->cost_centre_id && (isset($changed['name']) || array_key_exists('code', $changed))) {
                $this->costCentres->renamePhase((int) $phase->cost_centre_id, $this->label($changed['code'] ?? $phase->code, $changed['name'] ?? $phase->name));
            }
            if ($move) {
                $moved = $this->move($phase, $move);
            }
        });
        if (! $changed && ! $give && ! $moved) {
            return;   // asked to move the first one up or the last one down: nothing happened, so nothing is logged
        }
        ProjectLog::record((int) $project->id, $by, 'phase.changed', 'phase', (int) $phase->id, array_intersect_key((array) $phase, $changed),
            $changed + ($give ? ['own_cost_centre' => true] : []) + ($moved ? ['moved' => $move] : []));
    }

    /** Put a phase, and everything under it, in the trash. */
    public function delete(object $project, int $phaseId, User $by): int
    {
        $this->access->authorize($by, 'phases', $project);
        if (! $by->hasPermission('projects.delete')) {
            ProjectLog::refused((int) $project->id, $by, 'phase.deleted', 'Does not hold projects.delete', 'phase', $phaseId);
            throw new ProjectException('You may not put things in the trash.', 403);
        }
        $phase = $this->find($project, $phaseId);
        $ids = $this->withDescendants($project, (int) $phase->id);
        DB::table('project_phases')->whereIn('id', $ids)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
        ProjectLog::record((int) $project->id, $by, 'phase.deleted', 'phase', (int) $phase->id, ['name' => $phase->name, 'with_children' => count($ids) - 1], null);

        return count($ids);
    }

    // ------------------------------------------------------------------ inside

    private function find(object $project, int $id): object
    {
        $p = DB::table('project_phases')->where('id', $id)->where('project_id', $project->id)->whereNull('deleted_at')->first();
        if (! $p) {
            throw new ProjectException('Not found.', 404);
        }

        return $p;
    }

    private function parent(object $project, mixed $parentId): ?object
    {
        if ($parentId === null || $parentId === '' || (int) $parentId === 0) {
            return null;
        }
        $p = DB::table('project_phases')->where('id', (int) $parentId)->where('project_id', $project->id)->whereNull('deleted_at')->first();
        if (! $p) {
            throw new ProjectException('The phase to put it under does not exist on this project.');
        }

        return $p;
    }

    private function depthOf(object $phase): int
    {
        $depth = 0;
        for ($p = $phase; $p && $p->parent_id && $depth < self::MAX_DEPTH + 1; $depth++) {
            $p = DB::table('project_phases')->where('id', $p->parent_id)->first();
        }

        return $depth;
    }

    /** @return int[] the phase and every phase under it */
    private function withDescendants(object $project, int $id): array
    {
        $all = DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->get(['id', 'parent_id']);
        $ids = [$id];
        for ($i = 0; $i < count($ids); $i++) {
            foreach ($all as $r) {
                if ((int) $r->parent_id === $ids[$i]) {
                    $ids[] = (int) $r->id;
                }
            }
        }

        return $ids;
    }

    /** A cost centre of its own, nested under the cost centre its parent's costs land in. Nothing happens where the books have none. */
    private function giveCostCentre(object $project, int $phaseId): void
    {
        $phase = DB::table('project_phases')->where('id', $phaseId)->first();
        $above = $project->cost_centre_id ? (int) $project->cost_centre_id : null;
        for ($p = $phase, $n = 0; $p && $p->parent_id && $n < self::MAX_DEPTH + 1; $n++) {
            $p = DB::table('project_phases')->where('id', $p->parent_id)->first();
            if ($p && $p->cost_centre_id) {
                $above = (int) $p->cost_centre_id;
                break;
            }
        }
        $cc = $this->costCentres->forPhase($above, $project->number, $this->label($phase->code, $phase->name));
        if ($cc) {
            DB::table('project_phases')->where('id', $phaseId)->update(['cost_centre_id' => $cc->id, 'updated_at' => now()]);
        }
    }

    /** Swap places with the phase before or after it under the same parent. */
    private function move(object $phase, string $direction): bool
    {
        $siblings = DB::table('project_phases')->where('project_id', $phase->project_id)->where('parent_id', $phase->parent_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
        $i = array_search($phase->id, $siblings);
        $j = $direction === 'up' ? $i - 1 : $i + 1;
        if ($i === false || ! isset($siblings[$j])) {
            return false;
        }
        [$siblings[$i], $siblings[$j]] = [$siblings[$j], $siblings[$i]];
        foreach ($siblings as $n => $id) {
            DB::table('project_phases')->where('id', $id)->update(['sort_order' => ($n + 1) * 10]);
        }

        return true;
    }

    private function label(?string $code, string $name): string
    {
        return trim(($code ? $code . ' ' : '') . $name);
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function clean(array $d, bool $new): array
    {
        $line = fn (string $s, int $max) => mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F<>]/u', ' ', strip_tags($s)))), 0, $max);
        $date = function (mixed $v): ?string {
            if ($v === null || $v === '') {
                return null;
            }
            try {
                return \Carbon\Carbon::parse((string) $v)->toDateString();
            } catch (\Throwable) {
                throw new ProjectException('That is not a date.');
            }
        };
        $out = [];
        if ($new || array_key_exists('name', $d)) {
            $out['name'] = $line((string) ($d['name'] ?? ''), 160);
            if ($out['name'] === '') {
                throw new ProjectException('Give it a name.');
            }
        }
        if ($new || array_key_exists('code', $d)) {
            $out['code'] = $line((string) ($d['code'] ?? ''), 30) ?: null;
        }
        foreach (['start_date', 'due_date'] as $k) {
            if ($new || array_key_exists($k, $d)) {
                $out[$k] = $date($d[$k] ?? null);
            }
        }
        if ($new && $out['start_date'] && $out['due_date'] && $out['due_date'] < $out['start_date']) {
            throw new ProjectException('The end date is before the start date.');
        }

        return $out;
    }
}
