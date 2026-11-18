<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Goals, reviews and one-to-ones (docs/PROJECTS_STAGE8_SPEC.md, build 8.3). They concern one person and are seen by that person, by anyone above
 * them in HR's manager line who holds `projects.team.manage`, and by nobody else; they are never in a piece of work's log or any export.
 * The manager sets goals and writes reviews and one-to-ones; the person updates their goals' progress, reads and acknowledges reviews (with a
 * comment), and adds to a one-to-one's shared notes. Each writer may keep a private note on a one-to-one that only they see (owner's choice 2).
 */
class ProjectGrowth
{
    public const GOAL_STATES = ['on_track' => 'On track', 'at_risk' => 'At risk', 'done' => 'Done', 'dropped' => 'Dropped'];

    public function __construct(private ProjectTeam $team, private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function page(User $viewer, int $userId): array
    {
        $as = $this->role($viewer, $userId);
        $reviews = DB::table('project_reviews')->where('user_id', $userId)->when($as === 'self', fn ($q) => $q->whereNotNull('shared_at'))->orderByDesc('id')->get();
        $names = DB::table('users')->pluck('name', 'id');

        return [
            'goals' => DB::table('project_goals')->where('user_id', $userId)->orderByRaw("CASE state WHEN 'at_risk' THEN 0 WHEN 'on_track' THEN 1 WHEN 'done' THEN 2 ELSE 3 END")->orderBy('due_on')->get()
                ->map(fn ($g) => ['id' => (int) $g->id, 'title' => $g->title, 'measure' => $g->measure, 'due_on' => $g->due_on, 'progress' => (int) $g->progress, 'state' => $g->state, 'set_by' => $names[$g->set_by] ?? null])->all(),
            'reviews' => $reviews->map(fn ($r) => ['id' => (int) $r->id, 'period' => $r->period, 'body' => $r->body, 'written_by' => $names[$r->written_by] ?? null, 'shared_at' => $r->shared_at,
                'acknowledged_at' => $r->acknowledged_at, 'comment' => $r->comment])->all(),
            'one_to_ones' => DB::table('project_one_to_ones as o')->leftJoin('project_one_to_one_private as pv', fn ($j) => $j->on('pv.one_to_one_id', '=', 'o.id')->where('pv.user_id', '=', $viewer->id))
                ->where('o.user_id', $userId)->orderByDesc('o.held_on')->orderByDesc('o.id')->limit(100)->get(['o.*', 'pv.note as private_note'])
                ->map(fn ($o) => ['id' => (int) $o->id, 'held_on' => $o->held_on, 'manager' => $names[$o->manager_id] ?? null, 'notes' => $o->notes, 'actions' => json_decode((string) $o->actions, true) ?: [], 'private_note' => $o->private_note])->all(),
            'states' => self::GOAL_STATES,
            'can' => ['manage' => $as === 'manager', 'self' => $as === 'self'],
        ];
    }

    /** @param array<string, mixed> $d title, measure, due_on, progress, state */
    public function saveGoal(User $by, int $userId, ?int $goalId, array $d): void
    {
        $as = $this->role($by, $userId);
        $g = $goalId ? (DB::table('project_goals')->where('id', $goalId)->where('user_id', $userId)->first() ?? throw new ProjectException('Not found.', 404)) : null;
        if ($as === 'self' && (! $g || array_diff(array_keys($d), ['progress', 'state']))) {
            throw new ProjectException('Your manager sets your goals. You can update how far along each is.', 403);
        }
        $row = [];
        if ($as === 'manager') {
            if (array_key_exists('title', $d) || ! $g) {
                $row['title'] = mb_substr(trim((string) ($d['title'] ?? '')), 0, 200) ?: throw new ProjectException('Say what the goal is.');
            }
            foreach (['measure' => 300] as $k => $max) {
                if (array_key_exists($k, $d)) {
                    $row[$k] = mb_substr(trim((string) $d[$k]), 0, $max) ?: null;
                }
            }
            if (array_key_exists('due_on', $d)) {
                $row['due_on'] = $d['due_on'] ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d['due_on']) ? $d['due_on'] : throw new ProjectException('Choose the day it is due.')) : null;
            }
        }
        if (array_key_exists('progress', $d)) {
            $row['progress'] = max(0, min(100, (int) $d['progress']));
        }
        if (array_key_exists('state', $d)) {
            $row['state'] = isset(self::GOAL_STATES[$d['state']]) ? $d['state'] : throw new ProjectException('Choose how the goal is going from the list.');
        }
        if ($g) {
            DB::table('project_goals')->where('id', $g->id)->update($row + ['updated_at' => now()]);
            if ($as === 'self' && ($m = $this->managerOf($userId))) {
                ProjectNotices::tell($m, ProjectNotices::PEOPLE, "{$by->name} updated a goal", "{$g->title}: " . ($row['progress'] ?? $g->progress) . '%, ' . mb_strtolower(self::GOAL_STATES[$row['state'] ?? $g->state]), "/admin/projects/team/{$userId}", 'Open their page');
            }
        } else {
            DB::table('project_goals')->insert($row + ['user_id' => $userId, 'progress' => $row['progress'] ?? 0, 'state' => $row['state'] ?? 'on_track', 'set_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            ProjectNotices::tell(User::find($userId), ProjectNotices::PEOPLE, 'A new goal for you', "{$by->name} set a goal: {$row['title']}", "/admin/projects/team/{$userId}", 'Open your page');
        }
    }

    /** The manager writes or shares; the person comments and acknowledges. @param array<string, mixed> $d period, body, share | comment, acknowledge */
    public function saveReview(User $by, int $userId, ?int $reviewId, array $d): void
    {
        $as = $this->role($by, $userId);
        $r = $reviewId ? (DB::table('project_reviews')->where('id', $reviewId)->where('user_id', $userId)->first() ?? throw new ProjectException('Not found.', 404)) : null;
        if ($as === 'self') {
            if (! $r || ! $r->shared_at) {
                throw new ProjectException('Not found.', 404);
            }
            $row = ['updated_at' => now()];
            if (array_key_exists('comment', $d)) {
                $row['comment'] = mb_substr(trim((string) $d['comment']), 0, 5000) ?: null;
            }
            if (! empty($d['acknowledge']) && ! $r->acknowledged_at) {
                $row['acknowledged_at'] = now();
            }
            DB::table('project_reviews')->where('id', $r->id)->update($row);
            if ($r->written_by && ($w = User::find($r->written_by))) {
                ProjectNotices::tell($w, ProjectNotices::PEOPLE, "{$by->name} " . (isset($row['acknowledged_at']) ? 'acknowledged' : 'commented on') . " their review", $r->period, "/admin/projects/team/{$userId}", 'Open their page');
            }

            return;
        }
        if ($r && $r->acknowledged_at) {
            throw new ProjectException('This review has been acknowledged. Write a new one instead.');
        }
        $period = trim((string) ($d['period'] ?? ($r->period ?? '')));
        $body = trim((string) ($d['body'] ?? ($r->body ?? '')));
        if ($period === '' || $body === '') {
            throw new ProjectException('Give the review its period and write it.');
        }
        $row = ['period' => mb_substr($period, 0, 60), 'body' => mb_substr($body, 0, 20000), 'updated_at' => now()];
        $share = ! empty($d['share']) && ! ($r->shared_at ?? null);
        if ($share) {
            $row['shared_at'] = now();
        }
        if ($r) {
            DB::table('project_reviews')->where('id', $r->id)->update($row);
        } else {
            DB::table('project_reviews')->insert($row + ['user_id' => $userId, 'written_by' => $by->id, 'created_at' => now()]);
        }
        if ($share) {
            ProjectNotices::tell(User::find($userId), ProjectNotices::PEOPLE, "Your review: {$row['period']}", "{$by->name} shared your review. Read it, add your comment and acknowledge it.", "/admin/projects/team/{$userId}", 'Read it');
        }
    }

    /** @param array<string, mixed> $d held_on, notes, actions [{text, who}], private_note */
    public function saveOneToOne(User $by, int $userId, ?int $id, array $d): int
    {
        $as = $this->role($by, $userId);
        $o = $id ? (DB::table('project_one_to_ones')->where('id', $id)->where('user_id', $userId)->first() ?? throw new ProjectException('Not found.', 404)) : null;
        if (! $o && $as !== 'manager') {
            throw new ProjectException('Your manager records your one-to-ones. You can add to their notes.', 403);
        }
        $row = ['updated_at' => now()];
        if (array_key_exists('notes', $d)) {
            $row['notes'] = mb_substr(trim((string) $d['notes']), 0, 20000) ?: null;
        }
        if ($as === 'manager') {
            if (array_key_exists('held_on', $d) || ! $o) {
                $row['held_on'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['held_on'] ?? '')) ? $d['held_on'] : throw new ProjectException('Choose the day you met.');
            }
            if (array_key_exists('actions', $d)) {
                $old = $o ? (json_decode((string) $o->actions, true) ?: []) : [];
                $list = [];
                foreach (array_values((array) $d['actions']) as $i => $a) {
                    $text = mb_substr(trim((string) ($a['text'] ?? '')), 0, 200);
                    if ($text !== '') {
                        $list[] = ['text' => $text, 'who' => ! empty($a['who']) ? (int) $a['who'] : null, 'task_id' => $old[$i]['task_id'] ?? null];
                    }
                }
                $row['actions'] = json_encode($list);
            }
        }
        if ($o) {
            DB::table('project_one_to_ones')->where('id', $o->id)->update($row);
            $id = (int) $o->id;
        } else {
            $id = DB::table('project_one_to_ones')->insertGetId($row + ['user_id' => $userId, 'manager_id' => $by->id, 'created_by' => $by->id, 'created_at' => now()]);
            ProjectNotices::tell(User::find($userId), ProjectNotices::PEOPLE, 'Notes from your one-to-one', "{$by->name} wrote up your one-to-one of {$row['held_on']}.", "/admin/projects/team/{$userId}", 'Read them');
        }
        if (array_key_exists('private_note', $d)) {
            $note = trim((string) $d['private_note']);
            $key = ['one_to_one_id' => $id, 'user_id' => $by->id];
            $note === '' ? DB::table('project_one_to_one_private')->where($key)->delete() : DB::table('project_one_to_one_private')->updateOrInsert($key, ['note' => mb_substr($note, 0, 10000), 'updated_at' => now()]);
        }

        return $id;
    }

