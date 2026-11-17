<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Tasks on a piece of work (docs/PROJECTS_STAGE5_SPEC.md, build 5.1).
 *
 * A task belongs to a piece of work and optionally to a phase and a scope line; subtasks go to any depth. It has people, a status, a priority,
 * dates, an estimate, a checklist, and other tasks it waits for ("starts when that is done").
 *
 * Who may do what:
 *  - read: anyone who may open the work;
 *  - add, change, assign, delete: `projects.tasks` and a project role that may work on tasks (ability `tasks`);
 *  - move the status and tick the checklist: the same, or someone the task is given to.
 * Nothing changes on frozen work.
 */
class ProjectTasks
{
    public const STATUSES = ['todo' => 'To do', 'doing' => 'Doing', 'waiting' => 'Waiting', 'done' => 'Done', 'cancelled' => 'Cancelled'];

    public const PRIORITIES = ['low' => 'Low', 'medium' => 'Medium', 'high' => 'High', 'urgent' => 'Urgent'];

    private const CLOSED = ['done', 'cancelled'];

    public function __construct(private ProjectAccess $access) {}

    /** The Work tab. @param array<string, mixed> $f mine, status, overdue, phase_id, q @return array<string, mixed> */
    public function list(object $project, User $user, array $f = []): array
    {
        $this->needReady();
        $all = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('number')->get();
        $ids = $all->pluck('id')->all();
        $people = $this->peopleOf($ids);
        $checks = DB::table('project_task_checks')->whereIn('task_id', $ids ?: [0])->groupBy('task_id')->selectRaw('task_id, COUNT(*) as n, SUM(done) as d')->get()->keyBy('task_id');
        $waits = DB::table('project_task_waits')->whereIn('task_id', $ids ?: [0])->get()->groupBy('task_id');
        $logged = DB::table('project_time')->whereIn('task_id', $ids ?: [0])->whereNull('deleted_at')->groupBy('task_id')->selectRaw('task_id, SUM(minutes) as m')->pluck('m', 'task_id');
        $byId = $all->keyBy('id');
        $phases = DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get(['id', 'name']);
        $today = now()->toDateString();

        $shape = function ($t) use ($people, $checks, $waits, $logged, $byId, $project, $today, $user) {
            $w = ($waits[$t->id] ?? collect())->map(fn ($x) => $byId[$x->waits_for_id] ?? null)->filter();

            return [
                'id' => (int) $t->id, 'number' => (int) $t->number, 'ref' => "{$project->number}-T{$t->number}", 'title' => $t->title, 'description' => $t->description,
                'parent_id' => $t->parent_id ? (int) $t->parent_id : null, 'phase_id' => $t->phase_id ? (int) $t->phase_id : null, 'scope_line_id' => $t->scope_line_id ? (int) $t->scope_line_id : null,
                'status' => $t->status, 'priority' => $t->priority, 'start_date' => $t->start_date, 'due_date' => $t->due_date,
                'overdue' => $t->due_date && $t->due_date < $today && ! in_array($t->status, self::CLOSED, true),
                'estimate_minutes' => $t->estimate_minutes !== null ? (int) $t->estimate_minutes : null, 'logged_minutes' => (int) ($logged[$t->id] ?? 0),
                'billable' => $t->billable === null ? null : (bool) $t->billable,
                'people' => $people[$t->id] ?? [],
                'mine' => in_array((int) $user->id, array_column($people[$t->id] ?? [], 'id'), true),
                'checks' => ['total' => (int) ($checks[$t->id]->n ?? 0), 'done' => (int) ($checks[$t->id]->d ?? 0)],
                'waits_for' => $w->map(fn ($x) => ['id' => (int) $x->id, 'ref' => "{$project->number}-T{$x->number}", 'title' => $x->title, 'open' => ! in_array($x->status, self::CLOSED, true)])->values()->all(),
                'completed_at' => $t->completed_at,
            ];
        };

        $rows = $all->map($shape);
        // filters keep a task's parents, so a subtask that matches still shows where it belongs
        if ($f) {
            $match = $rows->filter(function ($t) use ($f, $user) {
                return (empty($f['mine']) || in_array((int) $user->id, array_column($t['people'], 'id'), true))
                    && (empty($f['status']) || $t['status'] === $f['status'])
                    && (empty($f['overdue']) || $t['overdue'])
                    && (empty($f['phase_id']) || $t['phase_id'] === (int) $f['phase_id'])
                    && (empty($f['q']) || str_contains(mb_strtolower($t['title'] . ' ' . $t['ref']), mb_strtolower(trim((string) $f['q']))));
            })->pluck('id')->all();
            $keep = $match;
            foreach ($match as $id) {
                for ($p = $byId[$id]->parent_id ?? null; $p && ! in_array((int) $p, $keep, true); $p = $byId[$p]->parent_id ?? null) {
                    $keep[] = (int) $p;
                }
            }
            $rows = $rows->filter(fn ($t) => in_array($t['id'], $keep, true))->map(fn ($t) => $t + ['matches' => in_array($t['id'], $match, true)]);
        }

        $manage = $this->access->decide($user, 'tasks', $project)['allowed'];

        return [
            'ready' => true,
            'tasks' => $this->ordered($rows->values()),
            'statuses' => $this->statusNames($project),
            'priorities' => self::PRIORITIES,
            'phases' => $phases->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->all(),
            'people' => $manage ? $this->members($project) : [],
            'billable_default' => (bool) app(ProjectSettings::class)->get('work')['billable_default'],
            'can' => ['manage' => $manage],
        ];
    }

