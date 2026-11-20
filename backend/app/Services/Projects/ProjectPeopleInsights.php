<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * People and capacity (docs/PROJECTS_STAGE12_SPEC.md, build 12.3). A person's scorecard (utilisation, billable hours, tasks on time, timesheets
 * on time) is theirs to see, and their managers' (Stage 8's line, with `projects.insights.team`). Capacity looks eight weeks ahead: the hours of
 * open tasks due each week (from the tasks' estimates, shared between the people on them) against working hours less leave.
 */
class ProjectPeopleInsights
{
    public const WEEKS = 8;

    public function __construct(private ProjectKpis $kpis, private ProjectMeasures $measures, private ProjectTeam $team) {}

    /** @return array<string, mixed> */
    public function scorecard(User $viewer, int $userId): array
    {
        $this->maySee($viewer, $userId) || throw new ProjectException('Scorecards of other people are for their managers.', 403);
        if (! ProjectKpis::ready()) {
            return ['ready' => false];
        }
        $weeks = $this->kpis->weeks(8);
        $kpis = DB::table('project_kpis')->where('is_active', 1)->whereIn('measure', $this->kpis->measuresAbout('person'))->orderBy('sort_order')->get();
        $history = DB::table('project_kpi_snapshots')->where('subject_type', 'person')->where('subject_id', $userId)->whereIn('week', $weeks)->get()->groupBy('kpi_id');
        $rows = $kpis->map(function ($k) use ($userId, $weeks, $history) {
            $r = $this->kpis->evaluate($k, 'person', $userId);
            $past = ($history[$k->id] ?? collect())->keyBy(fn ($h) => substr((string) $h->week, 0, 10));

            return $this->kpis->shape($k) + $r + ['weeks' => array_map(fn ($w) => $past[$w]->status ?? null, $weeks)];
        })->values()->all();

        return ['ready' => true, 'person' => ['id' => $userId, 'name' => DB::table('users')->where('id', $userId)->value('name')], 'health' => ProjectKpis::worst(array_column($rows, 'status')), 'kpis' => $rows, 'weeks' => $weeks];
    }

    /** The next eight weeks for each person the viewer may plan (themselves and their line; everyone on work they can see with view_all). @return array<string, mixed> */
    public function capacity(User $viewer, ?Carbon $now = null): array
    {
        $now ??= now();
        $ids = $viewer->hasPermission('projects.capacity') ? $this->team->visibleIds($viewer) : [(int) $viewer->id];
        $from = $now->copy()->startOfWeek();
        $weeks = [];
        for ($i = 0; $i < self::WEEKS; $i++) {
            $weeks[] = ['from' => $from->copy()->addWeeks($i)->toDateString(), 'to' => $from->copy()->addWeeks($i)->addDays(6)->toDateString(), 'number' => (int) $from->copy()->addWeeks($i)->isoWeek()];
        }
        $end = $weeks[self::WEEKS - 1]['to'];
        $tasks = DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->whereIn('tp.user_id', $ids ?: [0])->whereNull('t.deleted_at')->whereNull('p.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])
            ->whereNotNull('t.due_date')->where('t.due_date', '<=', $end)->get(['t.id', 't.due_date', 't.estimate_minutes', 'tp.user_id']);
        $shared = $tasks->groupBy('id')->map->count();
        $names = DB::table('users')->whereIn('id', $ids ?: [0])->pluck('name', 'id');
        $people = [];
        foreach ($ids as $id) {
            $row = ['id' => $id, 'name' => $names[$id] ?? 'Someone', 'weeks' => [], 'no_estimate' => 0];
            foreach ($weeks as $n => $w) {
                $mine = $tasks->where('user_id', $id)->filter(fn ($t) => ($n === 0 ? $t->due_date <= $w['to'] : $t->due_date >= $w['from'] && $t->due_date <= $w['to']));   // the first week takes what is already late too
                $row['no_estimate'] += $mine->whereNull('estimate_minutes')->count();
                $due = (int) round($mine->sum(fn ($t) => (int) $t->estimate_minutes / max(1, $shared[$t->id])));
                $can = $this->measures->workingMinutes($id, Carbon::parse(max($w['from'], $now->toDateString())), Carbon::parse($w['to']));
                $row['weeks'][] = ['due_hours' => round($due / 60, 1), 'can_hours' => round($can / 60, 1), 'state' => $can === 0 ? ($due > 0 ? 'over' : 'off') : ($due > $can ? 'over' : ($due > $can * 0.9 ? 'near' : 'ok'))];
            }
            $people[] = $row;
        }
        usort($people, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return ['weeks' => $weeks, 'people' => $people, 'can' => ['team' => $viewer->hasPermission('projects.capacity')]];
    }

    /** People who may take more next week, most room first (for Mimi and the team view). @return array<int, array{name: string, free_hours: float}> */
    public function room(User $viewer, ?Carbon $now = null): array
    {
        $c = $this->capacity($viewer, ($now ?? now())->copy()->addWeek());

        return collect($c['people'])->map(fn ($p) => ['name' => $p['name'], 'free_hours' => round($p['weeks'][0]['can_hours'] - $p['weeks'][0]['due_hours'], 1)])->sortByDesc('free_hours')->values()->all();
    }

    private function maySee(User $viewer, int $userId): bool
    {
        if ((int) $viewer->id === $userId) {
            return true;
        }

        return $viewer->hasPermission('projects.insights.team') && $this->team->isAbove((int) $viewer->id, $userId);
    }
}
