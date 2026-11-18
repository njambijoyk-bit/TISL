<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * My Work (docs/PROJECTS_STAGE5_SPEC.md, build 5.10): each person's home in Projects. Their running timer; their open tasks (late, today, this
 * week, later); key dates coming up on the work they are on; their follow-ups (stage 3); this week's time with its state; and what waits for
 * them: time to approve, changes to decide on, approvals (stage 2). Everything comes from the services that own it, so the rules are theirs.
 */
class ProjectMyWork
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function for(User $user): array
    {
        if (! ProjectsSetup::work()) {
            return ['ready' => false];
        }
        $today = now()->toDateString();

        return [
            'ready' => true,
            'today' => $today,
            'me' => (int) $user->id,   // for the link to their own page (stage 8)
            'timer' => app(ProjectTime::class)->timer($user),
            'tasks' => $this->tasks($user, $today),
            'dates' => $this->dates($user),
            'follow_ups' => $this->followUps($user),
            'week' => $this->week($user),
            'waiting' => $this->waiting($user),
            'checklist' => app(ProjectChecklists::class)->mine($user),   // joining and leaving steps that are theirs to do (stage 8)
        ];
    }

    /** Open tasks given to this person, on work they may still open, grouped by when. @return array<string, array<int, array<string, mixed>>> */
    private function tasks(User $user, string $today): array
    {
        $rows = DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->where('tp.user_id', $user->id)->whereNull('t.deleted_at')->whereNull('p.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])
            ->orderByRaw('CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END')->orderBy('t.due_date')->limit(200)
            ->get(['t.id', 't.number', 't.title', 't.status', 't.priority', 't.due_date', 'p.id as project_id', 'p.number as project_number', 'p.title as project_title', 'p.confidential', 'p.frozen_at', 'p.deleted_at']);
        $week = Carbon::parse($today)->endOfWeek(Carbon::SUNDAY)->toDateString();
        $out = ['late' => [], 'today' => [], 'week' => [], 'later' => []];
        $words = [];
        foreach ($rows as $t) {
            if (! $this->access->base($user, 'open', (object) ['id' => $t->project_id, 'confidential' => $t->confidential, 'frozen_at' => $t->frozen_at, 'deleted_at' => $t->deleted_at])['allowed']) {
                continue;
            }
            $words[$t->project_id] ??= app(ProjectTasks::class)->statusNames(DB::table('projects')->where('id', $t->project_id)->first());
            $row = ['id' => (int) $t->id, 'ref' => "{$t->project_number}-T{$t->number}", 'title' => $t->title, 'status' => $t->status, 'status_name' => $words[$t->project_id][$t->status] ?? $t->status,
                'priority' => $t->priority, 'due_date' => $t->due_date, 'project_id' => (int) $t->project_id, 'project' => "{$t->project_number} {$t->project_title}"];
            $when = ! $t->due_date ? 'later' : ($t->due_date < $today ? 'late' : ($t->due_date === $today ? 'today' : ($t->due_date <= $week ? 'week' : 'later')));
            $out[$when][] = $row;
        }

        return $out;
    }

    /** Key dates in the next 30 days (and missed ones) on the work this person is on. @return array<int, array<string, mixed>> */
    private function dates(User $user): array
    {
        $now = now();
        $rows = DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->join('project_members as m', 'm.project_id', '=', 'p.id')
            ->where('m.user_id', $user->id)->where('m.status', 'active')->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->whereNull('k.deleted_at')->whereNull('p.deleted_at')->where(fn ($q) => $q->where('k.state', 'missed')->orWhere(fn ($w) => $w->where('k.state', 'open')->where('k.starts_at', '<=', $now->copy()->addDays(30))))
            ->orderBy('k.starts_at')->distinct()->limit(50)->get(['k.id', 'k.title', 'k.starts_at', 'k.all_day', 'k.state', 'k.responsible_id', 'p.id as project_id', 'p.number']);
        $today = $now->copy()->startOfDay();

        return $rows->map(fn ($k) => ['id' => (int) $k->id, 'title' => $k->title, 'starts_at' => $k->starts_at, 'all_day' => (bool) $k->all_day, 'state' => $k->state,
            'days' => (int) $today->diffInDays(Carbon::parse($k->starts_at)->startOfDay(), false), 'mine' => (int) $k->responsible_id === (int) $user->id,
            'project_id' => (int) $k->project_id, 'project' => $k->number])->values()->all();
    }

    /** The person's own follow-ups that are late or due today (stage 3). @return array<int, array<string, mixed>> */
    private function followUps(User $user): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $items = app(ProjectFollowUps::class)->page($user, 'mine')['items'] ?? [];

        return array_values(array_slice(array_filter($items, fn ($f) => ! empty($f['late']) || ! empty($f['today'])), 0, 20));
    }

    /** This week's time: how much, and whether it waits to be submitted. @return array<string, mixed> */
    private function week(User $user): array
    {
        $w = app(ProjectTimesheets::class)->week($user, null);

        return ['from' => $w['from'], 'to' => $w['to'], 'minutes' => array_sum($w['totals']), 'state' => $w['state'], 'can_submit' => $w['can']['submit']];
    }

    /** @return array<string, int> */
    private function waiting(User $user): array
    {
        $time = $user->hasPermission('projects.time.approve') ? app(ProjectTimesheets::class)->toApprove($user)['count'] : 0;
        $changes = 0;
        if ($user->hasPermission('projects.changes.approve')) {
            foreach (DB::table('project_changes as c')->join('projects as p', 'p.id', '=', 'c.project_id')->where('c.state', 'submitted')->where('c.raised_by', '!=', $user->id)->whereNull('p.deleted_at')->get(['p.*']) as $p) {
                $changes += $this->access->decide($user, 'changes_approve', $p)['allowed'] ? 1 : 0;
            }
        }
        $approvals = ProjectsSetup::controlRoom() && $user->hasPermission('projects.approve') ? count(app(ProjectApprovals::class)->page($user)['waiting'] ?? []) : 0;

        $messages = $user->hasPermission('projects.messages.internal') || $user->hasPermission('projects.messages.client') ? app(ProjectInbox::class)->count($user) : 0;

        return ['time' => $time, 'changes' => $changes, 'approvals' => $approvals, 'messages' => $messages];
    }
}
