<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Staff;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Things that wait for a second person (docs/PROJECTS_STAGE2_SPEC.md, builds 2.3 and 2.4): a lock password reset, and serious actions.
 * What was asked is stored exactly, with a hash, so the thing carried out later is the thing that was approved. The second person is never
 * the one who asked. A request lapses by itself; an approval is used once.
 */
class ProjectApprovals
{
    /** kind => the permission the second person must hold */
    public const APPROVER = ['lock_reset' => 'projects.locks.reset', 'action' => 'projects.approve'];

    /** @param array<string, mixed> $payload exactly what is being asked (never a password) */
    public function ask(string $kind, string $action, ?object $project, ?string $subjectType, ?int $subjectId, string $summary, array $payload, ?string $reason, User $by, bool $onProject = false): int
    {
        $hash = self::hash($payload);
        $same = DB::table('project_approvals')->where('asked_by', $by->id)->where('action', $action)->where('payload_hash', $hash)->where('status', 'waiting')->where('expires_at', '>', now())->exists();
        if ($same) {
            throw new ProjectException('You have already asked for this. It is waiting for an answer.');
        }
        $hours = (int) app(ProjectSettings::class)->get('access')['approval_hours'];
        $id = DB::table('project_approvals')->insertGetId([
            'kind' => $kind, 'action' => $action, 'project_id' => $project?->id, 'subject_type' => $subjectType, 'subject_id' => $subjectId, 'summary' => mb_substr($summary, 0, 300),
            'payload' => json_encode($payload + ['_on_project' => $onProject]), 'payload_hash' => $hash, 'reason' => $reason === null ? null : mb_substr(trim($reason), 0, 300),
            'asked_by' => $by->id, 'asked_at' => now(), 'expires_at' => now()->addHours($hours), 'status' => 'waiting',
        ]);
        ProjectLog::record($project ? (int) $project->id : null, $by, 'approval.asked', 'approval', $id, null, ['what' => $summary, 'reason' => $reason]);
        ProjectNotices::tell($this->approvers(DB::table('project_approvals')->where('id', $id)->first()), ProjectNotices::ACCESS, "{$by->name} needs your approval in Projects",
            "{$by->name} has asked to: {$summary}." . ($reason ? "\n\nThey say: {$reason}" : '') . "\n\nNothing has changed yet. Open Approvals to approve or decline. It lapses in {$hours} hours.", '/admin/projects/approvals', 'Open Approvals');

        return $id;
    }

    /** Who may answer this request: holds the permission, is not the asker, and (for an action) could open the project themselves. @return Collection<int, User> */
    public function approvers(object $approval): Collection
    {
        return app(Staff::class)->holding(self::APPROVER[$approval->kind] ?? 'projects.approve')->filter(fn ($u) => $this->mayAnswer($approval, $u))->values();
    }

    public function mayAnswer(object $approval, User $user): bool
    {
        if ((int) $approval->asked_by === (int) $user->id || ! $user->hasPermission(self::APPROVER[$approval->kind] ?? 'projects.approve') || ! $user->hasPermission('projects.use')) {
            return false;
        }
        if ($approval->kind !== 'action' || ! $approval->project_id) {
            return true;
        }
        $project = DB::table('projects')->where('id', $approval->project_id)->first();
        if (! $project) {
            return false;
        }
        $access = app(ProjectAccess::class);
        $onIt = $access->roleAbilities($user, (int) $project->id);
        $needOnIt = (bool) (json_decode((string) $approval->payload, true)['_on_project'] ?? false);

        return $needOnIt ? in_array('open', $onIt, true) : ($project->deleted_at !== null ? $user->hasPermission('projects.delete') : $access->base($user, 'open', $project, $onIt)['allowed']);
    }

    public function answer(int $id, bool $approve, ?string $note, User $by): void
    {
        $a = DB::table('project_approvals')->where('id', $id)->first();
        if (! $a || ! $this->mayAnswer($a, $by)) {
            throw new ProjectException('Not found.', 404);
        }
        if ($a->status !== 'waiting' || $a->expires_at <= now()->format('Y-m-d H:i:s')) {
            throw new ProjectException($a->status === 'waiting' ? 'This request has lapsed.' : 'This has already been answered.');
        }
        $note = trim((string) $note) ?: null;
        if (! $approve && $note === null) {
            throw new ProjectException('Say why you are declining.');
        }
        DB::table('project_approvals')->where('id', $id)->where('status', 'waiting')->update(['status' => $approve ? 'approved' : 'declined', 'answered_by' => $by->id, 'answered_at' => now(), 'answer_note' => $note === null ? null : mb_substr($note, 0, 300)]);
        ProjectLog::record($a->project_id ? (int) $a->project_id : null, $by, $approve ? 'approval.approved' : 'approval.declined', 'approval', $id, null, ['what' => $a->summary, 'note' => $note]);
        ProjectNotices::tell(User::find($a->asked_by), ProjectNotices::ACCESS, $approve ? "{$by->name} approved your request" : "{$by->name} declined your request",
            ($approve ? "{$by->name} approved: {$a->summary}.\n\nIt has not been done yet: open Approvals and carry it out." : "{$by->name} declined: {$a->summary}.") . ($note ? "\n\nThey say: {$note}" : ''), '/admin/projects/approvals', 'Open Approvals');
    }

