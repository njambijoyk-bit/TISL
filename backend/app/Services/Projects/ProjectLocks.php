<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Locked areas (docs/PROJECTS_STAGE2_SPEC.md, build 2.3): a part of a project behind its own password, on top of everything else. Being on
 * the project is not enough, and nobody is exempt, not even the lead. One password per area per project, shared by the people meant to
 * have it; stored hashed and never readable. A right password opens the area for that person for a few minutes. Wrong tries in a row are
 * counted, and too many means a wait. A forgotten password is reset only when a second person agrees (ProjectApprovals).
 */
class ProjectLocks
{
    /** area => [what it is called, the abilities it stands in front of]. Later stages add theirs (money, files, notes, messages). */
    public const AREAS = [
        'people' => ['People and access', ['members', 'members_view']],
        'phases' => ['Phases', ['phases']],
        'links' => ['Links', ['links']],
        'activity' => ['Activity', ['log']],
        'sensitive_fields' => ['Sensitive fields', []],
    ];

    public static function areaOf(string $ability): ?string
    {
        foreach (self::AREAS as $area => [, $abilities]) {
            if (in_array($ability, $abilities, true)) {
                return $area;
            }
        }

        return null;
    }

    /** @return array<string, array{label: string, locked: bool, open: bool, until: ?string}> every area, for the screen */
    public function stateFor(object $project, User $user): array
    {
        $locks = ProjectsSetup::controlRoom() ? DB::table('project_locks')->where('project_id', $project->id)->get()->keyBy('area') : collect();
        $mine = $locks->isEmpty() ? collect() : DB::table('project_unlocks')->whereIn('lock_id', $locks->pluck('id'))->where('user_id', $user->id)->get()->keyBy('lock_id');
        $now = now()->format('Y-m-d H:i:s');
        $out = [];
        foreach (self::AREAS as $area => [$label]) {
            $lock = $locks[$area] ?? null;
            $until = $lock ? ($mine[$lock->id]->unlocked_until ?? null) : null;
            $out[$area] = ['label' => $label, 'locked' => (bool) $lock, 'open' => ! $lock || ($until !== null && $until > $now), 'until' => $until !== null && $until > $now ? $until : null];
        }

        return $out;
    }

    public function isOpen(object $project, string $area, User $user): bool
    {
        if (! ProjectsSetup::controlRoom()) {
            return true;
        }
        $lock = DB::table('project_locks')->where('project_id', $project->id)->where('area', $area)->first();

        return ! $lock || DB::table('project_unlocks')->where('lock_id', $lock->id)->where('user_id', $user->id)->where('unlocked_until', '>', now())->exists();
    }

    /** Stop here unless the area is open to this person. The screen gets 423 and which area it is. */
    public function need(object $project, string $area, User $user): void
    {
        if (! $this->isOpen($project, $area, $user)) {
            ProjectLog::refused((int) $project->id, $user, 'lock.' . $area, 'Locked, and not unlocked');
            throw new ProjectException(self::AREAS[$area][0] . ' is locked here. Enter its password to open it.', 423, ['locked' => ['area' => $area, 'label' => self::AREAS[$area][0]]]);
        }
    }

