<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The inbox (docs/PROJECTS_STAGE6_SPEC.md, build 6.3): every conversation a person is in, across all their work, newest first.
 *
 * "In" means on the work (an active member whose role may open it) and allowed the conversation's audience. With `projects.inbox.all`, every
 * conversation on work they may see. Filters: unread, mentions, mine to answer, tag, piece of work, audience, open or closed.
 */
class ProjectInbox
{
    public function __construct(private ProjectAccess $access) {}

    /** @param array<string, mixed> $f @return array<string, mixed> */
    public function page(User $user, array $f = []): array
    {
        if (! ProjectsSetup::messages()) {
            return ['ready' => false];
        }
        $rows = $this->query($user, $f)->orderByDesc('t.last_message_at')->orderByDesc('t.id')->limit(300)
            ->get(['t.*', 'p.number as project_number', 'p.title as project_title']);
        $ids = $rows->pluck('id')->map(fn ($v) => (int) $v)->all();
        $threads = app(ProjectThreads::class);
        $unread = $threads->unread($ids, $user);
        $mentioned = $this->mentioned($user, $ids);
        if (! empty($f['unread'])) {
            $rows = $rows->filter(fn ($t) => ($unread[$t->id] ?? 0) > 0);
        }
        if (! empty($f['mentions'])) {
            $rows = $rows->filter(fn ($t) => isset($mentioned[$t->id]));
        }
        $owners = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $last = $threads->lastOf($rows->pluck('id')->all());
        $all = $this->query($user, ['state' => 'open'])->pluck('t.id')->map(fn ($v) => (int) $v)->all();
        $counts = $threads->unread($all, $user);

        return [
            'ready' => true,
            'threads' => $rows->take(200)->map(fn ($t) => $threads->summary($t, $owners, $unread, $last) + [
                'project' => ['id' => (int) $t->project_id, 'number' => $t->project_number, 'title' => $t->project_title],
                'mentioned' => isset($mentioned[$t->id]), 'mine' => (int) $t->owner_id === (int) $user->id,
            ])->values()->all(),
            'totals' => ['unread' => count($counts), 'mentions' => count(array_intersect_key($this->mentioned($user, $all, true), $counts)),
                'mine' => DB::table('project_threads')->whereIn('id', $all ?: [0])->where('owner_id', $user->id)->count()],
            'audiences' => ProjectThreads::AUDIENCES,
            'tags' => $threads->tags(),
            'projects' => $this->projects($user),
            'all' => $user->hasPermission('projects.inbox.all'),
            'waiting_replies' => $user->hasPermission('projects.messages.moderate') && \App\Services\Notify\Replies\InboundReplies::ready() ? \Illuminate\Support\Facades\DB::table('notification_inbound')->where('state', 'waiting')->count() : null,
        ];
    }

    /** Conversations with something unread, for the menu. */
    public function count(User $user): int
    {
        if (! ProjectsSetup::messages()) {
            return 0;
        }

        return count(app(ProjectThreads::class)->unread($this->query($user, ['state' => 'open'])->pluck('t.id')->map(fn ($v) => (int) $v)->all(), $user));
    }

    // ------------------------------------------------------------------ inside

    /** @param array<string, mixed> $f */
    private function query(User $user, array $f)
    {
        $audiences = [];
        if ($user->hasPermission('projects.messages.internal')) {
            $audiences[] = 'team';
        }
        if ($user->hasPermission('projects.messages.client')) {
            array_push($audiences, 'client', 'others');
        }
        $q = DB::table('project_threads as t')->join('projects as p', 'p.id', '=', 't.project_id')->whereIn('t.audience', $audiences ?: ['none']);
        $this->access->visible($q, $user, ! $user->hasPermission('projects.inbox.all'));
        $state = $f['state'] ?? 'open';
        $q->when($state !== 'all', fn ($w) => $w->where('t.state', $state === 'closed' ? 'closed' : 'open'))
            ->when(! empty($f['mine']), fn ($w) => $w->where('t.owner_id', $user->id))
            ->when(! empty($f['project_id']), fn ($w) => $w->where('t.project_id', (int) $f['project_id']))
            ->when(! empty($f['audience']) && isset(ProjectThreads::AUDIENCES[$f['audience']]), fn ($w) => $w->where('t.audience', $f['audience']))
            ->when(! empty($f['tag']), fn ($w) => $w->whereExists(fn ($x) => $x->from('project_thread_tags as tt')->join('project_tags as g', 'g.id', '=', 'tt.tag_id')->whereColumn('tt.thread_id', 't.id')->where('g.key', (string) $f['tag'])));

        return $q;
    }

    /** Conversations where this person is mentioned (only in messages they have not read, when asked). @param int[] $ids @return array<int, true> */
    private function mentioned(User $user, array $ids, bool $unreadOnly = false): array
    {
        $q = DB::table('project_message_mentions as mm')->join('project_thread_messages as m', 'm.id', '=', 'mm.message_id')->where('mm.user_id', $user->id)->whereNull('m.removed_at')->whereIn('m.thread_id', $ids ?: [0]);
        if ($unreadOnly) {
            $q->leftJoin('project_message_reads as r', fn ($j) => $j->on('r.thread_id', '=', 'm.thread_id')->where('r.user_id', '=', $user->id))
                ->where(fn ($w) => $w->whereNull('r.last_message_id')->orWhereColumn('m.id', '>', 'r.last_message_id'));
        }

        return array_fill_keys($q->distinct()->pluck('m.thread_id')->map(fn ($v) => (int) $v)->all(), true);
    }

    /** The work this person has conversations on, for the filter. @return array<int, array{id: int, label: string}> */
    private function projects(User $user): array
    {
        return $this->query($user, ['state' => 'all'])->select('p.id', 'p.number', 'p.title')->distinct()->orderBy('p.number')->limit(300)->get()
            ->map(fn ($p) => ['id' => (int) $p->id, 'label' => "{$p->number} {$p->title}"])->all();
    }
}
