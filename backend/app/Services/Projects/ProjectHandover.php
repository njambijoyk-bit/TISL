<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Handing work over (docs/PROJECTS_STAGE6_SPEC.md, build 6.8): one person's work on a piece of work, or on all their work, moves to someone else
 * in one step: their open tasks, key dates they are responsible for, conversations they answer, meetings they organise, and their follow-ups on
 * the work's client (stage 3). All or some. The person taking it must be on the work; where they are not, that work's items stay and say why.
 * Handing over needs `projects.members.manage` and, on each piece of work, a project role that manages members. Handing over someone else's
 * work is also a serious action (owner's choice 4; out of the box it needs nothing). Both people are told; every move is logged.
 * Handing over the lead of a piece of work stays where it is (stage 2).
 */
class ProjectHandover
{
    public const KINDS = ['task' => 'Open tasks', 'date' => 'Key dates they are responsible for', 'thread' => 'Conversations they answer', 'meeting' => 'Meetings they organise', 'follow_up' => 'Follow-ups on the client'];

    public function __construct(private ProjectAccess $access) {}

    /** People on any work this person may manage, to choose from. @return array<int, array{id: int, name: string}> */
    public function people(User $by): array
    {
        $q = DB::table('projects as p')->join('project_members as m', 'm.project_id', '=', 'p.id')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.status', 'active');
        $this->access->visible($q, $by);

        return $q->distinct()->orderBy('u.name')->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all();
    }

    /** What would move. @return array<string, mixed> */
    public function preview(User $by, int $fromId, int $toId, ?int $projectId = null): array
    {
        $from = User::find($fromId) ?? throw new ProjectException('Choose whose work is handed over.');
        $to = User::find($toId) ?? throw new ProjectException('Choose who takes it.');
        if ($from->id === $to->id) {
            throw new ProjectException('Choose someone else to take the work.');
        }
        $projects = $this->projects($by, $from, $projectId);
        $seen = [];
        $out = [];
        foreach ($projects as $p) {
            $may = $this->access->decide($by, 'members', $p)['allowed'];
            $toOn = $this->isOn($to, (int) $p->id);
            $items = $this->items($p, $from, $seen);
            if (! $items) {
                continue;
            }
            $out[] = ['project' => ['id' => (int) $p->id, 'number' => $p->number, 'title' => $p->title], 'items' => $items,
                'blocked' => ! $may ? 'You may not hand over work on this one.' : (! $toOn ? "{$to->name} is not on this work. Add them first." : null)];
        }

        return ['from' => ['id' => (int) $from->id, 'name' => $from->name], 'to' => ['id' => (int) $to->id, 'name' => $to->name], 'kinds' => self::KINDS, 'projects' => $out,
            'serious' => (int) $from->id !== (int) $by->id];
    }

    /**
     * Move the chosen items (all, when none are chosen). @param array<int, array{kind: string, id: int}>|null $only
     * @return array{moved: int, projects: int}
     */
    public function apply(User $by, int $fromId, int $toId, ?int $projectId, ?array $only): array
    {
        $plan = $this->preview($by, $fromId, $toId, $projectId);
        $want = $only === null ? null : array_flip(array_map(fn ($i) => ($i['kind'] ?? '') . ':' . (int) ($i['id'] ?? 0), $only));
        $from = User::find($fromId);
        $to = User::find($toId);
        $moved = 0;
        $touched = 0;
        $todo = [];
        foreach ($plan['projects'] as $block) {   // every piece of work is checked before anything moves
            $items = array_values(array_filter($block['items'], fn ($i) => $want === null || isset($want["{$i['kind']}:{$i['id']}"])));
            if (! $items) {
                continue;
            }
            if ($block['blocked']) {
                throw new ProjectException("{$block['project']['number']}: {$block['blocked']}");
            }
            $todo[] = [$block, $items];
        }
        foreach ($todo as [$block, $items]) {
            $p = DB::table('projects')->where('id', $block['project']['id'])->first();
            DB::transaction(function () use ($items, $from, $to, $p, $by) {
                foreach ($items as $i) {
                    $this->move($i['kind'], (int) $i['id'], $from, $to);
                }
                $counts = array_count_values(array_column($items, 'kind'));
                ProjectLog::record((int) $p->id, $by, 'work.handed_over', 'member', (int) $to->id, ['from' => $from->name], ['to' => $to->name] + $counts);
            });
            foreach ($items as $i) {
                $this->after($i['kind'], (int) $i['id']);
            }
            $moved += count($items);
            $touched++;
        }
        if ($moved === 0) {
            throw new ProjectException('There is nothing to hand over.');
        }
        $by->id !== $from->id && ProjectNotices::tell($from, ProjectNotices::TASK, "Your work was handed to {$to->name}", "{$by->name} handed {$moved} " . ($moved === 1 ? 'item' : 'items') . " of your work on {$touched} " . ($touched === 1 ? 'piece of work' : 'pieces of work') . " to {$to->name}.", '/admin/projects/my-work', 'Open My Work');
        $by->id === $from->id && ProjectNotices::tell($from, ProjectNotices::TASK, "You handed work to {$to->name}", "{$moved} " . ($moved === 1 ? 'item' : 'items') . " moved to {$to->name}.", '/admin/projects/my-work', 'Open My Work');
        ProjectNotices::tell($to, ProjectNotices::TASK, "{$from->name}'s work was handed to you", "{$by->name} handed you {$moved} " . ($moved === 1 ? 'item' : 'items') . " of {$from->name}'s work on {$touched} " . ($touched === 1 ? 'piece of work' : 'pieces of work') . '.', '/admin/projects/my-work', 'Open My Work');

        return ['moved' => $moved, 'projects' => $touched];
    }

    // ------------------------------------------------------------------ inside

    /** The work of this person to look at: one piece, or every piece they are on that the hander may see. @return array<int, object> */
    private function projects(User $by, User $from, ?int $projectId): array
    {
        $q = DB::table('projects as p')->whereNull('p.deleted_at');
        $this->access->visible($q, $by);
        if ($projectId) {
            $q->where('p.id', $projectId);
        } else {
            $q->whereExists(fn ($m) => $m->from('project_members as m')->whereColumn('m.project_id', 'p.id')->where('m.user_id', $from->id));
        }
        $rows = $q->orderBy('p.number')->get(['p.*'])->all();
        if ($projectId && ! $rows) {
            throw new ProjectException('Not found.', 404);
        }

        return $rows;
    }

    /** @param array<string, true> $seen follow-ups already listed under another piece of work for the same client @return array<int, array<string, mixed>> */
    private function items(object $p, User $from, array &$seen): array
    {
        $out = [];
        if (ProjectsSetup::work()) {
            foreach (DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->where('t.project_id', $p->id)->where('tp.user_id', $from->id)
                ->whereNull('t.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])->orderBy('t.number')->get(['t.id', 't.number', 't.title', 't.due_date']) as $t) {
                $out[] = ['kind' => 'task', 'id' => (int) $t->id, 'label' => "{$p->number}-T{$t->number} {$t->title}", 'when' => $t->due_date];
            }
            foreach (DB::table('project_key_dates')->where('project_id', $p->id)->where('responsible_id', $from->id)->whereNull('deleted_at')->whereIn('state', ['open', 'missed'])->orderBy('starts_at')->get(['id', 'title', 'starts_at']) as $k) {
                $out[] = ['kind' => 'date', 'id' => (int) $k->id, 'label' => $k->title, 'when' => substr((string) $k->starts_at, 0, 10)];
            }
        }
        if (ProjectsSetup::messages()) {
            foreach (DB::table('project_threads')->where('project_id', $p->id)->where('owner_id', $from->id)->where('state', 'open')->orderByDesc('last_message_at')->get(['id', 'subject']) as $t) {
                $out[] = ['kind' => 'thread', 'id' => (int) $t->id, 'label' => $t->subject, 'when' => null];
            }
            foreach (DB::table('project_meetings')->where('project_id', $p->id)->where('organiser_id', $from->id)->where('state', 'planned')->where('ends_at', '>=', now())->orderBy('starts_at')->get(['id', 'title', 'starts_at']) as $m) {
                $out[] = ['kind' => 'meeting', 'id' => (int) $m->id, 'label' => $m->title, 'when' => substr((string) $m->starts_at, 0, 16)];
            }
        }
        if (ProjectsSetup::relationships() && $p->customer_id) {
            foreach (DB::table('project_follow_ups')->where('owner_id', $from->id)->whereNull('done_at')->where('subject_type', 'customer')->where('subject_id', $p->customer_id)->orderBy('due_on')->get(['id', 'what', 'due_on']) as $f) {
                if (isset($seen[$f->id])) {
                    continue;
                }
                $seen[$f->id] = true;
                $out[] = ['kind' => 'follow_up', 'id' => (int) $f->id, 'label' => $f->what, 'when' => $f->due_on];
            }
        }

        return $out;
    }

    private function move(string $kind, int $id, User $from, User $to): void
    {
        match ($kind) {
            'task' => DB::table('project_task_people')->where(['task_id' => $id, 'user_id' => $to->id])->exists()
                ? DB::table('project_task_people')->where(['task_id' => $id, 'user_id' => $from->id])->delete()
                : DB::table('project_task_people')->where(['task_id' => $id, 'user_id' => $from->id])->update(['user_id' => $to->id]),
            'date' => DB::table('project_key_dates')->where('id', $id)->update(['responsible_id' => $to->id, 'updated_at' => now()]),
            'thread' => DB::table('project_threads')->where('id', $id)->update(['owner_id' => $to->id, 'updated_at' => now()]),
            'meeting' => $this->moveMeeting($id, $to),
            'follow_up' => DB::table('project_follow_ups')->where('id', $id)->update(['owner_id' => $to->id, 'updated_at' => now()]),
        };
    }

    private function moveMeeting(int $id, User $to): void
    {
        DB::table('project_meetings')->where('id', $id)->update(['organiser_id' => $to->id, 'updated_at' => now()]);
        $row = DB::table('project_meeting_people')->where(['meeting_id' => $id, 'user_id' => $to->id])->first();
        $row ? DB::table('project_meeting_people')->where('id', $row->id)->update(['response' => 'yes', 'answered_at' => now()])
            : DB::table('project_meeting_people')->insert(['meeting_id' => $id, 'user_id' => $to->id, 'response' => 'yes', 'answered_at' => now()]);
    }

    /** Calendars follow what moved. */
    private function after(string $kind, int $id): void
    {
        match ($kind) {
            'task' => app(ProjectTaskCalendar::class)->sync($id),
            'date' => app(ProjectKeyDates::class)->sync($id),
            'meeting' => app(ProjectMeetings::class)->syncCalendar($id),
            default => null,
        };
    }

    private function isOn(User $u, int $projectId): bool
    {
        return in_array('open', $this->access->roleAbilities($u, $projectId), true);
    }
}