    /** One task with its checklist, for the task panel. @return array<string, mixed> */
    public function show(object $project, int $taskId, User $user): array
    {
        $t = $this->find($project, $taskId);
        $list = collect($this->list($project, $user)['tasks'])->keyBy('id');

        return $list[$t->id] + [
            'checklist' => DB::table('project_task_checks')->where('task_id', $t->id)->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn ($c) => ['id' => (int) $c->id, 'text' => $c->text, 'done' => (bool) $c->done])->all(),
            'subtasks' => $list->where('parent_id', $t->id)->map(fn ($s) => ['id' => $s['id'], 'ref' => $s['ref'], 'title' => $s['title'], 'status' => $s['status']])->values()->all(),
            'can' => ['manage' => $this->access->decide($user, 'tasks', $project)['allowed'], 'work' => $this->mayWork($project, $t, $user)],
        ];
    }

    /** @param array<string, mixed> $d title, description, parent_id, phase_id, status, priority, start_date, due_date, estimate_hours, billable, people, waits_for */
    public function create(object $project, array $d, User $by): int
    {
        $this->needReady();
        $this->access->authorize($by, 'tasks', $project);
        $row = $this->fields($project, $d, null);
        $people = $this->checkPeople($project, (array) ($d['people'] ?? []));

        $id = DB::transaction(function () use ($project, $row, $people, $d, $by) {
            $number = (int) DB::table('project_work_tasks')->where('project_id', $project->id)->lockForUpdate()->max('number') + 1;
            $order = (int) DB::table('project_work_tasks')->where('project_id', $project->id)->where('parent_id', $row['parent_id'] ?? null)->max('sort_order') + 1;
            $id = DB::table('project_work_tasks')->insertGetId($row + ['project_id' => $project->id, 'number' => $number, 'status' => $row['status'] ?? 'todo', 'sort_order' => $order,
                'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            $added = $this->setPeople($id, $people, $by);
            if (array_key_exists('waits_for', $d)) {
                $this->setWaits($project, $id, (array) $d['waits_for']);
            }
            ProjectLog::record((int) $project->id, $by, 'task.created', 'task', $id, null, ['ref' => "T{$number}", 'title' => $row['title']]);

            return [$id, $added];
        });
        [$id, $added] = $id;
        $this->afterChange($project, $id, $added, $by);

        return $id;
    }

    /** Change a task's details, people or what it waits for. The status has its own door (move()). */
    public function update(object $project, int $taskId, array $d, User $by): void
    {
        $t = $this->find($project, $taskId);
        $this->access->authorize($by, 'tasks', $project);
        unset($d['status']);
        $row = $this->fields($project, $d, $t);
        $people = array_key_exists('people', $d) ? $this->checkPeople($project, (array) $d['people']) : null;
        $added = DB::transaction(function () use ($project, $t, $row, $people, $d, $by) {
            $added = [];
            if ($row) {
                DB::table('project_work_tasks')->where('id', $t->id)->update($row + ['updated_at' => now()]);
            }
            if ($people !== null) {
                $added = $this->setPeople((int) $t->id, $people, $by);
            }
            if (array_key_exists('waits_for', $d)) {
                $this->setWaits($project, (int) $t->id, (array) $d['waits_for']);
            }
            $old = array_intersect_key((array) $t, $row);
            ProjectLog::record((int) $project->id, $by, 'task.changed', 'task', (int) $t->id, $old ?: null, $row + ($people !== null ? ['people' => $people] : []));

            return $added;
        });
        $this->afterChange($project, (int) $t->id, $added, $by);
    }

    /**
     * Move a task to another status. Starting or finishing it while something it waits for is still open needs a reason, which is logged.
     * Finishing it needs its subtasks finished or cancelled first.
     */
    public function move(object $project, int $taskId, string $status, User $by, ?string $reason = null): void
    {
        $t = $this->find($project, $taskId);
        if (! isset(self::STATUSES[$status])) {
            throw new ProjectException('Choose a status from the list.');
        }
        $this->needWork($project, $t, $by);
        if ($t->status === $status) {
            return;
        }
        $reason = trim((string) $reason) ?: null;
        if (in_array($status, ['doing', 'done'], true)) {
            $open = DB::table('project_task_waits as w')->join('project_work_tasks as o', 'o.id', '=', 'w.waits_for_id')->where('w.task_id', $t->id)->whereNull('o.deleted_at')
                ->whereNotIn('o.status', self::CLOSED)->orderBy('o.number')->pluck('o.number')->all();
            if ($open && ! $reason) {
                $refs = implode(', ', array_map(fn ($n) => "{$project->number}-T{$n}", $open));
                throw new ProjectException("This waits for {$refs}, which is not done yet. Say why it goes ahead anyway.", 422, ['needs_reason' => true, 'waits_for' => $open]);
            }
        }
        if ($status === 'done' && DB::table('project_work_tasks')->where('parent_id', $t->id)->whereNull('deleted_at')->whereNotIn('status', self::CLOSED)->exists()) {
            throw new ProjectException('Finish or cancel its subtasks first.');
        }
        DB::table('project_work_tasks')->where('id', $t->id)->update(['status' => $status, 'completed_at' => $status === 'done' ? now() : null, 'completed_by' => $status === 'done' ? $by->id : null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'task.moved', 'task', (int) $t->id, ['status' => $t->status], ['status' => $status], ProjectLog::DONE, $reason);
        app(ProjectTaskCalendar::class)->sync((int) $t->id);
        if ($status === 'done') {
            $this->tellWaiting($project, $t, $by);
        }
    }

    public function delete(object $project, int $taskId, User $by): int
    {
        $t = $this->find($project, $taskId);
        $this->access->authorize($by, 'tasks', $project);
        $ids = $this->withDescendants($project, (int) $t->id);
        if (DB::table('project_time')->whereIn('task_id', $ids)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('Time is logged on this task (or one under it), so it stays. Cancel it instead.');
        }
        DB::transaction(function () use ($ids, $by, $project, $t) {
            DB::table('project_work_tasks')->whereIn('id', $ids)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
            DB::table('project_task_waits')->whereIn('waits_for_id', $ids)->delete();
            ProjectLog::record((int) $project->id, $by, 'task.deleted', 'task', (int) $t->id, ['ref' => "T{$t->number}", 'title' => $t->title], ['with_subtasks' => count($ids) - 1]);
        });
        foreach ($ids as $id) {
            app(ProjectTaskCalendar::class)->sync($id);
        }

        return count($ids);
    }

    /**
     * The daily reminder (07:30): each person hears, in one message, which of their open tasks are due tomorrow and which became late yesterday.
     * Run once a day, so each task is mentioned on those two days only. Work in the trash or frozen is left out. @return int people told
     */
    public function remind(?\Carbon\Carbon $today = null): int
    {
        if (! ProjectsSetup::work()) {
            return 0;
        }
        $today ??= now();
        $rows = DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->whereNull('t.deleted_at')->whereNull('p.deleted_at')->whereNull('p.frozen_at')->whereNotIn('t.status', self::CLOSED)
            ->whereIn('t.due_date', [$today->copy()->addDay()->toDateString(), $today->copy()->subDay()->toDateString()])
            ->orderBy('t.due_date')->get(['tp.user_id', 't.id', 't.number', 't.title', 't.due_date', 'p.id as project_id', 'p.number as project_number']);
        $told = 0;
        foreach ($rows->groupBy('user_id') as $userId => $mine) {
            $user = User::find($userId);
            if (! $user) {
                continue;
            }
            $line = fn ($t) => "{$t->project_number}-T{$t->number} {$t->title}";
            $soon = $mine->where('due_date', $today->copy()->addDay()->toDateString());
            $late = $mine->where('due_date', $today->copy()->subDay()->toDateString());
            $parts = array_filter([$soon->isNotEmpty() ? "Due tomorrow:\n" . $soon->map($line)->implode("\n") : null, $late->isNotEmpty() ? "Late since yesterday:\n" . $late->map($line)->implode("\n") : null]);
            $title = $late->isNotEmpty() ? ($late->count() === 1 ? 'A task of yours is late' : "{$late->count()} tasks of yours are late") : ($soon->count() === 1 ? 'A task of yours is due tomorrow' : "{$soon->count()} tasks of yours are due tomorrow");
            ProjectNotices::tell($user, ProjectNotices::TASK, $title, implode("\n\n", $parts), '/admin/projects/my-work', 'Open My Work');
            $told++;
        }

        return $told;
    }

    // ------------------------------------------------------------------ checklist

    public function addCheck(object $project, int $taskId, string $text, User $by): int
    {
        $t = $this->find($project, $taskId);
        $this->needWork($project, $t, $by);
        $text = trim(preg_replace('/\s+/', ' ', $text));
        if ($text === '') {
            throw new ProjectException('Write what has to be checked.');
        }
        if (DB::table('project_task_checks')->where('task_id', $t->id)->count() >= 50) {
            throw new ProjectException('A checklist holds up to 50 lines. Split the task.');
        }
        $id = DB::table('project_task_checks')->insertGetId(['task_id' => $t->id, 'text' => mb_substr($text, 0, 200), 'done' => 0,
            'sort_order' => (int) DB::table('project_task_checks')->where('task_id', $t->id)->max('sort_order') + 1]);
        ProjectLog::record((int) $project->id, $by, 'task.check_added', 'task', (int) $t->id, null, ['text' => $text]);

        return $id;
    }

    public function tick(object $project, int $taskId, int $checkId, bool $done, User $by): void
    {
        $t = $this->find($project, $taskId);
        $this->needWork($project, $t, $by);
        $c = DB::table('project_task_checks')->where('id', $checkId)->where('task_id', $t->id)->first() ?? throw new ProjectException('Not found.', 404);
        DB::table('project_task_checks')->where('id', $c->id)->update(['done' => $done ? 1 : 0, 'done_by' => $done ? $by->id : null, 'done_at' => $done ? now() : null]);
        ProjectLog::record((int) $project->id, $by, $done ? 'task.checked' : 'task.unchecked', 'task', (int) $t->id, null, ['text' => $c->text]);
    }

    public function removeCheck(object $project, int $taskId, int $checkId, User $by): void
    {
        $t = $this->find($project, $taskId);
        $this->needWork($project, $t, $by);
        $c = DB::table('project_task_checks')->where('id', $checkId)->where('task_id', $t->id)->first() ?? throw new ProjectException('Not found.', 404);
        DB::table('project_task_checks')->where('id', $c->id)->delete();
        ProjectLog::record((int) $project->id, $by, 'task.check_removed', 'task', (int) $t->id, ['text' => $c->text], null);
    }

    // ------------------------------------------------------------------ inside

    /** The status words in this work's industry (a company's own names included). @return array<string, string> */
    public function statusNames(object $project): array
    {
        $names = app(ProjectNames::class)->names((string) ($project->industry_key ?? app(ProjectSettings::class)->defaultIndustry()));

        return array_combine(array_keys(self::STATUSES), array_map(fn ($k, $label) => $names["task_{$k}"]['name'] ?? $label, array_keys(self::STATUSES), self::STATUSES));
    }

    public function find(object $project, int $taskId): object
    {
        $this->needReady();

        return DB::table('project_work_tasks')->where('id', $taskId)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
    }

    /** May move its status and tick its checklist: whoever manages tasks here, or someone it is given to who may open the work. */
    private function mayWork(object $project, object $t, User $user): bool
    {
        if ($project->frozen_at !== null) {
            return false;
        }
        if ($this->access->decide($user, 'tasks', $project)['allowed']) {
            return true;
        }

        return DB::table('project_task_people')->where('task_id', $t->id)->where('user_id', $user->id)->exists() && $this->access->decide($user, 'open', $project)['allowed'];
    }

    private function needWork(object $project, object $t, User $user): void
    {
        if ($project->frozen_at !== null) {
            throw new ProjectException('This is frozen. Unfreeze it before changing anything.', 403);
        }
        if (! $this->mayWork($project, $t, $user)) {
            $this->access->authorize($user, 'tasks', $project);   // logs the refusal and answers as the access rules do
        }
    }

    /** Check and tidy what may be stored. @return array<string, mixed> */
    private function fields(object $project, array $d, ?object $t): array
    {
        $row = [];
        if ($t === null || array_key_exists('title', $d)) {
            $title = trim(preg_replace('/\s+/', ' ', (string) ($d['title'] ?? '')));
            if ($title === '') {
                throw new ProjectException('Give the task a title.');
            }
            $row['title'] = mb_substr($title, 0, 200);
        }
        if (array_key_exists('description', $d)) {
            $row['description'] = trim((string) $d['description']) === '' ? null : mb_substr(trim((string) $d['description']), 0, 5000);
        }
        if ($t === null && array_key_exists('status', $d)) {
            if (! isset(self::STATUSES[(string) $d['status']]) || in_array($d['status'], self::CLOSED, true)) {
                throw new ProjectException('A new task starts as To do, Doing or Waiting.');
            }
            $row['status'] = (string) $d['status'];
        }
        if (array_key_exists('priority', $d)) {
            if (! isset(self::PRIORITIES[(string) $d['priority']])) {
                throw new ProjectException('Choose a priority from the list.');
            }
            $row['priority'] = (string) $d['priority'];
        }
        if (array_key_exists('parent_id', $d)) {
            $parent = $d['parent_id'] ? (int) $d['parent_id'] : null;
            if ($parent) {
                if (! DB::table('project_work_tasks')->where('id', $parent)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                    throw new ProjectException('A subtask goes under a task of the same work.');
                }
                if ($t && in_array($parent, $this->withDescendants($project, (int) $t->id), true)) {
                    throw new ProjectException('A task cannot go under itself or one of its own subtasks.');
                }
            }
            $row['parent_id'] = $parent;
        }
        if (array_key_exists('phase_id', $d)) {
            $phase = $d['phase_id'] ? (int) $d['phase_id'] : null;
            if ($phase && ! DB::table('project_phases')->where('id', $phase)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("Choose one of this work's phases.");
            }
            $row['phase_id'] = $phase;
        }
        if (array_key_exists('scope_line_id', $d)) {
            $line = $d['scope_line_id'] ? (int) $d['scope_line_id'] : null;
            if ($line && ! DB::table('project_scope_lines')->where('id', $line)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("Choose one of this work's scope lines.");
            }
            $row['scope_line_id'] = $line;
        }
        foreach (['start_date', 'due_date'] as $k) {
            if (array_key_exists($k, $d)) {
                $row[$k] = $this->date($d[$k]);
            }
        }
        $start = array_key_exists('start_date', $row) ? $row['start_date'] : ($t->start_date ?? null);
        $due = array_key_exists('due_date', $row) ? $row['due_date'] : ($t->due_date ?? null);
        if ($start && $due && $start > $due) {
            throw new ProjectException('It cannot be due before it starts.');
        }
        if (array_key_exists('estimate_hours', $d)) {
            $h = $d['estimate_hours'];
            if ($h !== null && $h !== '' && ((float) $h < 0 || (float) $h > 10000)) {
                throw new ProjectException('An estimate is in hours, from 0 to 10,000.');
            }
            $row['estimate_minutes'] = $h === null || $h === '' ? null : (int) round((float) $h * 60);
        }
        if (array_key_exists('billable', $d)) {
            $row['billable'] = $d['billable'] === null || $d['billable'] === '' ? null : ($d['billable'] ? 1 : 0);
        }

        return $row;
    }

    private function date(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        try {
            return \Carbon\Carbon::parse((string) $v)->toDateString();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
    }

    /** People a task can be given to: those on the work who may open it. @return int[] */
    private function checkPeople(object $project, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
        if (count($ids) > 20) {
            throw new ProjectException('A task can be given to up to 20 people.');
        }
        $on = array_column($this->members($project), 'id');
        if ($missing = array_diff($ids, $on)) {
            throw new ProjectException('A task can only be given to people on this work.');
        }

        return $ids;
    }

    /** @return array<int, array{id: int, name: string}> */
    private function members(object $project): array
    {
        $now = now();

        return DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->join('project_role_permissions as p', 'p.project_role_id', '=', 'm.project_role_id')
            ->where('m.project_id', $project->id)->where('m.status', 'active')->where('p.ability', 'open')
            ->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->orderBy('u.name')->distinct()->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all();
    }

    /** @return int[] the people newly given the task */
    private function setPeople(int $taskId, array $ids, User $by): array
    {
        $now = DB::table('project_task_people')->where('task_id', $taskId)->pluck('user_id')->map(fn ($v) => (int) $v)->all();
        DB::table('project_task_people')->where('task_id', $taskId)->whereNotIn('user_id', $ids ?: [0])->delete();
        $added = array_values(array_diff($ids, $now));
        foreach ($added as $u) {
            DB::table('project_task_people')->insert(['task_id' => $taskId, 'user_id' => $u, 'added_by' => $by->id, 'added_at' => now()]);
        }

        return $added;
    }

    /** After a task is added or changed: its calendar entries, and a notice to the people newly given it (not to whoever gave it). */
    private function afterChange(object $project, int $taskId, array $added, User $by): void
    {
        app(ProjectTaskCalendar::class)->sync($taskId);
        $added = array_values(array_diff($added, [(int) $by->id]));
        if (! $added) {
            return;
        }
        $t = DB::table('project_work_tasks')->where('id', $taskId)->first();
        $due = $t->due_date ? ', due ' . \Carbon\Carbon::parse($t->due_date)->format('j M Y') : '';
        ProjectNotices::tell(User::whereIn('id', $added)->get(), ProjectNotices::TASK, "{$by->name} gave you a task on {$project->number}",
            "{$project->number}-T{$t->number} {$t->title}{$due}.", "/admin/projects/{$project->id}?tab=work&task={$t->id}", 'Open the task');
    }

    /** A task is done: the people on tasks that wait for it are told. */
    private function tellWaiting(object $project, object $done, User $by): void
    {
        $waiting = DB::table('project_task_waits as w')->join('project_work_tasks as t', 't.id', '=', 'w.task_id')->where('w.waits_for_id', $done->id)->whereNull('t.deleted_at')
            ->whereNotIn('t.status', self::CLOSED)->get(['t.id', 't.number', 't.title']);
        foreach ($waiting as $w) {
            $people = DB::table('project_task_people')->where('task_id', $w->id)->where('user_id', '!=', $by->id)->pluck('user_id');
            ProjectNotices::tell(User::whereIn('id', $people)->get(), ProjectNotices::TASK, "{$project->number}-T{$done->number} is done",
                "{$project->number}-T{$w->number} {$w->title} was waiting for it.", "/admin/projects/{$project->id}?tab=work&task={$w->id}", 'Open the task');
        }
    }

    /** "Starts when these are done": tasks of the same work, never itself, and never round in a circle. */
    private function setWaits(object $project, int $taskId, array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
        if (in_array($taskId, $ids, true)) {
            throw new ProjectException('A task cannot wait for itself.');
        }
        $known = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->whereIn('id', $ids ?: [0])->pluck('id')->map(fn ($v) => (int) $v)->all();
        if (count($known) !== count($ids)) {
            throw new ProjectException('A task can only wait for tasks of the same work.');
        }
        $graph = DB::table('project_task_waits as w')->join('project_work_tasks as t', 't.id', '=', 'w.task_id')->where('t.project_id', $project->id)->where('w.task_id', '!=', $taskId)
            ->get(['w.task_id', 'w.waits_for_id'])->groupBy('task_id')->map(fn ($g) => $g->pluck('waits_for_id')->map(fn ($v) => (int) $v)->all())->all();
        $graph[$taskId] = $ids;
        // a circle exists if, following "waits for" from any new one, we come back to this task
        $seen = [];
        $stack = $ids;
        while ($stack) {
            $n = array_pop($stack);
            if ($n === $taskId) {
                throw new ProjectException('That would make tasks wait for each other in a circle, so none could start.');
            }
            if (isset($seen[$n])) {
                continue;
            }
            $seen[$n] = true;
            array_push($stack, ...($graph[$n] ?? []));
        }
        DB::table('project_task_waits')->where('task_id', $taskId)->delete();
        foreach ($ids as $w) {
            DB::table('project_task_waits')->insert(['task_id' => $taskId, 'waits_for_id' => $w]);
        }
    }

    /** @return int[] the task and every task under it */
    private function withDescendants(object $project, int $taskId): array
    {
        $children = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotNull('parent_id')->get(['id', 'parent_id'])
            ->groupBy('parent_id')->map(fn ($g) => $g->pluck('id')->map(fn ($v) => (int) $v)->all())->all();
        $out = [];
        $stack = [$taskId];
        while ($stack) {
            $n = array_pop($stack);
            if (in_array($n, $out, true)) {
                continue;
            }
            $out[] = $n;
            array_push($stack, ...($children[$n] ?? []));
        }

        return $out;
    }

    /** @return array<int, array<int, array{id: int, name: string}>> */
    private function peopleOf(array $ids): array
    {
        return DB::table('project_task_people as p')->join('users as u', 'u.id', '=', 'p.user_id')->whereIn('p.task_id', $ids ?: [0])->orderBy('u.name')->get(['p.task_id', 'u.id', 'u.name'])
            ->groupBy('task_id')->map(fn ($g) => $g->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->values()->all())->all();
    }

    /** Parents before their children, each with its depth. */
    private function ordered(Collection $rows): array
    {
        $byParent = $rows->groupBy(fn ($t) => $t['parent_id'] ?? 0);
        $present = $rows->pluck('id')->all();
        $out = [];
        $walk = function ($parent, int $depth) use (&$walk, &$out, $byParent) {
            foreach ($byParent[$parent] ?? [] as $t) {
                $out[] = $t + ['depth' => $depth];
                $walk($t['id'], $depth + 1);
            }
        };
        $walk(0, 0);
        // a child whose parent is filtered out still shows, at the top
        foreach ($rows as $t) {
            if ($t['parent_id'] && ! in_array($t['parent_id'], $present, true) && ! in_array($t['id'], array_column($out, 'id'), true)) {
                $out[] = $t + ['depth' => 0];
                $walk($t['id'], 1);
            }
        }

        return $out;
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Tasks need database script 261. Run it first.', 409);
        }
    }
}