    /** An action point becomes a task on a piece of work, given to its person. @return int the task */
    public function actionToTask(User $by, int $userId, int $id, int $index, int $projectId): int
    {
        if ($this->role($by, $userId) !== 'manager') {
            throw new ProjectException('Only the manager can make an action point a task.', 403);
        }
        $o = DB::table('project_one_to_ones')->where('id', $id)->where('user_id', $userId)->first() ?? throw new ProjectException('Not found.', 404);
        $actions = json_decode((string) $o->actions, true) ?: [];
        $a = $actions[$index] ?? throw new ProjectException('Not found.', 404);
        if (! empty($a['task_id'])) {
            throw new ProjectException('This action point is already a task.');
        }
        $project = app(ProjectService::class)->findFor($by, $projectId);
        $task = app(ProjectTasks::class)->create($project, ['title' => $a['text'], 'people' => [$a['who'] ?: $userId], 'description' => 'From a one-to-one on ' . $o->held_on . '.'], $by);
        $actions[$index]['task_id'] = $task;
        DB::table('project_one_to_ones')->where('id', $o->id)->update(['actions' => json_encode($actions), 'updated_at' => now()]);

        return $task;
    }

    // ------------------------------------------------------------------ inside

    /** self, manager, or not allowed at all (404). */
    private function role(User $viewer, int $userId): string
    {
        if (! ProjectsSetup::people()) {
            throw new ProjectException('People need database script 265.', 409);
        }
        if ((int) $viewer->id === $userId) {
            return 'self';
        }
        if ($viewer->hasPermission('projects.team.manage') && $this->team->isAbove((int) $viewer->id, $userId)) {
            return 'manager';
        }
        throw new ProjectException('Not found.', 404);
    }

    private function managerOf(int $userId): ?User
    {
        $m = $this->team->hr($userId)['manager_user_id'];

        return $m ? User::find($m) : null;
    }
}
