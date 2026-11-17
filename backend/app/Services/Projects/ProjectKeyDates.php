<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Key dates (docs/PROJECTS_STAGE5_SPEC.md, build 5.4): a hearing, a filing deadline, an inspection, a handover. A kind (from the "key_date" list),
 * when (a day, or a day and time), who is responsible, and the phase or task it belongs to.
 *
 * Warnings go so many days before (the date's own days, or the company's), on the day, and once it is missed, to the person responsible and the
 * work's leads, from a daily command. An open date that has passed becomes missed. Moving a date keeps where it was, who moved it and why.
 * Every key date is on the calendar of everyone on the work (source `project_key_date`).
 *
 * Reading needs only to open the work; adding, changing, moving and marking done need `projects.dates` and a project role that works on tasks.
 */
class ProjectKeyDates
{
    public const SOURCE = 'project_key_date';

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function list(object $project, User $user, bool $past = false): array
    {
        $this->needReady();
        $rows = DB::table('project_key_dates')->where('project_id', $project->id)->whereNull('deleted_at')
            ->when(! $past, fn ($q) => $q->where(fn ($w) => $w->where('state', 'open')->orWhere('starts_at', '>=', now()->subDays(30))))
            ->orderBy('starts_at')->get();
        $kinds = collect(app(ProjectLists::class)->of('key_date', false, $project->industry_key))->keyBy('key');
        $names = DB::table('users')->whereIn('id', $rows->pluck('responsible_id')->merge($rows->pluck('moved_by'))->filter()->unique()->all() ?: [0])->pluck('name', 'id');
        $tasks = DB::table('project_work_tasks')->whereIn('id', $rows->pluck('task_id')->filter()->all() ?: [0])->get(['id', 'number', 'title'])->keyBy('id');
        $manage = $this->access->decide($user, 'dates', $project)['allowed'];
        $today = now()->startOfDay();

        return [
            'ready' => true,
            'dates' => $rows->map(fn ($d) => [
                'id' => (int) $d->id, 'title' => $d->title, 'kind' => $d->kind, 'kind_name' => $kinds[$d->kind]['name'] ?? null,
                'starts_at' => $d->starts_at, 'all_day' => (bool) $d->all_day, 'state' => $d->state,
                'days' => (int) $today->diffInDays(Carbon::parse($d->starts_at)->startOfDay(), false),
                'responsible' => $d->responsible_id ? ['id' => (int) $d->responsible_id, 'name' => $names[$d->responsible_id] ?? null] : null,
                'phase_id' => $d->phase_id ? (int) $d->phase_id : null,
                'task' => $d->task_id && isset($tasks[$d->task_id]) ? ['id' => (int) $d->task_id, 'ref' => "{$project->number}-T{$tasks[$d->task_id]->number}", 'title' => $tasks[$d->task_id]->title] : null,
                'warn_days' => $d->warn_days, 'moved_from' => $d->moved_from, 'move_reason' => $d->move_reason, 'moved_by' => $d->moved_by ? ($names[$d->moved_by] ?? null) : null,
            ])->values()->all(),
            'kinds' => $kinds->filter(fn ($k) => $k['is_active'])->map(fn ($k) => ['key' => $k['key'], 'name' => $k['name']])->values()->all(),
            'people' => $manage ? $this->members($project) : [],
            'phases' => DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->get(['id', 'name'])->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->all(),
            'tasks' => $manage ? DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('number')->get(['id', 'number', 'title'])
                ->map(fn ($t) => ['id' => (int) $t->id, 'ref' => "{$project->number}-T{$t->number}", 'title' => $t->title])->all() : [],
            'warn_days' => app(ProjectSettings::class)->get('work')['warn_days'],
            'can' => ['manage' => $manage],
        ];
    }

