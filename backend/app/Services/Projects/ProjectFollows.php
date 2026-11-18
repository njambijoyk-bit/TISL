<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Following (docs/PROJECTS_STAGE6_SPEC.md, build 6.3): hearing about a piece of work, a conversation or a task.
 *
 * Some people follow on their own: a conversation's owner, whoever started it, wrote in it or was mentioned in it; a task's people and whoever
 * made it. Anyone can follow more (a row in `project_follows`) or stop (a row with `muted` = 1, so following on their own stops too).
 * Following a piece of work means hearing about every conversation on it that they may read, its tasks moving and its key dates moving.
 * Nobody is told about something they may no longer read.
 */
class ProjectFollows
{
    public const TYPES = ['project', 'thread', 'task'];

    public function __construct(private ProjectAccess $access) {}

    /** @return array{on: bool, automatic: bool} */
    public function state(User $user, object $project, string $type, int $id): array
    {
        $row = $this->ready() ? DB::table('project_follows')->where(['user_id' => $user->id, 'subject_type' => $type, 'subject_id' => $id])->first() : null;
        $auto = in_array((int) $user->id, $this->automatic($project, $type, $id), true);

        return ['on' => $row ? ! $row->muted : $auto, 'automatic' => $auto];
    }

    /** Follow, or stop following. @return array{on: bool, automatic: bool} */
    public function set(User $user, object $project, string $type, int $id, bool $on): array
    {
        if (! in_array($type, self::TYPES, true) || ! $this->ready()) {
            throw new ProjectException('Choose what to follow.');
        }
        $this->subject($project, $type, $id, $user);
        $key = ['user_id' => $user->id, 'subject_type' => $type, 'subject_id' => $id];
        $auto = in_array((int) $user->id, $this->automatic($project, $type, $id), true);
        if ($on === $auto) {
            DB::table('project_follows')->where($key)->delete();   // back to what happens on its own
        } else {
            DB::table('project_follows')->updateOrInsert($key, ['muted' => $on ? 0 : 1, 'created_at' => now()]);
        }

        return $this->state($user, $project, $type, $id);
    }

    /**
     * Tell everyone following this (and, for a conversation or task, everyone following its work), except the people given.
     * @param int[] $except
     */
    public function tell(object $project, string $type, int $id, string $title, string $message, string $path, string $linkText, array $except = [], ?callable $mayRead = null): void
    {
        if (! $this->ready()) {
            return;
        }
        $ids = array_merge($this->automatic($project, $type, $id), $this->explicit($type, $id), $type !== 'project' ? $this->explicit('project', (int) $project->id) : []);
        $muted = DB::table('project_follows')->where(['subject_type' => $type, 'subject_id' => $id, 'muted' => 1])->pluck('user_id')->map(fn ($v) => (int) $v)->all();
        $ids = array_diff(array_unique($ids), $muted, array_map('intval', $except));
        if (! $ids) {
            return;
        }
        $people = User::whereIn('id', $ids)->whereNotIn('status', ['inactive', 'suspended'])->get()
            ->filter(fn (User $u) => $this->access->decide($u, 'open', $project)['allowed'] && (! $mayRead || $mayRead($u)));
        ProjectNotices::tell($people, ProjectNotices::FOLLOW, $title, $message, $path, $linkText);
    }

    /** What this person follows on their own on this work. @return int[] user ids */
    public function automatic(object $project, string $type, int $id): array
    {
        if ($type === 'thread' && ProjectsSetup::messages()) {
            $t = DB::table('project_threads')->where('id', $id)->first();
            if (! $t) {
                return [];
            }
            $ids = DB::table('project_thread_messages')->where('thread_id', $id)->whereNotNull('user_id')->distinct()->pluck('user_id')
                ->merge(DB::table('project_message_mentions as mm')->join('project_thread_messages as m', 'm.id', '=', 'mm.message_id')->where('m.thread_id', $id)->pluck('mm.user_id'))
                ->push($t->owner_id)->push($t->created_by);

            return $this->ints($ids);
        }
        if ($type === 'task' && ProjectsSetup::work()) {
            return $this->ints(DB::table('project_task_people')->where('task_id', $id)->pluck('user_id')->push(DB::table('project_work_tasks')->where('id', $id)->value('created_by')));
        }

        return [];
    }

    /** Everything this person chose to follow, for the inbox's "Following" list. @return array<int, array<string, mixed>> */
    public function mine(User $user): array
    {
        if (! $this->ready()) {
            return [];
        }

        return DB::table('project_follows')->where('user_id', $user->id)->where('muted', 0)->orderByDesc('created_at')->limit(200)->get(['subject_type', 'subject_id'])
            ->map(fn ($f) => ['type' => $f->subject_type, 'id' => (int) $f->subject_id])->all();
    }

    // ------------------------------------------------------------------ inside

    /** @return int[] */
    private function explicit(string $type, int $id): array
    {
        return $this->ints(DB::table('project_follows')->where(['subject_type' => $type, 'subject_id' => $id, 'muted' => 0])->pluck('user_id'));
    }

    /** It must be on this work and readable by the person. */
    private function subject(object $project, string $type, int $id, User $user): void
    {
        if ($type === 'project') {
            if ($id !== (int) $project->id) {
                throw new ProjectException('Not found.', 404);
            }

            return;
        }
        if ($type === 'thread') {
            app(ProjectThreads::class)->readableBy($project, $id, $user);

            return;
        }
        app(ProjectTasks::class)->find($project, $id);
    }

    /** @return int[] */
    private function ints(Collection $c): array
    {
        return $c->filter()->map(fn ($v) => (int) $v)->unique()->values()->all();
    }

    private function ready(): bool
    {
        return ProjectsSetup::messages();
    }
}