    /** Try a password. Right: the area is open to this person for a few minutes. Wrong: counted, and too many in a row means a wait. */
    public function open(object $project, string $area, string $password, User $user): string
    {
        $lock = $this->lock($project, $area);
        $s = app(ProjectSettings::class)->get('access');
        $row = DB::table('project_unlocks')->where('lock_id', $lock->id)->where('user_id', $user->id)->first();
        if ($row && $row->blocked_until !== null && $row->blocked_until > now()->format('Y-m-d H:i:s')) {
            $wait = max(1, (int) ceil(now()->diffInSeconds(\Carbon\Carbon::parse($row->blocked_until), false) / 60));
            throw new ProjectException("Too many wrong tries. Wait {$wait} " . ($wait === 1 ? 'minute' : 'minutes') . ' and try again.', 429, ['locked' => ['area' => $area, 'blocked_until' => $row->blocked_until]]);
        }
        if (! Hash::check($password, $lock->password_hash)) {
            $tries = ($row && $row->blocked_until === null ? (int) $row->wrong_tries : 0) + 1;
            $blocked = $tries >= (int) $s['lock_tries'];
            DB::table('project_unlocks')->updateOrInsert(['lock_id' => $lock->id, 'user_id' => $user->id],
                ['wrong_tries' => $blocked ? 0 : $tries, 'blocked_until' => $blocked ? now()->addMinutes((int) $s['lock_wait_minutes']) : null, 'unlocked_until' => null, 'last_try_at' => now()]);
            ProjectLog::refused((int) $project->id, $user, 'lock.try', 'Wrong password for ' . self::AREAS[$area][0], 'lock', (int) $lock->id);
            if ($blocked) {
                ProjectLog::refused((int) $project->id, $user, 'lock.blocked', "{$s['lock_tries']} wrong passwords in a row for " . self::AREAS[$area][0], 'lock', (int) $lock->id);
                ProjectNotices::tell(app(ProjectHours::class)->keyHolders($project)->reject(fn ($u) => (int) $u->id === (int) $user->id), ProjectNotices::SECURITY,
                    "{$user->name} entered a wrong password {$s['lock_tries']} times on {$project->number}",
                    "{$user->name} tried {$s['lock_tries']} wrong passwords in a row for " . self::AREAS[$area][0] . " on {$project->number} ({$project->title}). They must wait {$s['lock_wait_minutes']} minutes before trying again.",
                    "/admin/projects/{$project->id}?tab=access", 'Open its Access tab');
                app(ProjectSecurity::class)->noteLockBlocked($project, $user, $area);
                throw new ProjectException("That is not the password. That was {$s['lock_tries']} wrong tries: wait {$s['lock_wait_minutes']} minutes before trying again.", 429, ['locked' => ['area' => $area]]);
            }
            $left = (int) $s['lock_tries'] - $tries;
            throw new ProjectException("That is not the password. {$left} " . ($left === 1 ? 'try' : 'tries') . ' left before a wait.', 422, ['locked' => ['area' => $area, 'tries_left' => $left]]);
        }
        $until = now()->addMinutes((int) $s['unlock_minutes'])->format('Y-m-d H:i:s');
        DB::table('project_unlocks')->updateOrInsert(['lock_id' => $lock->id, 'user_id' => $user->id], ['wrong_tries' => 0, 'blocked_until' => null, 'unlocked_until' => $until, 'last_try_at' => now()]);
        ProjectLog::record((int) $project->id, $user, 'lock.opened', 'lock', (int) $lock->id, null, ['area' => self::AREAS[$area][0], 'until' => $until]);

        return $until;
    }

    /** Close it again for me now, without waiting for the minutes to run out. */
    public function close(object $project, string $area, User $user): void
    {
        $lock = $this->lock($project, $area);
        DB::table('project_unlocks')->where('lock_id', $lock->id)->where('user_id', $user->id)->update(['unlocked_until' => null]);
    }

    /** Put a lock on an area, or change its password (which needs the current one). */
    public function set(object $project, string $area, string $password, ?string $current, User $by): void
    {
        $this->needControlRoom();
        $this->area($area);
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $this->strong($password);
        $lock = DB::table('project_locks')->where('project_id', $project->id)->where('area', $area)->first();
        if ($lock && ! Hash::check((string) $current, $lock->password_hash)) {
            ProjectLog::refused((int) $project->id, $by, 'lock.change', 'Wrong current password for ' . self::AREAS[$area][0], 'lock', (int) $lock->id);
            throw new ProjectException('That is not the current password. If it is lost, ask for a reset.');
        }
        $this->store($project, $area, $password, $by, $lock);
        ProjectLog::record((int) $project->id, $by, $lock ? 'lock.changed' : 'lock.set', 'lock', null, null, ['area' => self::AREAS[$area][0]]);
    }

    /** Take a lock off. Needs its password: someone who does not have it asks for a reset instead. */
    public function remove(object $project, string $area, string $password, User $by): void
    {
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $lock = $this->lock($project, $area);
        if (! Hash::check($password, $lock->password_hash)) {
            ProjectLog::refused((int) $project->id, $by, 'lock.remove', 'Wrong password for ' . self::AREAS[$area][0], 'lock', (int) $lock->id);
            throw new ProjectException('That is not the password. If it is lost, ask for a reset.');
        }
        DB::transaction(function () use ($lock) {
            DB::table('project_unlocks')->where('lock_id', $lock->id)->delete();
            DB::table('project_locks')->where('id', $lock->id)->delete();
        });
        ProjectLog::record((int) $project->id, $by, 'lock.removed', 'lock', (int) $lock->id, ['area' => self::AREAS[$area][0]], null);
    }