    /** @param array<string, mixed> $d title, kind, date, time, responsible_id, phase_id, task_id, warn_days */
    public function create(object $project, array $d, User $by): int
    {
        $this->needReady();
        $this->access->authorize($by, 'dates', $project);
        $row = $this->fields($project, $d, null);
        $id = DB::table('project_key_dates')->insertGetId($row + ['project_id' => $project->id, 'state' => 'open', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'key_date.added', 'key_date', $id, null, ['title' => $row['title'], 'when' => $row['starts_at']]);
        $this->sync($id);

        return $id;
    }

    /** Change its details. Its day and time change only through move(), which asks why. */
    public function update(object $project, int $id, array $d, User $by): void
    {
        $k = $this->find($project, $id);
        $this->access->authorize($by, 'dates', $project);
        unset($d['date'], $d['time']);
        $row = $this->fields($project, $d, $k);
        if ($row) {
            DB::table('project_key_dates')->where('id', $k->id)->update($row + ['updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'key_date.changed', 'key_date', (int) $k->id, array_intersect_key((array) $k, $row), $row);
            $this->sync((int) $k->id);
        }
    }

    /** Move it to another day (or time). Keeps where it was and why; its warnings start again; a missed date moved ahead is open again. */
    public function move(object $project, int $id, array $d, User $by): void
    {
        $k = $this->find($project, $id);
        $this->access->authorize($by, 'dates', $project);
        $reason = trim((string) ($d['reason'] ?? ''));
        if ($reason === '') {
            throw new ProjectException('Say why the date moved.');
        }
        if ($k->state === 'done') {
            throw new ProjectException('This date is done. Add a new one instead.');
        }
        [$when, $allDay] = $this->when($d['date'] ?? null, $d['time'] ?? null);
        if ($when === Carbon::parse($k->starts_at)->format('Y-m-d H:i:s')) {
            return;
        }
        $row = ['starts_at' => $when, 'all_day' => $allDay, 'moved_from' => $k->starts_at, 'move_reason' => mb_substr($reason, 0, 200), 'moved_by' => $by->id, 'warned' => null,
            'state' => Carbon::parse($when)->endOfDay()->isPast() ? $k->state : 'open', 'updated_at' => now()];
        DB::table('project_key_dates')->where('id', $k->id)->update($row);
        ProjectLog::record((int) $project->id, $by, 'key_date.moved', 'key_date', (int) $k->id, ['when' => $k->starts_at], ['when' => $when], ProjectLog::DONE, $reason);
        $this->sync((int) $k->id);
    }

    public function done(object $project, int $id, bool $done, User $by): void
    {
        $k = $this->find($project, $id);
        $this->access->authorize($by, 'dates', $project);
        $state = $done ? 'done' : (Carbon::parse($k->starts_at)->endOfDay()->isPast() ? 'missed' : 'open');
        DB::table('project_key_dates')->where('id', $k->id)->update(['state' => $state, 'done_at' => $done ? now() : null, 'done_by' => $done ? $by->id : null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $done ? 'key_date.done' : 'key_date.reopened', 'key_date', (int) $k->id, ['state' => $k->state], ['state' => $state]);
        $this->sync((int) $k->id);
    }

    public function delete(object $project, int $id, User $by): void
    {
        $k = $this->find($project, $id);
        $this->access->authorize($by, 'dates', $project);
        DB::table('project_key_dates')->where('id', $k->id)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
        ProjectLog::record((int) $project->id, $by, 'key_date.deleted', 'key_date', (int) $k->id, ['title' => $k->title, 'when' => $k->starts_at], null);
        $this->sync((int) $k->id);
    }

    /**
     * The daily warnings (07:00). For each open date: a warning on each of its warning days and on the day, once each; a date whose day has passed
     * becomes missed, with one notice. To the person responsible and the work's leads. Frozen work and work in the trash are left out.
     * @return int notices sent (one per person per date)
     */
    public function warn(?Carbon $now = null): int
    {
        if (! ProjectsSetup::work()) {
            return 0;
        }
        $now ??= now();
        $today = $now->copy()->startOfDay();
        $default = app(ProjectSettings::class)->get('work')['warn_days'];
        $rows = DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->whereNull('k.deleted_at')->whereNull('p.deleted_at')->whereNull('p.frozen_at')
            ->where('k.state', 'open')->where('k.starts_at', '<=', $today->copy()->addDays(366))->get(['k.*', 'p.number as project_number', 'p.title as project_title']);
        $sent = 0;
        foreach ($rows as $k) {
            $days = (int) $today->diffInDays(Carbon::parse($k->starts_at)->startOfDay(), false);
            $warned = array_filter(explode(',', (string) $k->warned), fn ($v) => $v !== '');
            $marks = array_map('intval', array_filter(explode(',', (string) ($k->warn_days ?: $default))));
            $when = Carbon::parse($k->starts_at)->format($k->all_day ? 'j M Y' : 'j M Y, H:i');
            $mark = null;
            if ($days < 0) {
                DB::table('project_key_dates')->where('id', $k->id)->update(['state' => 'missed', 'updated_at' => now()]);
                ProjectLog::record((int) $k->project_id, null, 'key_date.missed', 'key_date', (int) $k->id, null, ['when' => $k->starts_at]);
                $this->sync((int) $k->id);
                $title = "Missed: {$k->title} on {$k->project_number}";
                $message = "{$k->title} was on {$when} and is not marked done.";
            } elseif ($days === 0 && ! in_array('0', $warned, true)) {
                $mark = '0';
                $title = "Today: {$k->title} on {$k->project_number}";
                $message = "{$k->title}, {$when}. {$k->project_number} {$k->project_title}.";
            } else {
                $due = array_filter($marks, fn ($m) => $m >= $days && ! in_array((string) $m, $warned, true));
                if (! $due || $days <= 0) {
                    continue;
                }
                $mark = (string) min($due);   // a run that missed some days sends one warning, not several
                $title = ($days === 1 ? 'Tomorrow' : "In {$days} days") . ": {$k->title} on {$k->project_number}";
                $message = "{$k->title}, {$when}. {$k->project_number} {$k->project_title}.";
            }
            if ($mark !== null) {
                $warned = array_unique(array_merge($warned, array_map('strval', array_filter($marks, fn ($m) => $m >= $days)), [$mark]));
                DB::table('project_key_dates')->where('id', $k->id)->update(['warned' => mb_substr(implode(',', $warned), 0, 60)]);
            }
            $people = $this->toWarn($k);
            ProjectNotices::tell($people, ProjectNotices::KEY_DATE, $title, $message, "/admin/projects/{$k->project_id}?tab=work&part=dates", 'Open the key dates');
            $sent += count($people);
        }

        return $sent;
    }

    /** Key dates on the calendar of everyone on the work, kept in step. */
    public function sync(int $id): void
    {
        if (! Schema::hasTable('calendar_entries')) {
            return;
        }
        try {
            $k = DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->where('k.id', $id)->first(['k.*', 'p.number as project_number', 'p.deleted_at as project_deleted']);
            $people = $k ? array_column($this->members((object) ['id' => $k->project_id]), 'id') : [];
            $q = DB::table('calendar_entries')->where('source_type', self::SOURCE)->where('source_id', $id);
            if (! $k || $k->deleted_at || $k->project_deleted) {
                $q->delete();

                return;
            }
            $q->whereNotIn('user_id', $people ?: [0])->delete();
            foreach ($people as $u) {
                app(CalendarService::class)->put($this->entry($k, $u));
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** For Core's refresh of one person's calendar. @return int[] the dates put */
    public function refreshFor(User $user, Carbon $from, Carbon $to): array
    {
        if (! ProjectsSetup::work() || ! Schema::hasTable('calendar_entries')) {
            return [];
        }
        $now = now();
        $rows = DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->join('project_members as m', 'm.project_id', '=', 'p.id')
            ->where('m.user_id', $user->id)->where('m.status', 'active')->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->whereNull('k.deleted_at')->whereNull('p.deleted_at')->whereBetween('k.starts_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])->distinct()->get(['k.*', 'p.number as project_number']);
        foreach ($rows as $k) {
            app(CalendarService::class)->put($this->entry($k, (int) $user->id));
        }

        return $rows->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    // ------------------------------------------------------------------ inside

    /** @return array<string, mixed> */
    private function entry(object $k, int $userId): array
    {
        $start = Carbon::parse($k->starts_at);

        return ['user_id' => $userId, 'source_type' => self::SOURCE, 'source_id' => (int) $k->id, 'kind' => 'key_date', 'title' => "{$k->project_number} · {$k->title}",
            'starts_at' => $k->all_day ? $start->copy()->startOfDay() : $start, 'ends_at' => $k->all_day ? null : $start->copy()->addHour(), 'all_day' => (bool) $k->all_day, 'status' => $k->state,
            'visibility' => 'team', 'url' => "/admin/projects/{$k->project_id}?tab=work&part=dates", 'meta' => ['kind' => $k->kind]];
    }

    /** @return \Illuminate\Support\Collection<int, User> the person responsible and the work's leads */
    private function toWarn(object $k)
    {
        $leads = DB::table('project_members as m')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')->where('m.project_id', $k->project_id)->where('m.status', 'active')
            ->where('r.key', 'lead')->pluck('m.user_id')->all();
        $lead = DB::table('projects')->where('id', $k->project_id)->value('lead_user_id');

        return User::whereIn('id', array_unique(array_filter(array_merge($leads, [$k->responsible_id, $lead]))))->get();
    }

    private function find(object $project, int $id): object
    {
        $this->needReady();

        return DB::table('project_key_dates')->where('id', $id)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
    }

    /** @return array{0: string, 1: int} when, and whether it is all day */
    private function when(mixed $date, mixed $time): array
    {
        if (! $date) {
            throw new ProjectException('Give the date.');
        }
        try {
            $day = Carbon::parse((string) $date)->startOfDay();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
        $time = trim((string) $time);
        if ($time === '') {
            return [$day->format('Y-m-d H:i:s'), 1];
        }
        if (! preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $time, $m)) {
            throw new ProjectException('Give the time as hours and minutes, like 09:30.');
        }

        return [$day->setTime((int) $m[1], (int) $m[2])->format('Y-m-d H:i:s'), 0];
    }

    /** @return array<string, mixed> */
    private function fields(object $project, array $d, ?object $k): array
    {
        $row = [];
        if ($k === null || array_key_exists('title', $d)) {
            $title = trim(preg_replace('/\s+/', ' ', (string) ($d['title'] ?? '')));
            if ($title === '') {
                throw new ProjectException('Say what the date is.');
            }
            $row['title'] = mb_substr($title, 0, 200);
        }
        if ($k === null) {
            [$row['starts_at'], $row['all_day']] = $this->when($d['date'] ?? null, $d['time'] ?? null);
        }
        if (array_key_exists('kind', $d)) {
            $kind = trim((string) $d['kind']) ?: null;
            if ($kind && ! collect(app(ProjectLists::class)->of('key_date', true, $project->industry_key))->contains('key', $kind)) {
                throw new ProjectException('Choose a kind of date from the list.');
            }
            $row['kind'] = $kind;
        }
        if (array_key_exists('responsible_id', $d)) {
            $who = $d['responsible_id'] ? (int) $d['responsible_id'] : null;
            if ($who && ! in_array($who, array_column($this->members($project), 'id'), true)) {
                throw new ProjectException('The person responsible must be on this work.');
            }
            $row['responsible_id'] = $who;
        }
        if (array_key_exists('phase_id', $d)) {
            $phase = $d['phase_id'] ? (int) $d['phase_id'] : null;
            if ($phase && ! DB::table('project_phases')->where('id', $phase)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("Choose one of this work's phases.");
            }
            $row['phase_id'] = $phase;
        }
        if (array_key_exists('task_id', $d)) {
            $task = $d['task_id'] ? (int) $d['task_id'] : null;
            if ($task && ! DB::table('project_work_tasks')->where('id', $task)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("Choose one of this work's tasks.");
            }
            $row['task_id'] = $task;
        }
        if (array_key_exists('warn_days', $d)) {
            $days = array_values(array_unique(array_filter(array_map('intval', explode(',', (string) $d['warn_days'])), fn ($v) => $v > 0 && $v <= 365)));
            rsort($days);
            $row['warn_days'] = $days ? implode(',', array_slice($days, 0, 6)) : null;
            $row['warned'] = null;
        }

        return $row;
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

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Key dates need database script 261. Run it first.', 409);
        }
    }
}
