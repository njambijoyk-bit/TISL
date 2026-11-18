<?php

namespace App\Services\Projects;

use App\Models\AttendanceSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The team view (docs/PROJECTS_STAGE8_SPEC.md, build 8.1): who is carrying what. One row per person the viewer may see: themselves, everyone
 * below them in HR's manager line, and with `projects.view_all` everyone on work they may see. Each row reads the work as it is: open and late
 * tasks, this week's hours against their working hours, key dates and meetings this week, days away, and the work they are on. HR's record
 * (job title, department, skills, certificates) is read, never copied.
 */
class ProjectTeam
{
    public function __construct(private ProjectAccess $access) {}

    /** @param array<string, mixed> $f department, skill, project_id, late, over @return array<string, mixed> */
    public function page(User $viewer, array $f = []): array
    {
        [$from, $to] = $this->week();
        $ids = $this->visibleIds($viewer);
        $rows = collect($ids)->map(fn ($id) => $this->row($viewer, $id, $from, $to))->filter()->values();
        $rows = $rows->filter(function ($r) use ($f) {
            return (empty($f['department']) || $r['department'] === $f['department'])
                && (empty($f['skill']) || in_array(mb_strtolower((string) $f['skill']), array_map('mb_strtolower', $r['skills']), true))
                && (empty($f['project_id']) || in_array((int) $f['project_id'], array_column($r['work'], 'id'), true))
                && (empty($f['late']) || $r['tasks']['late'] > 0)
                && (empty($f['over']) || $r['week']['minutes'] > $r['week']['capacity']);
        })->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values();
        $all = collect($ids)->map(fn ($id) => $this->hr($id));

        return [
            'week' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'people' => $rows->all(),
            'departments' => $all->pluck('department')->filter()->unique()->sort()->values()->all(),
            'skills' => $all->pluck('skills')->flatten()->filter()->unique(fn ($s) => mb_strtolower($s))->sort()->values()->all(),
            'projects' => $this->workOf($viewer, $ids),
        ];
    }

