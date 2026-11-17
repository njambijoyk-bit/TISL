<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Time (docs/PROJECTS_STAGE5_SPEC.md, build 5.6): time entries and the timer.
 *
 * An entry: a person, a piece of work, optionally a phase and a task, a day, minutes, billable or not (as the task says, else the company's
 * setting), and a note. Minutes are rounded up to the company's step (default 6, a tenth of an hour). Logging needs `projects.time.log` and a
 * project role that may log time (ability `time`); logging or changing someone else's time needs `projects.time.others` and a reason, logged.
 *
 * Checked against Attendance: time on a day beyond what Attendance says was worked, or on a day marked absent, on leave, off or a holiday, is
 * warned about, refused, or let through, as the company's setting says. Without Attendance nothing is checked.
 *
 * The timer: one running per person. Stopping it makes an entry. A timer left running stops itself at the company's cap and tells the person.
 * Entries are drafts until the week is submitted (build 5.7); a submitted or approved entry is not changed here.
 */
class ProjectTime
{
    private const OPEN = ['draft', 'returned'];

    private const NOT_WORKING = ['absent', 'leave', 'off', 'holiday'];

    public function __construct(private ProjectAccess $access) {}

    /**
     * Log time. @param array<string, mixed> $d project_id, task_id, phase_id, work_date, minutes | hours, billable, note, user_id (someone else), reason
     * @return array{id: int, warnings: string[]}
     */
    public function log(array $d, User $by, string $source = 'manual'): array
    {
        $this->needReady();
        $project = $this->project((int) ($d['project_id'] ?? 0), $by);
        $who = $this->whoFor($project, $d, $by);
        $date = $this->date($d['work_date'] ?? null);
        $minutes = $this->minutes($d);
        [$task, $phase] = $this->taskAndPhase($project, $d);
        $billable = array_key_exists('billable', $d) && $d['billable'] !== null && $d['billable'] !== '' ? (bool) $d['billable'] : $this->billableDefault($task);
        $warnings = $this->attendance($who, $date, $minutes, null);
        $id = DB::table('project_time')->insertGetId(['user_id' => $who->id, 'project_id' => $project->id, 'phase_id' => $phase, 'task_id' => $task?->id, 'work_date' => $date,
            'minutes' => $minutes, 'billable' => $billable ? 1 : 0, 'note' => $this->note($d['note'] ?? null), 'state' => 'draft', 'source' => $source,
            'entered_by' => $who->id === $by->id ? null : $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'time.logged', 'time', $id, null, ['who' => $who->name, 'date' => $date, 'minutes' => $minutes] + ($who->id === $by->id ? [] : ['for_someone_else' => true]),
            ProjectLog::DONE, $who->id === $by->id ? null : trim((string) ($d['reason'] ?? '')));

        return ['id' => $id, 'warnings' => $warnings];
    }

    /** Change an entry that is still a draft or was sent back. @return string[] warnings */
    public function update(int $id, array $d, User $by): array
    {
        $e = $this->entry($id);
        $project = $this->project((int) $e->project_id, $by);
        $this->needMayChange($project, $e, $by, $d['reason'] ?? null);
        $row = [];
        if (array_key_exists('work_date', $d)) {
            $row['work_date'] = $this->date($d['work_date']);
        }
        if (array_key_exists('minutes', $d) || array_key_exists('hours', $d)) {
            $row['minutes'] = $this->minutes($d);
        }
        if (array_key_exists('task_id', $d) || array_key_exists('phase_id', $d)) {
            [$task, $phase] = $this->taskAndPhase($project, $d + ['task_id' => $e->task_id, 'phase_id' => $e->phase_id]);
            $row += ['task_id' => $task?->id, 'phase_id' => $phase];
        }
        if (array_key_exists('billable', $d)) {
            $row['billable'] = $d['billable'] ? 1 : 0;
        }
        if (array_key_exists('note', $d)) {
            $row['note'] = $this->note($d['note']);
        }
        if (! $row) {
            return [];
        }
        $who = User::find($e->user_id);
        $warnings = $this->attendance($who, $row['work_date'] ?? $e->work_date, $row['minutes'] ?? (int) $e->minutes, (int) $e->id);
        DB::table('project_time')->where('id', $e->id)->update($row + ['updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'time.changed', 'time', (int) $e->id, array_intersect_key((array) $e, $row), $row, ProjectLog::DONE, (int) $e->user_id === (int) $by->id ? null : trim((string) ($d['reason'] ?? '')));

        return $warnings;
    }

    public function delete(int $id, User $by, ?string $reason = null): void
    {
        $e = $this->entry($id);
        $project = $this->project((int) $e->project_id, $by);
        $this->needMayChange($project, $e, $by, $reason);
        DB::table('project_time')->where('id', $e->id)->update(['deleted_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'time.deleted', 'time', (int) $e->id, ['date' => $e->work_date, 'minutes' => (int) $e->minutes], null, ProjectLog::DONE, (int) $e->user_id === (int) $by->id ? null : $reason);
    }

    /** Time on one piece of work: a person's own, or everyone's for those who approve time there or change other people's. @return array<string, mixed> */
    public function forProject(object $project, User $user): array
    {
        $this->needReady();
        $all = $this->access->decide($user, 'approve_time', $project)['allowed'] || $user->hasPermission('projects.time.others');
        $rows = DB::table('project_time as t')->join('users as u', 'u.id', '=', 't.user_id')->leftJoin('project_work_tasks as k', 'k.id', '=', 't.task_id')
            ->where('t.project_id', $project->id)->whereNull('t.deleted_at')->when(! $all, fn ($q) => $q->where('t.user_id', $user->id))
            ->orderByDesc('t.work_date')->orderByDesc('t.id')->limit(500)->get(['t.*', 'u.name as person', 'k.number as task_number', 'k.title as task_title']);

        return [
            'ready' => true,
            'entries' => $rows->map(fn ($r) => $this->shape($r, $project))->all(),
            'totals' => ['minutes' => (int) $rows->sum('minutes'), 'billable' => (int) $rows->where('billable', 1)->sum('minutes')],
            'everyone' => $all, 'me' => (int) $user->id,
            'tasks' => DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotIn('status', ['cancelled'])->orderBy('number')->get(['id', 'number', 'title'])
                ->map(fn ($t) => ['id' => (int) $t->id, 'ref' => "{$project->number}-T{$t->number}", 'title' => $t->title])->all(),
            'people' => $user->hasPermission('projects.time.others') ? $this->members($project) : [],
            'rounding' => (int) app(ProjectSettings::class)->get('work')['rounding'],
            'can' => ['log' => $this->access->decide($user, 'time', $project)['allowed'], 'others' => $user->hasPermission('projects.time.others')],
        ];
    }

    // ------------------------------------------------------------------ the timer

    /** The person's running timer, if any. @return array<string, mixed>|null */
    public function timer(User $user): ?array
    {
        if (! ProjectsSetup::work()) {
            return null;
        }
        $t = DB::table('project_timers as t')->join('projects as p', 'p.id', '=', 't.project_id')->leftJoin('project_work_tasks as k', 'k.id', '=', 't.task_id')
            ->where('t.user_id', $user->id)->first(['t.*', 'p.number', 'p.title as project_title', 'k.number as task_number', 'k.title as task_title']);

        return $t ? ['project_id' => (int) $t->project_id, 'project' => "{$t->number} {$t->project_title}", 'task_id' => $t->task_id ? (int) $t->task_id : null,
            'task' => $t->task_id ? "{$t->number}-T{$t->task_number} {$t->task_title}" : null, 'started_at' => Carbon::parse($t->started_at)->toIso8601String(),
            'seconds' => max(0, now()->getTimestamp() - Carbon::parse($t->started_at)->getTimestamp()), 'note' => $t->note,
            'cap_hours' => (int) app(ProjectSettings::class)->get('work')['timer_cap_hours']] : null;
    }

    /** Start a timer. A running one is stopped first, making its entry. @return array{stopped: ?array, timer: array} */
    public function start(array $d, User $by): array
    {
        $this->needReady();
        $project = $this->project((int) ($d['project_id'] ?? 0), $by);
        $this->access->authorize($by, 'time', $project);
        [$task] = $this->taskAndPhase($project, $d);
        $stopped = DB::table('project_timers')->where('user_id', $by->id)->exists() ? $this->stop($by) : null;
        DB::table('project_timers')->insert(['user_id' => $by->id, 'project_id' => $project->id, 'task_id' => $task?->id, 'started_at' => now(), 'note' => $this->note($d['note'] ?? null)]);

        return ['stopped' => $stopped, 'timer' => $this->timer($by)];
    }

    /** Stop the running timer: an entry for the time it ran, rounded up, never more than the cap. @return array{id: int, minutes: int, warnings: string[], capped: bool} */
    public function stop(User $by, ?string $note = null, ?Carbon $at = null): array
    {
        $t = DB::table('project_timers')->where('user_id', $by->id)->first() ?? throw new ProjectException('No timer is running.');
        $at ??= now();
        $cap = (int) app(ProjectSettings::class)->get('work')['timer_cap_hours'] * 60;
        $ran = max(1, (int) ceil(($at->getTimestamp() - Carbon::parse($t->started_at)->getTimestamp()) / 60));
        $capped = $ran > $cap;
        DB::table('project_timers')->where('user_id', $by->id)->delete();
        $r = $this->log(['project_id' => $t->project_id, 'task_id' => $t->task_id, 'work_date' => Carbon::parse($t->started_at)->toDateString(), 'minutes' => min($ran, $cap),
            'note' => trim((string) $note) !== '' ? $note : $t->note], $by, 'timer');

        return ['id' => $r['id'], 'minutes' => (int) DB::table('project_time')->where('id', $r['id'])->value('minutes'), 'warnings' => $r['warnings'], 'capped' => $capped];
    }

    /** Throw the running timer away without an entry. */
    public function discard(User $by): void
    {
        DB::table('project_timers')->where('user_id', $by->id)->delete();
    }

    /** The hourly sweep: timers running longer than the cap stop at the cap, and the person is told. @return int timers stopped */
    public function stopForgotten(): int
    {
        if (! ProjectsSetup::work()) {
            return 0;
        }
        $cap = (int) app(ProjectSettings::class)->get('work')['timer_cap_hours'];
        $n = 0;
        foreach (DB::table('project_timers')->where('started_at', '<=', now()->subHours($cap))->get() as $t) {
            $user = User::find($t->user_id);
            if (! $user) {
                DB::table('project_timers')->where('user_id', $t->user_id)->delete();
                continue;
            }
            try {
                $r = $this->stop($user, null, Carbon::parse($t->started_at)->addHours($cap));
                $p = DB::table('projects')->where('id', $t->project_id)->first(['id', 'number']);
                ProjectNotices::tell($user, ProjectNotices::TIMESHEET, 'Your timer was left running',
                    "It stopped itself after {$cap} hours on {$p->number}. Check the time it logged and change it if it is wrong.", "/admin/projects/{$p->id}?tab=work&part=time", 'Check the time');
                $n++;
            } catch (ProjectException) {
                DB::table('project_timers')->where('user_id', $t->user_id)->delete();   // they may no longer log time there: nothing to keep
            }
        }

        return $n;
    }

    // ------------------------------------------------------------------ inside

    /** Time beyond what Attendance says was worked that day, or on a day not worked. @return string[] warnings */
    private function attendance(User $who, string $date, int $minutes, ?int $exceptId): array
    {
        $mode = app(ProjectSettings::class)->get('work')['attendance_check'];
        if ($mode === 'off' || ! Schema::hasTable('attendance_days')) {
            return [];
        }
        $day = DB::table('attendance_days')->where('user_id', $who->id)->where('work_date', $date)->first();
        if (! $day) {
            return [];
        }
        $warnings = [];
        $nice = Carbon::parse($date)->format('D j M');
        if (in_array($day->status, self::NOT_WORKING, true)) {
            $warnings[] = "Attendance has {$who->name} as " . str_replace('_', ' ', $day->status) . " on {$nice}.";
        } else {
            $logged = (int) DB::table('project_time')->where('user_id', $who->id)->where('work_date', $date)->whereNull('deleted_at')->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))->sum('minutes');
            $worked = (int) $day->minutes_worked;
            if ($worked > 0 && $logged + $minutes > $worked) {
                $warnings[] = 'That makes ' . $this->hm($logged + $minutes) . " logged on {$nice}, more than the " . $this->hm($worked) . ' Attendance says was worked.';
            }
        }
        if ($warnings && $mode === 'refuse') {
            throw new ProjectException($warnings[0] . ' Correct Attendance, or the time.', 422, ['attendance' => $warnings]);
        }

        return $warnings;
    }

    private function project(int $id, User $by): object
    {
        return app(ProjectService::class)->findFor($by, $id);
    }

    /** Whose time: their own (needs to log time here), or someone else's (needs projects.time.others, a reason, and that person on the work). */
    private function whoFor(object $project, array $d, User $by): User
    {
        $for = ! empty($d['user_id']) ? (int) $d['user_id'] : (int) $by->id;
        if ($for === (int) $by->id) {
            $this->access->authorize($by, 'time', $project);

            return $by;
        }
        if (! $by->hasPermission('projects.time.others')) {
            ProjectLog::refused((int) $project->id, $by, 'time.logged', 'Does not hold projects.time.others', 'project', (int) $project->id);
            throw new ProjectException("Logging someone else's time needs its own permission.", 403);
        }
        if ($project->frozen_at !== null) {
            throw new ProjectException('This is frozen. Unfreeze it before changing anything.', 403);
        }
        if (trim((string) ($d['reason'] ?? '')) === '') {
            throw new ProjectException("Say why you are logging someone else's time.");
        }
        if (! in_array($for, array_column($this->members($project), 'id'), true)) {
            throw new ProjectException('Time can only be logged for people on this work.');
        }

        return User::findOrFail($for);
    }

    private function needMayChange(object $project, object $e, User $by, ?string $reason): void
    {
        if (! in_array($e->state, self::OPEN, true)) {
            throw new ProjectException($e->state === 'approved' ? 'This time is approved, so it is fixed.' : 'This time is submitted. It can be changed once it is sent back.');
        }
        if ($project->frozen_at !== null) {
            throw new ProjectException('This is frozen. Unfreeze it before changing anything.', 403);
        }
        if ((int) $e->user_id === (int) $by->id) {
            return;
        }
        if (! $by->hasPermission('projects.time.others')) {
            throw new ProjectException('Not found.', 404);
        }
        if (trim((string) $reason) === '') {
            throw new ProjectException("Say why you are changing someone else's time.");
        }
    }

    /** @return array{0: ?object, 1: ?int} the task, and the phase (the task's when it has one) */
    private function taskAndPhase(object $project, array $d): array
    {
        $task = null;
        if (! empty($d['task_id'])) {
            $task = DB::table('project_work_tasks')->where('id', (int) $d['task_id'])->where('project_id', $project->id)->whereNull('deleted_at')->first();
            if (! $task) {
                throw new ProjectException("Choose one of this work's tasks.");
            }
        }
        $phase = $task->phase_id ?? (! empty($d['phase_id']) ? (int) $d['phase_id'] : null);
        if ($phase && ! DB::table('project_phases')->where('id', $phase)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
            throw new ProjectException("Choose one of this work's phases.");
        }

        return [$task, $phase ? (int) $phase : null];
    }

    private function billableDefault(?object $task): bool
    {
        return $task && $task->billable !== null ? (bool) $task->billable : (bool) app(ProjectSettings::class)->get('work')['billable_default'];
    }

    /** Minutes, from minutes or hours, rounded up to the company's step. */
    private function minutes(array $d): int
    {
        $m = array_key_exists('minutes', $d) && $d['minutes'] !== null && $d['minutes'] !== '' ? (float) $d['minutes'] : (float) ($d['hours'] ?? 0) * 60;
        if ($m <= 0) {
            throw new ProjectException('Enter how long it took.');
        }
        if ($m > 24 * 60) {
            throw new ProjectException('A day has 24 hours. Split it over the days it took.');
        }
        $step = (int) app(ProjectSettings::class)->get('work')['rounding'];
        $m = (int) ceil($m - 0.0001);

        return $step > 1 ? (int) (ceil($m / $step) * $step) : $m;
    }

    private function date(mixed $v): string
    {
        try {
            $d = Carbon::parse((string) ($v ?: now()->toDateString()))->startOfDay();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
        if ($d->isAfter(now()->endOfDay())) {
            throw new ProjectException('Time is logged on the day it was worked, not ahead of it.');
        }

        return $d->toDateString();
    }

    private function note(mixed $v): ?string
    {
        $v = trim((string) $v);

        return $v === '' ? null : mb_substr($v, 0, 300);
    }

    private function entry(int $id): object
    {
        $this->needReady();

        return DB::table('project_time')->where('id', $id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
    }

    /** @return array<string, mixed> */
    private function shape(object $r, object $project): array
    {
        return ['id' => (int) $r->id, 'user_id' => (int) $r->user_id, 'person' => $r->person, 'work_date' => $r->work_date, 'minutes' => (int) $r->minutes, 'billable' => (bool) $r->billable,
            'note' => $r->note, 'state' => $r->state, 'source' => $r->source, 'task' => $r->task_id ? ['id' => (int) $r->task_id, 'ref' => "{$project->number}-T{$r->task_number}", 'title' => $r->task_title] : null,
            'entered_by_someone_else' => $r->entered_by !== null, 'written_off_minutes' => (int) $r->written_off_minutes, 'billed' => $r->billed_voucher_id !== null];
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

    private function hm(int $m): string
    {
        return intdiv($m, 60) . 'h' . ($m % 60 ? ' ' . ($m % 60) . 'm' : '');
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Time needs database script 261. Run it first.', 409);
        }
    }
}
