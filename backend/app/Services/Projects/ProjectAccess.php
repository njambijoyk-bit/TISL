<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * May this person do this, on this project? Two questions, and both must say yes:
 *   1. Does their role in TISL hold the permission?            (the access catalogue: "may they do this kind of thing at all")
 *   2. Does their role ON THIS PROJECT allow it?               (project_members + project_role_permissions)
 * One exception, for reading only: someone who holds `projects.view_all` may open a project they are not on, unless it is confidential.
 * A confidential project exists only for the people on it: to everyone else it is "not found", whatever they hold.
 * A frozen project can be read and unfrozen, nothing else. Every refusal is written to the project log with its reason.
 */
class ProjectAccess
{
    /** what is asked => the permission the person's TISL role must hold */
    public const PERMISSION = [
        'open' => 'projects.use', 'edit' => 'projects.edit', 'stage' => 'projects.stage', 'close' => 'projects.close', 'freeze' => 'projects.freeze',
        'confidential' => 'projects.confidential', 'phases' => 'projects.phases', 'members' => 'projects.members.manage', 'members_view' => 'projects.members.view',
        'links' => 'projects.links', 'log' => 'projects.log.view', 'access' => 'projects.access.rules',
    ];

    /** what is asked => the ability their project role must have */
    public const ROLE_ABILITY = [
        'open' => 'open', 'edit' => 'edit', 'stage' => 'stage', 'close' => 'stage', 'freeze' => 'edit', 'confidential' => 'edit', 'phases' => 'phases',
        'members' => 'members', 'members_view' => 'open', 'links' => 'links', 'log' => 'log', 'access' => 'access',
    ];

    /** reading: what `projects.view_all` opens on a project the person is not on, and what stays possible on a frozen one */
    private const READING = ['open', 'members_view', 'log'];

    /** The abilities this person's project role gives them on a project (none when they are not on it now). @return string[] */
    public function roleAbilities(User $user, int $projectId): array
    {
        // asked afresh every time: who is on a project can change between two requests, and a stale answer here would be a door left open
        $now = now();

        return DB::table('project_members as m')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')
            ->join('project_role_permissions as p', 'p.project_role_id', '=', 'r.id')
            ->where('m.project_id', $projectId)->where('m.user_id', $user->id)->where('m.status', 'active')->where('r.is_active', 1)
            ->where(fn ($q) => $q->whereNull('m.starts_at')->orWhere('m.starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->pluck('p.ability')->all();
    }

    /**
     * @param object $project a row of `projects` (id, confidential, frozen_at, deleted_at)
     * @return array{allowed: bool, hidden: bool, reason: ?string}  hidden = they may not even know it exists
     */
    public function decide(User $user, string $ability, object $project, ?array $onIt = null): array
    {
        $onIt ??= $this->roleAbilities($user, (int) $project->id);
        $d = $this->base($user, $ability, $project, $onIt);
        // the third question (stage 2): is it inside the hours? Asked only of someone the first two let in, and never of setting the hours themselves
        if ($d['allowed'] && $ability !== 'access' && ProjectsSetup::controlRoom()) {
            $closed = app(ProjectHours::class)->closed($project, $user, in_array($ability, self::READING, true), $this->base($user, 'access', $project, $onIt)['allowed']);
            if ($closed) {
                return ['allowed' => false, 'hidden' => false, 'reason' => 'Outside hours', 'closed' => $closed];
            }
        }

        return $d;
    }

    /**
     * The first two questions only: the permission, and the project role. (What stage 2 adds on top is asked by decide().)
     *
     * @return array{allowed: bool, hidden: bool, reason: ?string}
     */
    public function base(User $user, string $ability, object $project, ?array $onIt = null): array
    {
        $permission = self::PERMISSION[$ability] ?? null;
        $needs = self::ROLE_ABILITY[$ability] ?? null;
        if (! $permission || ! $needs) {
            return ['allowed' => false, 'hidden' => false, 'reason' => "Unknown action {$ability}"];
        }
        $onIt ??= $this->roleAbilities($user, (int) $project->id);
        $mayRead = $user->hasPermission('projects.use') && (in_array('open', $onIt, true) || (! $project->confidential && $user->hasPermission('projects.view_all')));
        if (! $mayRead || $project->deleted_at !== null) {
            return ['allowed' => false, 'hidden' => true, 'reason' => $project->deleted_at !== null ? 'It is in the trash' : ($project->confidential ? 'Confidential, and not on it' : 'Not on it')];
        }
        if (! $user->hasPermission($permission)) {
            return ['allowed' => false, 'hidden' => false, 'reason' => "Does not hold {$permission}"];
        }
        $reading = in_array($ability, self::READING, true);
        if ($project->frozen_at !== null && ! $reading && $ability !== 'freeze') {
            return ['allowed' => false, 'hidden' => false, 'reason' => 'It is frozen'];
        }
        if (in_array($needs, $onIt, true) || ($reading && ! $project->confidential && $user->hasPermission('projects.view_all'))) {
            return ['allowed' => true, 'hidden' => false, 'reason' => null];
        }

        return ['allowed' => false, 'hidden' => false, 'reason' => $onIt ? 'Their role on it does not allow this' : 'Not on it'];
    }

    public function allows(User $user, string $ability, object $project): bool
    {
        return $this->decide($user, $ability, $project)['allowed'];
    }

    /** Stop here unless allowed. A project they may not see answers "not found", so its existence is not given away. */
    public function authorize(User $user, string $ability, object $project): void
    {
        $d = $this->decide($user, $ability, $project);
        if ($d['allowed']) {
            return;
        }
        ProjectLog::refused((int) $project->id, $user, 'project.' . $ability, (string) $d['reason'], 'project', (int) $project->id);
        if (isset($d['closed'])) {
            throw new ProjectException($d['closed']['message'], 403, ['closed' => $d['closed']]);
        }
        throw $d['hidden']
            ? new ProjectException('Not found.', 404)
            : new ProjectException($d['reason'] === 'It is frozen' ? 'This is frozen. Unfreeze it before changing anything.' : 'You may not do that here.', 403);
    }

    /** What the screen may offer on this project. @return array<string, bool> */
    public function abilities(User $user, object $project): array
    {
        $out = [];
        $onIt = $this->roleAbilities($user, (int) $project->id);   // looked up once for the whole list of answers
        foreach (array_keys(self::PERMISSION) as $ability) {
            $out[$ability] = $this->decide($user, $ability, $project, $onIt)['allowed'];
        }

        return $out;
    }

    /** Narrow a query on `projects` (aliased `p`) to what this person may see: the ones they are on, and with `projects.view_all` every one that is not confidential. */
    public function visible(Builder $q, User $user, bool $mineOnly = false): Builder
    {
        $now = now();
        $mine = fn ($w) => $w->whereExists(fn ($m) => $m->from('project_members as m')->join('project_role_permissions as rp', 'rp.project_role_id', '=', 'm.project_role_id')
            ->whereColumn('m.project_id', 'p.id')->where('m.user_id', $user->id)->where('m.status', 'active')->where('rp.ability', 'open')
            ->where(fn ($x) => $x->whereNull('m.starts_at')->orWhere('m.starts_at', '<=', $now))
            ->where(fn ($x) => $x->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now)));
        $q->whereNull('p.deleted_at');
        if ($mineOnly || ! $user->hasPermission('projects.view_all')) {
            return $q->where($mine);
        }

        return $q->where(fn ($w) => $w->where('p.confidential', 0)->orWhere($mine));
    }
}
