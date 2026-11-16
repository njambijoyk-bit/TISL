<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\DB;

/**
 * Who can get into a project, and why (docs/PROJECTS_STAGE2_SPEC.md, build 2.1). One row per person with a place on it, in the same words the
 * access check uses to decide; then the people who are not on it: those who get in anyway because they see every project, or, for a
 * confidential one, those it is hidden from.
 */
class ProjectAccessList
{
    /** state => how it is shown (one of the theme's named statuses) */
    public const STATES = [
        'in' => 'good', 'invited' => 'info', 'not_started' => 'info', 'outside_hours' => 'info', 'ended' => 'problem', 'no_permission' => 'problem', 'role_off' => 'problem', 'paused' => 'problem',
    ];

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function for(object $project, User $viewer): array
    {
        $now = now();
        $warnDays = (int) app(ProjectSettings::class)->get('access')['warn_days'];
        $rows = DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->leftJoin('project_roles as r', 'r.id', '=', 'm.project_role_id')
            ->where('m.project_id', $project->id)->whereIn('m.status', ['active', 'invited'])->orderBy('r.sort_order')->orderBy('u.name')
            ->get(['m.id', 'm.user_id', 'u.name', 'm.status', 'm.starts_at', 'm.ends_at', 'm.project_role_id', 'r.name as role_name', 'r.is_active as role_on']);
        $users = User::whereIn('id', $rows->pluck('user_id'))->get()->keyBy('id');
        $abilities = DB::table('project_role_permissions')->whereIn('project_role_id', $rows->pluck('project_role_id')->unique())->get()->groupBy('project_role_id');
        $extra = app(ProjectHours::class);

        $people = [];
        $soon = 0;
        foreach ($rows as $m) {
            $user = $users[$m->user_id] ?? null;
            if (! $user) {
                continue;
            }
            $can = array_values(array_intersect(array_keys(ProjectRoles::ABILITIES), ($abilities[$m->project_role_id] ?? collect())->pluck('ability')->all()));
            [$state, $words] = $this->state($project, $m, $user, $now, $extra);
            $days = $m->ends_at && $m->ends_at >= $now ? (int) floor($now->diffInDays(\Carbon\Carbon::parse($m->ends_at), false)) : null;
            $endingSoon = $state !== 'ended' && $days !== null && $warnDays > 0 && $days <= $warnDays;
            $soon += $endingSoon ? 1 : 0;
            $people[] = ['member_id' => (int) $m->id, 'user_id' => (int) $m->user_id, 'name' => $m->name, 'is_lead' => (int) $m->user_id === (int) $project->lead_user_id,
                'reason' => $this->reason($m, $state), 'role' => $m->role_name, // what the role gives; nothing while the place has ended or their TISL role or project role no longer lets them in
                'can' => in_array($state, ['ended', 'no_permission', 'role_off'], true) ? [] : array_map(fn ($a) => ProjectRoles::ABILITIES[$a], $can),
                'hours' => $extra->wordsFor((int) $project->id, (int) $m->id), 'starts_at' => $m->starts_at, 'ends_at' => $m->ends_at, 'ends_in_days' => $days, 'ending_soon' => $endingSoon,
                'state' => $state, 'state_words' => $words, 'status' => self::STATES[$state]];
        }

        // not on it: with "see every project" they read an open one; a confidential one is hidden from them
        $onIt = collect($people)->where('state', 'in')->pluck('user_id')->all();
        $others = app(Staff::class)->holding('projects.view_all')->filter(fn ($u) => ! in_array((int) $u->id, $onIt, true) && $u->hasPermission('projects.use'))
            ->map(fn ($u) => ['user_id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all();

        return [
            'people' => $people,
            'others' => ['kind' => $project->confidential ? 'kept_out' : 'gets_in', 'people' => $others],
            'project_hours' => $extra->wordsFor((int) $project->id, 0),
            'summary' => ['ending_soon' => $soon, 'warn_days' => $warnDays],
            'can' => ['access' => $this->access->allows($viewer, 'access', $project)],
        ];
    }

    /** Move someone's end date (null = no end). Needs `projects.access.rules` and a project role that sets access. */
    public function extend(object $project, int $memberId, mixed $until, User $by): void
    {
        $this->access->authorize($by, 'access', $project);
        $m = DB::table('project_members')->where('project_id', $project->id)->where('id', $memberId)->where('status', 'active')->first();
        if (! $m) {
            throw new ProjectException('That person is not on it.', 404);
        }
        $new = null;
        if ($until !== null && $until !== '') {
            try {
                $c = \Carbon\Carbon::parse((string) $until);
            } catch (\Throwable) {
                throw new ProjectException('That is not a date.');
            }
            $new = (strlen((string) $until) <= 10 ? $c->endOfDay() : $c)->format('Y-m-d H:i:s');
            if ($new < now()->format('Y-m-d H:i:s')) {
                throw new ProjectException('Choose a date that has not passed.');
            }
            if ($m->starts_at && $new < $m->starts_at) {
                throw new ProjectException('The end is before the start.');
            }
        }
        if ((string) $m->ends_at === (string) $new) {
            return;
        }
        DB::table('project_members')->where('id', $m->id)->update(['ends_at' => $new, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'member.extended', 'member', (int) $m->id, ['ends_at' => $m->ends_at], ['ends_at' => $new]);
    }

    /**
     * Tell each lead, once, about the people on their project whose place ends within the warning days. Run daily.
     *
     * @return int how many warnings went out
     */
    public function warnOfEndings(): int
    {
        $days = (int) app(ProjectSettings::class)->get('access')['warn_days'];
        if (! ProjectsSetup::ready() || $days < 1) {
            return 0;
        }
        $rows = DB::table('project_members as m')->join('projects as p', 'p.id', '=', 'm.project_id')->join('users as u', 'u.id', '=', 'm.user_id')
            ->where('m.status', 'active')->whereNull('p.deleted_at')->whereIn('p.state', ['open', 'on_hold'])->whereNotNull('p.lead_user_id')
            ->whereBetween('m.ends_at', [now(), now()->addDays($days)])
            ->get(['m.id', 'm.project_id', 'm.ends_at', 'u.name', 'p.number', 'p.title', 'p.lead_user_id', 'm.user_id']);
        $sent = 0;
        foreach ($rows as $r) {
            // told once per end date: moving the date makes it a new warning
            $told = DB::table('project_log')->where('project_id', $r->project_id)->where('action', 'member.ending_told')->where('subject_id', $r->id)->where('reason', $r->ends_at)->exists();
            $lead = $told ? null : User::find($r->lead_user_id);
            if (! $lead || (int) $r->user_id === (int) $lead->id) {
                continue;
            }
            $when = \Carbon\Carbon::parse($r->ends_at)->format('j M Y');
            ProjectNotices::tell($lead, ProjectNotices::ACCESS, "{$r->name}'s access to {$r->number} ends on {$when}",
                "{$r->name} is on {$r->number} ({$r->title}) until {$when}. After that they can no longer open it. If they are still needed, extend their date on its Access tab.",
                "/admin/projects/{$r->project_id}?tab=access", 'Open its Access tab');
            ProjectLog::record((int) $r->project_id, null, 'member.ending_told', 'member', (int) $r->id, null, ['told' => $lead->name], ProjectLog::DONE, (string) $r->ends_at);
            $sent++;
        }

        return $sent;
    }

    /** @return array{0: string, 1: string} the state and how it reads */
    private function state(object $project, object $m, User $user, \DateTimeInterface $now, ProjectHours $hours): array
    {
        $day = fn ($v) => \Carbon\Carbon::parse($v)->format('j M Y');

        return match (true) {
            $m->status === 'invited' => ['invited', 'Invited, has not answered'],
            $m->ends_at !== null && $m->ends_at < $now->format('Y-m-d H:i:s') => ['ended', 'Ended ' . $day($m->ends_at)],
            $m->starts_at !== null && $m->starts_at > $now->format('Y-m-d H:i:s') => ['not_started', 'Starts ' . $day($m->starts_at)],
            ! $user->hasPermission('projects.use') => ['no_permission', 'Their TISL role no longer opens Projects'],
            ! $m->role_on => ['role_off', 'Their project role is switched off'],
            ($held = $hours->heldWords($project, $m, $user)) !== null => $held,
            default => ['in', 'Can get in'],
        };
    }

    private function reason(object $m, string $state): string
    {
        $role = $m->role_name ?: 'a role that no longer exists';

        return match ($state) {
            'invited' => "Invited as {$role}",
            'ended' => "Was on it as {$role}",
            'not_started' => "Will be on it as {$role}",
            default => "On it as {$role}",
        };
    }
}