    /** The password is lost: ask for a reset. Nothing changes until someone else, who holds `projects.locks.reset`, agrees. */
    public function askReset(object $project, string $area, ?string $reason, User $by): int
    {
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $lock = $this->lock($project, $area);
        if (trim((string) $reason) === '') {
            throw new ProjectException('Say why the password needs resetting.');
        }

        return app(ProjectApprovals::class)->ask('lock_reset', 'lock.reset', $project, 'lock', (int) $lock->id,
            'Reset the password of ' . self::AREAS[$area][0] . " on {$project->number} ({$project->title})", ['area' => $area, 'lock_id' => (int) $lock->id], $reason, $by);
    }

    /** After a reset was approved: the person who asked sets the new password. Everyone's open unlocks end. */
    public function finishReset(object $project, string $area, string $password, User $by): void
    {
        app(ProjectAccess::class)->authorize($by, 'access', $project);
        $lock = $this->lock($project, $area);
        $this->strong($password);
        $approvals = app(ProjectApprovals::class);
        $approval = $approvals->approvedFor('lock.reset', $project, ['area' => $area, 'lock_id' => (int) $lock->id], $by);
        if (! $approval) {
            throw new ProjectException('A reset has not been approved for you. Ask for one first.', 403);
        }
        DB::transaction(function () use ($project, $area, $password, $by, $lock, $approvals, $approval) {
            $this->store($project, $area, $password, $by, $lock);
            $approvals->markUsed((int) $approval->id);
        });
        ProjectLog::record((int) $project->id, $by, 'lock.reset', 'lock', (int) $lock->id, null,
            ['area' => self::AREAS[$area][0], 'approved_by' => DB::table('users')->where('id', $approval->answered_by)->value('name')]);
    }

    /** For the Access tab: every area, whether it is locked, who set the password and when, and a reset in progress. @return array<int, array<string, mixed>> */
    public function listFor(object $project, User $viewer): array
    {
        $locks = ProjectsSetup::controlRoom() ? DB::table('project_locks as l')->leftJoin('users as u', 'u.id', '=', 'l.set_by')->where('l.project_id', $project->id)->get(['l.*', 'u.name as set_by_name'])->keyBy('area') : collect();
        $resets = $locks->isEmpty() ? collect() : DB::table('project_approvals')->where('project_id', $project->id)->where('action', 'lock.reset')->whereIn('status', ['waiting', 'approved'])->where('expires_at', '>', now())->get();
        $out = [];
        foreach (self::AREAS as $area => [$label]) {
            $lock = $locks[$area] ?? null;
            $reset = $lock ? $resets->first(fn ($r) => (int) $r->subject_id === (int) $lock->id) : null;
            $out[] = ['area' => $area, 'label' => $label, 'locked' => (bool) $lock, 'set_by' => $lock->set_by_name ?? null, 'set_at' => $lock->set_at ?? null,
                'reset' => $reset ? ['status' => $reset->status, 'mine' => (int) $reset->asked_by === (int) $viewer->id, 'asked_by' => DB::table('users')->where('id', $reset->asked_by)->value('name')] : null];
        }

        return $out;
    }

    // ------------------------------------------------------------------ inside

    private function store(object $project, string $area, string $password, User $by, ?object $lock): void
    {
        $values = ['password_hash' => Hash::make($password), 'set_by' => $by->id, 'set_at' => now()];
        if ($lock) {
            DB::table('project_locks')->where('id', $lock->id)->update($values);
            DB::table('project_unlocks')->where('lock_id', $lock->id)->delete();   // a new password closes it for everyone who had it open
        } else {
            DB::table('project_locks')->insert($values + ['project_id' => $project->id, 'area' => $area, 'created_at' => now()]);
        }
    }

    private function lock(object $project, string $area): object
    {
        $this->needControlRoom();
        $this->area($area);
        $lock = DB::table('project_locks')->where('project_id', $project->id)->where('area', $area)->first();
        if (! $lock) {
            throw new ProjectException('That area is not locked.', 404);
        }

        return $lock;
    }

    private function area(string $area): void
    {
        if (! isset(self::AREAS[$area])) {
            throw new ProjectException('There is no such area.', 404);
        }
    }

    private function strong(string $password): void
    {
        if (mb_strlen($password) < 8) {
            throw new ProjectException('Use at least 8 characters for the password.');
        }
    }

    private function needControlRoom(): void
    {
        if (! ProjectsSetup::controlRoom()) {
            throw new ProjectException('This needs database script 258. Run it first.', 409);
        }
    }
}