    /** One person in detail. @return array<string, mixed> */
    public function person(User $viewer, int $userId): array
    {
        if (! in_array($userId, $this->visibleIds($viewer), true)) {
            throw new ProjectException('Not found.', 404);
        }
        [$from, $to] = $this->week();
        $row = $this->row($viewer, $userId, $from, $to);
        $tasks = ProjectsSetup::work() ? DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->where('tp.user_id', $userId)->whereNull('t.deleted_at')->whereNull('p.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])
            ->orderByRaw('CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END')->orderBy('t.due_date')->limit(100)
            ->get(['t.id', 't.number', 't.title', 't.status', 't.due_date', 'p.id as project_id', 'p.number as project_number', 'p.confidential', 'p.frozen_at', 'p.deleted_at']) : collect();
        $days = [];
        if (ProjectsSetup::work()) {
            foreach (DB::table('project_time')->where('user_id', $userId)->whereNull('deleted_at')->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->groupBy('work_date')->selectRaw('work_date, SUM(minutes) as m')->get() as $d) {
                $days[substr((string) $d->work_date, 0, 10)] = (int) $d->m;
            }
        }

        return $row + [
            'task_list' => $tasks->filter(fn ($t) => $this->access->base($viewer, 'open', (object) ['id' => $t->project_id, 'confidential' => $t->confidential, 'frozen_at' => $t->frozen_at, 'deleted_at' => $t->deleted_at])['allowed'])
                ->map(fn ($t) => ['id' => (int) $t->id, 'ref' => "{$t->project_number}-T{$t->number}", 'title' => $t->title, 'status' => $t->status, 'due_date' => $t->due_date, 'late' => $t->due_date && $t->due_date < now()->toDateString(), 'project_id' => (int) $t->project_id])->values()->all(),
            'days' => collect(range(0, 6))->map(fn ($i) => ['date' => $from->copy()->addDays($i)->toDateString(), 'minutes' => $days[$from->copy()->addDays($i)->toDateString()] ?? 0])->all(),
            'certificates' => $this->hr($userId)['certificates'],
            'can' => ['manage' => $viewer->hasPermission('projects.team.manage') && $userId !== (int) $viewer->id, 'checklists' => $viewer->hasPermission('projects.team.checklists')],
        ];
    }

    /** The people this viewer may see in the team view. @return int[] */
    public function visibleIds(User $viewer): array
    {
        $ids = [(int) $viewer->id];
        $ids = array_merge($ids, $this->reportsOf((int) $viewer->id));
        if ($viewer->hasPermission('projects.view_all')) {
            $q = DB::table('projects as p')->join('project_members as m', 'm.project_id', '=', 'p.id')->where('m.status', 'active');
            $this->access->visible($q, $viewer);
            $ids = array_merge($ids, $q->distinct()->pluck('m.user_id')->map(fn ($v) => (int) $v)->all());
        }

        return array_values(array_unique($ids));
    }

    /** Everyone below this person in HR's manager line, every level. @return int[] user ids */
    public function reportsOf(int $userId): array
    {
        if (! Schema::hasTable('employees') || ! Schema::hasColumn('employees', 'manager_id')) {
            return [];
        }
        $me = DB::table('employees')->where('user_id', $userId)->value('id');
        $out = [];
        $level = $me ? [(int) $me] : [];
        $seen = [];
        while ($level && count($seen) < 5000) {
            $next = DB::table('employees')->whereIn('manager_id', $level)->whereNotIn('id', array_keys($seen) ?: [0])->get(['id', 'user_id']);
            $level = [];
            foreach ($next as $e) {
                $seen[$e->id] = true;
                $level[] = (int) $e->id;
                if ($e->user_id) {
                    $out[] = (int) $e->user_id;
                }
            }
        }

        return array_values(array_unique($out));
    }

    /** Is this viewer above this person in HR's manager line? */
    public function isAbove(int $viewerId, int $userId): bool
    {
        return in_array($userId, $this->reportsOf($viewerId), true);
    }

    // ------------------------------------------------------------------ inside

    /** @return array{0: Carbon, 1: Carbon} this week, Monday to Sunday */
    private function week(): array
    {
        $from = now()->startOfWeek(Carbon::MONDAY)->startOfDay();

        return [$from, $from->copy()->addDays(6)->endOfDay()];
    }

    /** @return array<string, mixed>|null */
    private function row(User $viewer, int $userId, Carbon $from, Carbon $to): ?array
    {
        $u = DB::table('users')->where('id', $userId)->first(['id', 'name']);
        if (! $u) {
            return null;
        }
        $hr = $this->hr($userId);
        $today = now()->toDateString();
        $open = 0;
        $late = 0;
        $minutes = 0;
        $dates = 0;
        if (ProjectsSetup::work()) {
            $t = DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
                ->where('tp.user_id', $userId)->whereNull('t.deleted_at')->whereNull('p.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])
                ->selectRaw('COUNT(*) as n, SUM(CASE WHEN t.due_date < ? THEN 1 ELSE 0 END) as late', [$today])->first();
            [$open, $late] = [(int) ($t->n ?? 0), (int) ($t->late ?? 0)];
            $minutes = (int) DB::table('project_time')->where('user_id', $userId)->whereNull('deleted_at')->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->sum('minutes');
            $dates = DB::table('project_key_dates')->where('responsible_id', $userId)->whereNull('deleted_at')->where('state', 'open')->whereBetween('starts_at', [$from, $to])->count();
        }
        $meetings = ProjectsSetup::messages() ? DB::table('project_meeting_people as mp')->join('project_meetings as m', 'm.id', '=', 'mp.meeting_id')->where('mp.user_id', $userId)
            ->where('m.state', 'planned')->where('mp.response', '!=', 'no')->whereBetween('m.starts_at', [$from, $to])->count() : 0;
        $away = $this->awayDays($userId, $from, $to);

        return ['id' => (int) $u->id, 'name' => $u->name, 'job_title' => $hr['job_title'], 'department' => $hr['department'], 'skills' => $hr['skills'],
            'tasks' => ['open' => $open, 'late' => $late], 'week' => ['minutes' => $minutes, 'capacity' => $this->capacity(count($away))], 'dates' => $dates, 'meetings' => $meetings,
            'away' => $away, 'work' => $this->workOf($viewer, [$userId]), 'me' => $userId === (int) $viewer->id,
            'expiring' => count(array_filter($hr['certificates'], fn ($c) => $c['expires_on'] && $c['expires_on'] <= now()->addDays(60)->toDateString()))];
    }

    /** Minutes a person is expected to work this week: company hours on working days, less days away. */
    private function capacity(int $away): int
    {
        $s = AttendanceSetting::current();
        $perDay = max(0, (int) round((strtotime((string) $s->work_end) - strtotime((string) $s->work_start)) / 60) - 60);   // less an hour's break

        return max(0, (count($s->days()) - $away) * $perDay);
    }

    /** Working days this week the person is marked away (leave, off, holiday). @return string[] */
    private function awayDays(int $userId, Carbon $from, Carbon $to): array
    {
        if (! Schema::hasTable('attendance_days')) {
            return [];
        }

        return DB::table('attendance_days')->where('user_id', $userId)->whereIn('status', ['leave', 'off', 'holiday'])->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->pluck('work_date')->map(fn ($d) => substr((string) $d, 0, 10))->values()->all();
    }

    /** The work these people are on that the viewer may see. @param int[] $ids @return array<int, array{id: int, number: string, title: string}> */
    private function workOf(User $viewer, array $ids): array
    {
        $q = DB::table('projects as p')->join('project_members as m', 'm.project_id', '=', 'p.id')->whereIn('m.user_id', $ids ?: [0])->where('m.status', 'active')->whereIn('p.state', ['open', 'on_hold']);
        $rows = $q->whereNull('p.deleted_at')->distinct()->orderBy('p.number')->limit(200)->get(['p.id', 'p.number', 'p.title', 'p.confidential', 'p.frozen_at', 'p.deleted_at']);

        return $rows->filter(fn ($p) => $this->access->base($viewer, 'open', $p)['allowed'])->map(fn ($p) => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title])->values()->all();
    }

    /** What HR says about the person. @return array{job_title: ?string, department: ?string, skills: string[], certificates: array<int, array<string, ?string>>, manager_user_id: ?int} */
    public function hr(int $userId): array
    {
        $empty = ['job_title' => null, 'department' => null, 'skills' => [], 'certificates' => [], 'manager_user_id' => null];
        if (! Schema::hasTable('employees')) {
            return $empty;
        }
        $e = DB::table('employees')->where('user_id', $userId)->when(Schema::hasColumn('employees', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))->first();
        if (! $e) {
            return $empty;
        }
        $dept = $e->department ?? null;
        if (! $dept && ! empty($e->department_id) && Schema::hasTable('departments')) {
            $dept = DB::table('departments')->where('id', $e->department_id)->value('name');
        }
        $skills = array_values(array_filter(array_map(fn ($s) => is_array($s) ? ($s['name'] ?? null) : (string) $s, (array) (json_decode((string) ($e->skills ?? ''), true) ?: []))));
        $certs = array_map(fn ($c) => ['name' => $c['name'] ?? null, 'issuer' => $c['issuer'] ?? null, 'date' => $c['date'] ?? null, 'expires_on' => $c['expires_on'] ?? null],
            array_filter((array) (json_decode((string) ($e->certifications ?? ''), true) ?: []), 'is_array'));
        $manager = ! empty($e->manager_id) ? DB::table('employees')->where('id', $e->manager_id)->value('user_id') : null;

        return ['job_title' => $e->job_title ?? null, 'department' => $dept, 'skills' => $skills, 'certificates' => array_values($certs), 'manager_user_id' => $manager ? (int) $manager : null];
    }
}