    public function withdraw(int $id, User $by): void
    {
        $done = DB::table('project_approvals')->where('id', $id)->where('asked_by', $by->id)->whereIn('status', ['waiting', 'approved'])->update(['status' => 'withdrawn']);
        if (! $done) {
            throw new ProjectException('Not found.', 404);
        }
        ProjectLog::record(null, $by, 'approval.withdrawn', 'approval', $id);
    }

    /** An approval this person can use now for exactly this. @param array<string, mixed> $payload */
    public function approvedFor(string $action, ?object $project, array $payload, User $by): ?object
    {
        return DB::table('project_approvals')->where('asked_by', $by->id)->where('action', $action)->where('payload_hash', self::hash($payload))->where('status', 'approved')
            ->where('expires_at', '>', now())->when($project, fn ($q) => $q->where('project_id', $project->id))->orderByDesc('id')->first();
    }

    public function waitingFor(string $action, ?object $project, array $payload, User $by): ?object
    {
        return DB::table('project_approvals')->where('asked_by', $by->id)->where('action', $action)->where('payload_hash', self::hash($payload))->where('status', 'waiting')
            ->where('expires_at', '>', now())->when($project, fn ($q) => $q->where('project_id', $project->id))->first();
    }

    public function markUsed(int $id): void
    {
        DB::table('project_approvals')->where('id', $id)->update(['status' => 'used', 'used_at' => now()]);
    }

    /** The Approvals page: what waits for me, and what I asked for. @return array{waiting: array<int, array<string, mixed>>, mine: array<int, array<string, mixed>>} */
    public function page(User $user): array
    {
        if (! ProjectsSetup::controlRoom()) {
            return ['waiting' => [], 'mine' => []];
        }
        $names = fn (Collection $rows) => DB::table('users')->whereIn('id', $rows->pluck('asked_by')->merge($rows->pluck('answered_by'))->filter()->unique())->pluck('name', 'id');
        $numbers = fn (Collection $rows) => DB::table('projects')->whereIn('id', $rows->pluck('project_id')->filter()->unique())->pluck('number', 'id');
        $shape = function (Collection $rows) use ($names, $numbers) {
            $n = $names($rows);
            $p = $numbers($rows);
            $now = now();

            return $rows->map(fn ($a) => ['id' => (int) $a->id, 'kind' => $a->kind, 'action' => $a->action, 'summary' => $a->summary, 'reason' => $a->reason, 'project_id' => $a->project_id ? (int) $a->project_id : null,
                'project' => $a->project_id ? ($p[$a->project_id] ?? null) : null, 'asked_by' => $n[$a->asked_by] ?? null, 'asked_at' => $a->asked_at, 'expires_at' => $a->expires_at,
                'hours_left' => max(0, (int) floor($now->diffInMinutes(\Carbon\Carbon::parse($a->expires_at), false) / 60)),
                'status' => $a->status === 'waiting' && $a->expires_at <= $now->format('Y-m-d H:i:s') ? 'lapsed' : $a->status,
                'answered_by' => $a->answered_by ? ($n[$a->answered_by] ?? null) : null, 'answer_note' => $a->answer_note])->values()->all();
        };
        $kinds = array_keys(array_filter(self::APPROVER, fn ($permission) => $user->hasPermission($permission)));
        $waiting = $kinds ? DB::table('project_approvals')->whereIn('kind', $kinds)->where('status', 'waiting')->where('expires_at', '>', now())->where('asked_by', '!=', $user->id)->orderBy('expires_at')->limit(200)->get()
            ->filter(fn ($a) => $this->mayAnswer($a, $user)) : collect();
        $mine = DB::table('project_approvals')->where('asked_by', $user->id)->where('asked_at', '>', now()->subDays(14))->orderByDesc('id')->limit(50)->get();

        return ['waiting' => $shape($waiting), 'mine' => $shape($mine)];
    }

    /** @param array<string, mixed> $payload */
    public static function hash(array $payload): string
    {
        ksort($payload);

        return hash('sha256', (string) json_encode($payload));
    }
}
