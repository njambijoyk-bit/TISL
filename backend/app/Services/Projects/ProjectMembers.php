<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Who is on a project and in which project role. A person is invited and is on it once they accept; until then, and after they are removed
 * or their dates have passed, the project is closed to them. A project always has at least one Lead who is on it now.
 * Handing a project to another lead is a transfer: it needs its own permission and leaves a note in the log.
 */
class ProjectMembers
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<int, array<string, mixed>> */
    public function list(object $project): array
    {
        $now = now();

        return DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->leftJoin('project_roles as r', 'r.id', '=', 'm.project_role_id')
            ->leftJoin('users as i', 'i.id', '=', 'm.invited_by')->where('m.project_id', $project->id)->where('m.status', '!=', 'removed')
            ->orderBy('r.sort_order')->orderBy('u.name')
            ->get(['m.id', 'm.user_id', 'u.name', 'm.project_role_id', 'r.key as role_key', 'r.name as role_name', 'm.status', 'm.starts_at', 'm.ends_at', 'm.invited_at', 'i.name as invited_by'])
            ->map(fn ($m) => ['id' => (int) $m->id, 'user_id' => (int) $m->user_id, 'name' => $m->name, 'role' => ['id' => (int) $m->project_role_id, 'key' => $m->role_key, 'name' => $m->role_name],
                'status' => $m->status, 'starts_at' => $m->starts_at, 'ends_at' => $m->ends_at, 'invited_by' => $m->invited_by, 'invited_at' => $m->invited_at,
                'is_lead' => (int) $m->user_id === (int) $project->lead_user_id,
                // on it now: accepted, and inside the dates
                'on_it' => $m->status === 'active' && (! $m->starts_at || $m->starts_at <= $now) && (! $m->ends_at || $m->ends_at >= $now)])->all();
    }

    /** Invite someone. They are on the project once they accept. @param array<string, mixed> $d user_id, project_role_id, starts_at, ends_at */
    public function invite(object $project, array $d, User $by): int
    {
        $this->access->authorize($by, 'members', $project);
        $user = User::find((int) ($d['user_id'] ?? 0));
        if (! $user || ! $user->hasPermission('projects.use')) {
            throw new ProjectException('Choose someone who can open Projects.');
        }
        $role = $this->role($d['project_role_id'] ?? null);
        [$from, $until] = $this->dates($d);
        $existing = DB::table('project_members')->where('project_id', $project->id)->where('user_id', $user->id)->first();
        if ($existing && in_array($existing->status, ['active', 'invited'], true)) {
            throw new ProjectException($existing->status === 'active' ? 'They are already on it.' : 'They have already been invited.');
        }
        $own = (int) $user->id === (int) $by->id;   // putting yourself on needs no invitation to yourself
        $row = ['project_role_id' => $role->id, 'status' => $own ? 'active' : 'invited', 'invited_by' => $by->id, 'invited_at' => now(), 'answered_at' => $own ? now() : null,
            'starts_at' => $from, 'ends_at' => $until, 'updated_at' => now()];
        if ($existing) {
            DB::table('project_members')->where('id', $existing->id)->update($row);   // someone who left or declined is asked again on the same row
            $id = (int) $existing->id;
        } else {
            $id = DB::table('project_members')->insertGetId($row + ['project_id' => $project->id, 'user_id' => $user->id, 'created_at' => now()]);
        }
        ProjectLog::record((int) $project->id, $by, 'member.invited', 'member', $id, null, ['user' => $user->name, 'role' => $role->name, 'from' => $from, 'until' => $until]);

        return $id;
    }

    /** The person answers their own invitation. */
    public function answer(object $project, User $user, bool $accept): void
    {
        $m = DB::table('project_members')->where('project_id', $project->id)->where('user_id', $user->id)->where('status', 'invited')->first();
        if (! $m) {
            throw new ProjectException('There is no invitation to answer.', 404);
        }
        DB::table('project_members')->where('id', $m->id)->update(['status' => $accept ? 'active' : 'declined', 'answered_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $user, $accept ? 'member.accepted' : 'member.declined', 'member', (int) $m->id);
    }

    /** The invitations waiting for this person. @return array<int, array<string, mixed>> */
    public function invitationsFor(User $user): array
    {
        if (! ProjectsSetup::ready()) {
            return [];
        }

        return DB::table('project_members as m')->join('projects as p', 'p.id', '=', 'm.project_id')->leftJoin('project_roles as r', 'r.id', '=', 'm.project_role_id')->leftJoin('users as i', 'i.id', '=', 'm.invited_by')
            ->where('m.user_id', $user->id)->where('m.status', 'invited')->whereNull('p.deleted_at')->orderByDesc('m.invited_at')
            ->get(['p.id', 'p.number', 'p.title', 'p.confidential', 'r.name as role', 'i.name as invited_by', 'm.invited_at'])
            // a confidential project does not give its title away to someone who has not accepted yet
            ->map(fn ($x) => ['project_id' => (int) $x->id, 'number' => $x->number, 'title' => $x->confidential ? null : $x->title, 'confidential' => (bool) $x->confidential, 'role' => $x->role, 'invited_by' => $x->invited_by, 'invited_at' => $x->invited_at])->all();
    }

    /** Change someone's project role or dates. @param array<string, mixed> $d project_role_id, starts_at, ends_at */
    public function change(object $project, int $memberId, array $d, User $by): void
    {
        $this->access->authorize($by, 'members', $project);
        $m = $this->find($project, $memberId);
        $new = [];
        if (array_key_exists('project_role_id', $d)) {
            $new['project_role_id'] = (int) $this->role($d['project_role_id'])->id;
        }
        if (array_key_exists('starts_at', $d) || array_key_exists('ends_at', $d)) {
            [$new['starts_at'], $new['ends_at']] = $this->dates($d + ['starts_at' => $m->starts_at, 'ends_at' => $m->ends_at]);
        }
        $changed = array_filter($new, fn ($v, $k) => (string) ($m->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if (! $changed) {
            return;
        }
        DB::transaction(function () use ($project, $m, $changed) {
            DB::table('project_members')->where('id', $m->id)->update($changed + ['updated_at' => now()]);
            $this->assertStillLed($project);
        });
        ProjectLog::record((int) $project->id, $by, 'member.changed', 'member', (int) $m->id, array_intersect_key((array) $m, $changed), $changed);
    }

    /** Take someone off a project (or withdraw their invitation). */
    public function remove(object $project, int $memberId, User $by): void
    {
        $this->access->authorize($by, 'members', $project);
        $m = $this->find($project, $memberId);
        if ((int) $m->user_id === (int) $project->lead_user_id) {
            throw new ProjectException('This is the lead. Transfer it to someone else first.');
        }
        DB::transaction(function () use ($project, $m) {
            DB::table('project_members')->where('id', $m->id)->update(['status' => 'removed', 'updated_at' => now()]);
            $this->assertStillLed($project);
        });
        ProjectLog::record((int) $project->id, $by, 'member.removed', 'member', (int) $m->id, ['user_id' => (int) $m->user_id, 'status' => $m->status], null);
    }

    /**
     * Hand the project to another lead. Needs `projects.transfer`, and either being able to manage the people on it or, for a project that is not
     * confidential, being able to see every project (so one whose lead has left can be rescued). The old lead stays on it as a Member.
     */
    public function transfer(object $project, int $toUserId, ?string $note, User $by): void
    {
        $d = $this->access->decide($by, 'members', $project);
        $rescue = ! $d['allowed'] && ! $d['hidden'] && ! $project->confidential && $project->frozen_at === null && $by->hasPermission('projects.view_all');
        if (! $by->hasPermission('projects.transfer') || (! $d['allowed'] && ! $rescue)) {
            $reason = ! $by->hasPermission('projects.transfer') ? 'Does not hold projects.transfer' : (string) $d['reason'];
            ProjectLog::refused((int) $project->id, $by, 'project.transferred', $reason, 'project', (int) $project->id);
            throw $d['hidden'] ? new ProjectException('Not found.', 404) : new ProjectException('You may not transfer this.', 403);
        }
        $to = User::find($toUserId);
        if (! $to || ! $to->hasPermission('projects.use')) {
            throw new ProjectException('Choose someone who can open Projects.');
        }
        if ((int) $to->id === (int) $project->lead_user_id) {
            throw new ProjectException('They already lead it.');
        }
        $roles = DB::table('project_roles')->whereIn('key', ['lead', 'member'])->where('is_active', 1)->pluck('id', 'key');
        if (! isset($roles['lead'])) {
            throw new ProjectException('The Lead project role is missing or switched off. Put it back in Configuration first.');
        }
        $old = (int) $project->lead_user_id;
        DB::transaction(function () use ($project, $to, $roles, $old, $by) {
            $now = now();
            DB::table('project_members')->updateOrInsert(['project_id' => $project->id, 'user_id' => $to->id],
                ['project_role_id' => $roles['lead'], 'status' => 'active', 'invited_by' => $by->id, 'invited_at' => $now, 'answered_at' => $now, 'starts_at' => null, 'ends_at' => null, 'updated_at' => $now]);
            if (isset($roles['member'])) {
                DB::table('project_members')->where('project_id', $project->id)->where('user_id', $old)->where('status', 'active')->update(['project_role_id' => $roles['member'], 'updated_at' => $now]);
            }
            DB::table('projects')->where('id', $project->id)->update(['lead_user_id' => $to->id, 'updated_by' => $by->id, 'updated_at' => $now]);
        });
        ProjectLog::record((int) $project->id, $by, 'project.transferred', 'project', (int) $project->id, ['lead_user_id' => $old], ['lead_user_id' => (int) $to->id, 'lead' => $to->name] + ($note ? ['note' => mb_substr(trim(strip_tags($note)), 0, 200)] : []));
    }

    /** The staff who could be invited: they can open Projects and are not on it or invited already. @return array<int, array{id: int, name: string}> */
    public function candidates(object $project): array
    {
        $taken = DB::table('project_members')->where('project_id', $project->id)->whereIn('status', ['active', 'invited'])->pluck('user_id')->all();

        $team = app(ProjectTeam::class);   // each with their skills from HR, to find the right person (stage 8)

        return app(\App\Services\Notify\Staff::class)->holding('projects.use')->reject(fn ($u) => in_array($u->id, $taken))->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name, 'skills' => $team->hr((int) $u->id)['skills']])->sortBy('name')->values()->all();
    }

    // ------------------------------------------------------------------ inside

    private function find(object $project, int $id): object
    {
        $m = DB::table('project_members')->where('id', $id)->where('project_id', $project->id)->where('status', '!=', 'removed')->first();
        if (! $m) {
            throw new ProjectException('Not found.', 404);
        }

        return $m;
    }

    private function role(mixed $id): object
    {
        $r = DB::table('project_roles')->where('id', (int) $id)->where('is_active', 1)->first();
        if (! $r) {
            throw new ProjectException('Choose a project role that is switched on.');
        }

        return $r;
    }

    /** @param array<string, mixed> $d @return array{0: ?string, 1: ?string} */
    private function dates(array $d): array
    {
        $parse = function (mixed $v, bool $end): ?string {
            if ($v === null || $v === '') {
                return null;
            }
            try {
                $c = \Carbon\Carbon::parse((string) $v);
            } catch (\Throwable) {
                throw new ProjectException('That is not a date.');
            }

            // a day given without a time means the whole of that day
            return (strlen((string) $v) <= 10 ? ($end ? $c->endOfDay() : $c->startOfDay()) : $c)->format('Y-m-d H:i:s');
        };
        $from = $parse($d['starts_at'] ?? null, false);
        $until = $parse($d['ends_at'] ?? null, true);
        if ($from && $until && $until < $from) {
            throw new ProjectException('The end is before the start.');
        }

        return [$from, $until];
    }

    /** A project must always have someone on it now whose role lets them manage its people: otherwise nobody could ever fix it. */
    private function assertStillLed(object $project): void
    {
        $now = now();
        $led = DB::table('project_members as m')->join('project_role_permissions as p', 'p.project_role_id', '=', 'm.project_role_id')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')
            ->where('m.project_id', $project->id)->where('m.status', 'active')->where('r.is_active', 1)->where('p.ability', 'members')
            ->where(fn ($q) => $q->whereNull('m.starts_at')->orWhere('m.starts_at', '<=', $now))->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))->exists();
        if (! $led) {
            throw new ProjectException('That would leave nobody on it who can manage its people. Give someone else that role first.');
        }
    }
}
