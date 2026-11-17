<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Weekly timesheets (docs/PROJECTS_STAGE5_SPEC.md, build 5.7). A week runs Monday to Sunday. Submitting the week locks its draft and sent-back
 * entries. Each entry is then approved or sent back by someone who may approve it, never by the person whose time it is:
 *  - setting "the leads of the work" (the default): `projects.time.approve` and a project role on that work that approves time (ability
 *    `approve_time`, the Lead out of the box);
 *  - setting "the person's manager": `projects.time.approve` and being their manager in HR (employees.manager_id).
 * Approved time is fixed. Reopening it (back to sent back) is a serious action, and time already billed cannot be reopened.
 */
class ProjectTimesheets
{
    public function __construct(private ProjectAccess $access) {}

    /** One person's week, as a grid of work and task by day, with what Attendance says. @return array<string, mixed> */
    public function week(User $viewer, ?string $start, ?int $userId = null): array
    {
        $this->needReady();
        $who = $this->whose($viewer, $userId);
        $from = $this->monday($start);
        $to = $from->copy()->addDays(6);
        $rows = DB::table('project_time as t')->join('projects as p', 'p.id', '=', 't.project_id')->leftJoin('project_work_tasks as k', 'k.id', '=', 't.task_id')
            ->where('t.user_id', $who->id)->whereNull('t.deleted_at')->whereBetween('t.work_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('p.number')->orderBy('k.number')->get(['t.*', 'p.number', 'p.title as project_title', 'k.number as task_number', 'k.title as task_title']);
        $days = [];
        for ($d = $from->copy(); $d <= $to; $d->addDay()) {
            $days[] = $d->toDateString();
        }
        $lines = $rows->groupBy(fn ($r) => $r->project_id . '|' . ($r->task_id ?? 0))->map(function (Collection $g) use ($days) {
            $f = $g->first();
            $by = array_fill_keys($days, 0);
            foreach ($g as $r) {
                $by[$r->work_date] += (int) $r->minutes;
            }

            return ['project_id' => (int) $f->project_id, 'project' => "{$f->number} {$f->project_title}", 'task' => $f->task_id ? "{$f->number}-T{$f->task_number} {$f->task_title}" : null,
                'days' => array_values($by), 'total' => (int) $g->sum('minutes'), 'states' => $g->pluck('state')->unique()->values()->all(),
                'entries' => $g->map(fn ($r) => ['id' => (int) $r->id, 'work_date' => $r->work_date, 'minutes' => (int) $r->minutes, 'state' => $r->state, 'billable' => (bool) $r->billable, 'note' => $r->note, 'return_note' => $r->return_note])->values()->all()];
        })->values();
        $attendance = Schema::hasTable('attendance_days') ? DB::table('attendance_days')->where('user_id', $who->id)->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->get()->keyBy('work_date') : collect();
        $counts = $rows->countBy('state');

        return [
            'ready' => true, 'person' => ['id' => (int) $who->id, 'name' => $who->name], 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days,
            'lines' => $lines->all(),
            'totals' => array_map(fn ($d) => (int) $rows->where('work_date', $d)->sum('minutes'), $days),
            'attendance' => array_map(fn ($d) => isset($attendance[$d]) ? ['status' => $attendance[$d]->status, 'minutes' => (int) $attendance[$d]->minutes_worked] : null, $days),
            'state' => $this->stateOf($counts->all()),
            'counts' => $counts->all(),
            'can' => ['submit' => (int) $who->id === (int) $viewer->id && (($counts['draft'] ?? 0) + ($counts['returned'] ?? 0)) > 0],
        ];
    }

    /** Submit a week: its draft and sent-back entries lock and go to whoever approves them, who are told. @return int entries submitted */
    public function submit(User $by, ?string $start): int
    {
        $this->needReady();
        $from = $this->monday($start);
        $ids = DB::table('project_time')->where('user_id', $by->id)->whereNull('deleted_at')->whereIn('state', ['draft', 'returned'])
            ->whereBetween('work_date', [$from->toDateString(), $from->copy()->addDays(6)->toDateString()])->pluck('id')->all();
        if (! $ids) {
            throw new ProjectException('Nothing in this week is waiting to be submitted.');
        }
        DB::table('project_time')->whereIn('id', $ids)->update(['state' => 'submitted', 'submitted_at' => now(), 'return_note' => null, 'updated_at' => now()]);
        foreach (DB::table('project_time')->whereIn('id', $ids)->distinct()->pluck('project_id') as $p) {
            ProjectLog::record((int) $p, $by, 'time.submitted', 'time', null, null, ['week' => $from->toDateString(), 'entries' => DB::table('project_time')->whereIn('id', $ids)->where('project_id', $p)->count()]);
        }
        $approvers = $this->approversFor(DB::table('project_time')->whereIn('id', $ids)->get());
        ProjectNotices::tell($approvers->reject(fn ($u) => (int) $u->id === (int) $by->id), ProjectNotices::TIMESHEET, "{$by->name} submitted their time",
            'Week of ' . $from->format('j M Y') . ': ' . count($ids) . ' ' . (count($ids) === 1 ? 'entry' : 'entries') . ' to approve.', '/admin/projects/timesheet?view=approve', 'Open approvals');

        return count($ids);
    }

    /** What waits for this person to approve. @return array<string, mixed> */
    public function toApprove(User $user): array
    {
        $this->needReady();
        $rows = $this->pending()->get(['t.*', 'u.name as person', 'p.number', 'p.title as project_title', 'p.confidential', 'p.frozen_at', 'p.deleted_at as project_deleted', 'p.lead_user_id', 'k.number as task_number', 'k.title as task_title'])
            ->filter(fn ($r) => $this->mayApprove($user, $r));

        return [
            'ready' => true,
            'people' => $rows->groupBy('user_id')->map(fn ($g) => ['user_id' => (int) $g->first()->user_id, 'person' => $g->first()->person, 'minutes' => (int) $g->sum('minutes'),
                'entries' => $g->map(fn ($r) => ['id' => (int) $r->id, 'work_date' => $r->work_date, 'minutes' => (int) $r->minutes, 'billable' => (bool) $r->billable, 'note' => $r->note,
                    'project' => "{$r->number} {$r->project_title}", 'task' => $r->task_id ? "{$r->number}-T{$r->task_number} {$r->task_title}" : null])->values()->all()])->values()->all(),
            'count' => $rows->count(),
            'approve_by' => app(ProjectSettings::class)->get('work')['approve_by'],
        ];
    }

    /** Approve entries. Each must be submitted and approvable by this person; any that is not stops them all. @param int[] $ids */
    public function approve(array $ids, User $by): int
    {
        $rows = $this->decidable($ids, $by);
        DB::table('project_time')->whereIn('id', $rows->pluck('id'))->update(['state' => 'approved', 'decided_by' => $by->id, 'decided_at' => now(), 'updated_at' => now()]);
        foreach ($rows->groupBy('project_id') as $p => $g) {
            ProjectLog::record((int) $p, $by, 'time.approved', 'time', null, null, ['entries' => $g->count(), 'minutes' => (int) $g->sum('minutes')]);
        }

        return $rows->count();
    }

    /** Send entries back with a note: they open again for the person to change and submit; they are told. @param int[] $ids */
    public function sendBack(array $ids, string $note, User $by): int
    {
        $note = trim($note);
        if ($note === '') {
            throw new ProjectException('Say what needs changing.');
        }
        $rows = $this->decidable($ids, $by);
        DB::table('project_time')->whereIn('id', $rows->pluck('id'))->update(['state' => 'returned', 'decided_by' => $by->id, 'decided_at' => now(), 'return_note' => mb_substr($note, 0, 300), 'updated_at' => now()]);
        foreach ($rows->groupBy('project_id') as $p => $g) {
            ProjectLog::record((int) $p, $by, 'time.returned', 'time', null, null, ['entries' => $g->count()], ProjectLog::DONE, $note);
        }
        foreach ($rows->groupBy('user_id') as $u => $g) {
            ProjectNotices::tell(User::find($u), ProjectNotices::TIMESHEET, "{$by->name} sent some of your time back", "{$g->count()} " . ($g->count() === 1 ? 'entry needs' : 'entries need') . " changing: {$note}",
                '/admin/projects/timesheet?week=' . $this->monday($g->min('work_date'))->toDateString(), 'Open your week');
        }

        return $rows->count();
    }

    /** Reopen approved time (back to sent back, for the person to change). The caller has asked the serious-action rules ("time.reopen"). */
    public function reopen(int $id, string $reason, User $by): void
    {
        $this->needReady();
        $e = DB::table('project_time as t')->join('projects as p', 'p.id', '=', 't.project_id')->where('t.id', $id)->whereNull('t.deleted_at')
            ->first(['t.*', 'p.confidential', 'p.frozen_at', 'p.deleted_at as project_deleted', 'p.lead_user_id']) ?? throw new ProjectException('Not found.', 404);
        if (! $this->mayApprove($by, $e)) {
            throw new ProjectException('Not found.', 404);
        }
        if ($e->state !== 'approved') {
            throw new ProjectException('Only approved time is reopened.');
        }
        if ($e->billed_voucher_id) {
            throw new ProjectException('This time is on a bill. Cancel the bill in Books first.');
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw new ProjectException('Say why it is reopened.');
        }
        DB::table('project_time')->where('id', $e->id)->update(['state' => 'returned', 'return_note' => mb_substr($reason, 0, 300), 'decided_by' => $by->id, 'decided_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $e->project_id, $by, 'time.reopened', 'time', (int) $e->id, ['state' => 'approved'], ['state' => 'returned'], ProjectLog::DONE, $reason);
    }

    /**
     * The Monday reminder (10:00): people with time last week still not submitted, and people with time waiting for them to approve.
     * @return int people told
     */
    public function remind(?Carbon $now = null): int
    {
        if (! ProjectsSetup::work()) {
            return 0;
        }
        $now ??= now();
        $told = 0;
        if (app(ProjectSettings::class)->get('work')['week_reminder']) {
            $last = $this->monday($now->toDateString())->subWeek();
            $late = DB::table('project_time')->whereNull('deleted_at')->whereIn('state', ['draft', 'returned'])->where('work_date', '<=', $last->copy()->addDays(6)->toDateString())
                ->groupBy('user_id')->selectRaw('user_id, COUNT(*) as n, MIN(work_date) as first')->get();
            foreach ($late as $l) {
                if ($u = User::find($l->user_id)) {
                    ProjectNotices::tell($u, ProjectNotices::TIMESHEET, 'Your time is not submitted', "{$l->n} " . ($l->n == 1 ? 'entry' : 'entries') . ' from ' . Carbon::parse($l->first)->format('j M') . ' still wait for you to submit them.',
                        '/admin/projects/timesheet?week=' . $this->monday($l->first)->toDateString(), 'Open your week');
                    $told++;
                }
            }
        }
        $waiting = [];
        foreach ($this->pending()->get(['t.*', 'p.confidential', 'p.frozen_at', 'p.deleted_at as project_deleted', 'p.lead_user_id']) as $r) {
            foreach ($this->approversFor(collect([$r])) as $a) {
                $waiting[$a->id] = ($waiting[$a->id] ?? 0) + 1;
            }
        }
        foreach ($waiting as $uid => $n) {
            ProjectNotices::tell(User::find($uid), ProjectNotices::TIMESHEET, 'Time waits for you to approve', "{$n} " . ($n === 1 ? 'entry is' : 'entries are') . ' waiting.', '/admin/projects/timesheet?view=approve', 'Open approvals');
            $told++;
        }

        return $told;
    }

    // ------------------------------------------------------------------ inside

    private function pending()
    {
        return DB::table('project_time as t')->join('users as u', 'u.id', '=', 't.user_id')->join('projects as p', 'p.id', '=', 't.project_id')->leftJoin('project_work_tasks as k', 'k.id', '=', 't.task_id')
            ->where('t.state', 'submitted')->whereNull('t.deleted_at')->whereNull('p.deleted_at')->orderBy('u.name')->orderBy('t.work_date');
    }

    /** May this person approve this entry? Never their own; then by the company's setting. */
    private function mayApprove(User $user, object $r): bool
    {
        if ((int) $r->user_id === (int) $user->id || ! $user->hasPermission('projects.time.approve') || ($r->project_deleted ?? null)) {
            return false;
        }
        if (app(ProjectSettings::class)->get('work')['approve_by'] === 'manager') {
            return $this->managerOf((int) $r->user_id) === (int) $user->id;
        }
        $project = (object) ['id' => $r->project_id, 'confidential' => $r->confidential, 'frozen_at' => null, 'deleted_at' => null];

        return $this->access->base($user, 'approve_time', $project)['allowed'];
    }

    /** @param Collection<int, object> $rows @return Collection<int, User> everyone who may approve any of these entries */
    private function approversFor(Collection $rows): Collection
    {
        $rows = $rows->map(fn ($r) => isset($r->confidential) ? $r : (object) ((array) $r + (array) DB::table('projects')->where('id', $r->project_id)->first(['confidential', 'lead_user_id']) + ['project_deleted' => null]));
        // only those who could: the managers of the people (manager setting), or the people on those pieces of work (leads setting)
        $ids = app(ProjectSettings::class)->get('work')['approve_by'] === 'manager'
            ? $rows->map(fn ($r) => $this->managerOf((int) $r->user_id))->filter()->unique()->all()
            : DB::table('project_members')->whereIn('project_id', $rows->pluck('project_id')->unique()->all() ?: [0])->where('status', 'active')->distinct()->pluck('user_id')->all();

        return User::whereIn('id', $ids ?: [0])->get()->filter(fn ($u) => $rows->contains(fn ($r) => $this->mayApprove($u, $r)))->values();
    }

    private function managerOf(int $userId): ?int
    {
        if (! Schema::hasTable('employees') || ! Schema::hasColumn('employees', 'manager_id')) {
            return null;
        }
        $mgr = DB::table('employees')->where('user_id', $userId)->value('manager_id');

        return $mgr ? (int) DB::table('employees')->where('id', $mgr)->value('user_id') : null;
    }

    /** @param int[] $ids @return Collection<int, object> */
    private function decidable(array $ids, User $by): Collection
    {
        $this->needReady();
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (! $ids) {
            throw new ProjectException('Choose the time to decide on.');
        }
        $rows = DB::table('project_time as t')->join('projects as p', 'p.id', '=', 't.project_id')->whereIn('t.id', $ids)->whereNull('t.deleted_at')
            ->get(['t.*', 'p.confidential', 'p.frozen_at', 'p.deleted_at as project_deleted', 'p.lead_user_id']);
        if ($rows->count() !== count($ids) || $rows->contains(fn ($r) => ! $this->mayApprove($by, $r))) {
            throw new ProjectException($rows->contains(fn ($r) => (int) $r->user_id === (int) $by->id) ? 'Someone else approves your own time.' : 'Some of that time is not yours to decide on.', 403);
        }
        if ($rows->contains(fn ($r) => $r->state !== 'submitted')) {
            throw new ProjectException('Only submitted time is approved or sent back.');
        }

        return $rows;
    }

    private function whose(User $viewer, ?int $userId): User
    {
        if (! $userId || $userId === (int) $viewer->id) {
            return $viewer;
        }
        if (! $viewer->hasPermission('projects.time.others') && $this->managerOf($userId) !== (int) $viewer->id) {
            throw new ProjectException('Not found.', 404);
        }

        return User::findOrFail($userId);
    }

    private function monday(?string $any): Carbon
    {
        try {
            $d = Carbon::parse($any ?: now()->toDateString());
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }

        return $d->startOfWeek(Carbon::MONDAY)->startOfDay();
    }

    /** @param array<string, int> $c */
    private function stateOf(array $c): string
    {
        $n = array_sum($c);

        return match (true) {
            $n === 0 => 'empty',
            ($c['returned'] ?? 0) > 0 => 'returned',
            ($c['draft'] ?? 0) === $n => 'open',
            ($c['approved'] ?? 0) === $n => 'approved',
            ($c['draft'] ?? 0) > 0 => 'partly',
            default => 'submitted',
        };
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Timesheets need database script 261. Run it first.', 409);
        }
    }
}
