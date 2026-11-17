<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The next action (docs/PROJECTS_STAGE3_SPEC.md, build 3.4) on a lead, a client or an opportunity: what, by when, whose. Marking one done asks
 * what happened (which becomes a history entry) and what is next, so a relationship is never left with nothing planned unless someone says so.
 * Each owner is reminded once a day of what is due or late.
 */
class ProjectFollowUps
{
    public const SUBJECTS = ['lead', 'customer', 'opportunity'];

    public function __construct(private ProjectRelations $relations) {}

    /** The open next action of each subject (the earliest due). @param int[] $ids @return array<int, array<string, mixed>> subject id => its next action */
    public function nextFor(string $type, array $ids): array
    {
        if (! $ids || ! ProjectsSetup::relationships()) {
            return [];
        }
        $rows = DB::table('project_follow_ups')->where('subject_type', $type)->whereIn('subject_id', $ids)->whereNull('done_at')->orderBy('due_on')->orderBy('id')->get();
        $users = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->unique())->pluck('name', 'id');
        $out = [];
        foreach ($rows as $f) {
            $out[(int) $f->subject_id] ??= $this->shape($f, $users[$f->owner_id] ?? null);
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> the open ones for one subject, earliest first */
    public function openFor(string $type, int $id): array
    {
        if (! ProjectsSetup::relationships() || ! in_array($type, self::SUBJECTS, true)) {
            return [];
        }
        $rows = DB::table('project_follow_ups')->where('subject_type', $type)->where('subject_id', $id)->whereNull('done_at')->orderBy('due_on')->get();
        $users = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->unique())->pluck('name', 'id');

        return $rows->map(fn ($f) => $this->shape($f, $users[$f->owner_id] ?? null))->all();
    }

    /** @param array<string, mixed> $d what, due_on, owner_id */
    public function add(string $type, int $id, array $d, User $by): int
    {
        if (! in_array($type, self::SUBJECTS, true)) {
            throw new ProjectException('A next action is set on a lead, a client or an opportunity.');
        }
        $values = $this->values($d, $by, null);
        $fid = DB::table('project_follow_ups')->insertGetId($values + ['subject_type' => $type, 'subject_id' => $id, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'follow_up.set', 'follow_up', $fid, null, ['what' => $values['what'], 'due' => $values['due_on'], 'on' => $type]);
        $owner = (int) $values['owner_id'];
        if ($owner !== (int) $by->id) {   // someone given a next action by someone else is told
            ProjectNotices::tell(User::find($owner), ProjectNotices::FOLLOW_UP, "{$by->name} gave you a next action", "{$values['what']}, by " . \Carbon\Carbon::parse($values['due_on'])->format('j M Y') . '.', '/admin/projects/follow-ups', 'Open my follow-ups');
        }

        return $fid;
    }

    public function find(int $id, User $user, bool $toChange): object
    {
        $f = ProjectsSetup::relationships() ? DB::table('project_follow_ups')->where('id', $id)->first() : null;
        if (! $f) {
            throw new ProjectException('Not found.', 404);
        }
        $this->relations->authorize($f->subject_type, (int) $f->subject_id, $user, $toChange);
        if ($toChange && $f->done_at !== null) {
            throw new ProjectException('That is already done.');
        }

        return $f;
    }

    /** @param array<string, mixed> $d what, due_on, owner_id */
    public function change(object $f, array $d, User $by): void
    {
        $values = $this->values($d + ['what' => $f->what, 'due_on' => $f->due_on, 'owner_id' => $f->owner_id], $by, $f);
        $changed = array_filter($values, fn ($v, $k) => (string) $f->$k !== (string) $v, ARRAY_FILTER_USE_BOTH);
        if ($changed) {
            DB::table('project_follow_ups')->where('id', $f->id)->update($changed + ['updated_at' => now(), 'reminded_on' => null]);
            ProjectLog::record(null, $by, 'follow_up.changed', 'follow_up', (int) $f->id, array_intersect_key((array) $f, $changed), $changed);
        }
    }

    /**
     * Done: what happened becomes a history entry (for a lead or client; an opportunity's goes to its lead or client), and the next action is set,
     * unless the person says there is nothing more to do.
     *
     * @param array<string, mixed> $d kind, summary, next_what, next_due, next_owner_id, no_next
     * @return array{interaction_id: ?int, next_id: ?int}
     */
    public function done(object $f, array $d, User $by): array
    {
        $noNext = ! empty($d['no_next']);
        if (! $noNext && trim((string) ($d['next_what'] ?? '')) === '') {
            throw new ProjectException('Say what happens next, or that nothing more is planned.');
        }

        return DB::transaction(function () use ($f, $d, $by, $noNext) {
            $iid = null;
            if (trim((string) ($d['summary'] ?? '')) !== '') {
                $iid = app(ProjectInteractions::class)->add($f->subject_type === 'customer' ? 'customer' : $f->subject_type, (int) $f->subject_id, ['kind' => $d['kind'] ?? 'note', 'summary' => $d['summary']], $by);
            }
            DB::table('project_follow_ups')->where('id', $f->id)->update(['done_at' => now(), 'done_by' => $by->id, 'interaction_id' => $iid, 'updated_at' => now()]);
            ProjectLog::record(null, $by, 'follow_up.done', 'follow_up', (int) $f->id, null, ['what' => $f->what, 'nothing_next' => $noNext]);
            $next = $noNext ? null : $this->add($f->subject_type, (int) $f->subject_id, ['what' => $d['next_what'], 'due_on' => $d['next_due'] ?? null, 'owner_id' => $d['next_owner_id'] ?? $f->owner_id], $by);

            return ['interaction_id' => $iid, 'next_id' => $next];
        });
    }

    /**
     * My follow-ups (or, with `projects.leads.view`, everyone's): what is open, late first.
     *
     * @return array<string, mixed>
     */
    public function page(User $user, string $scope): array
    {
        if (! ProjectsSetup::relationships()) {
            return ['items' => [], 'counts' => ['late' => 0, 'today' => 0, 'later' => 0], 'sees_all' => false];
        }
        $seeAll = $user->hasPermission('projects.leads.view');
        $rows = DB::table('project_follow_ups')->whereNull('done_at')->when(! $seeAll || $scope !== 'all', fn ($q) => $q->where('owner_id', $user->id))->orderBy('due_on')->orderBy('id')->limit(500)->get();
        $users = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->unique())->pluck('name', 'id');
        $names = $this->subjectNames($rows);
        $items = [];
        foreach ($rows as $f) {
            $name = $names[$f->subject_type][$f->subject_id] ?? null;
            if ($name === null) {
                continue;   // a subject this person may no longer see, or that is gone
            }
            if ($f->subject_type === 'lead' || $f->subject_type === 'opportunity') {
                $owner = $names['_owner'][$f->subject_type][$f->subject_id] ?? null;
                if ($owner !== (int) $user->id && ! $seeAll && (int) $f->owner_id !== (int) $user->id) {
                    continue;
                }
            }
            $items[] = $this->shape($f, $users[$f->owner_id] ?? null) + ['subject' => ['type' => $f->subject_type, 'id' => (int) $f->subject_id, 'name' => $name, 'url' => $this->url($f->subject_type, (int) $f->subject_id)]];
        }
        $c = collect($items);

        return ['items' => $items, 'counts' => ['late' => $c->where('late', true)->count(), 'today' => $c->where('today', true)->count(), 'later' => $c->where('late', false)->where('today', false)->count()], 'sees_all' => $seeAll];
    }

    /** Tell each owner, once a day, what is due or late. @return int how many people were told */
    public function remind(): int
    {
        if (! ProjectsSetup::relationships()) {
            return 0;
        }
        $today = now()->format('Y-m-d');
        $due = DB::table('project_follow_ups')->whereNull('done_at')->where('due_on', '<=', $today)->where(fn ($q) => $q->whereNull('reminded_on')->orWhere('reminded_on', '<', $today))->get()->groupBy('owner_id');
        $told = 0;
        foreach ($due as $ownerId => $rows) {
            $owner = User::find($ownerId);
            if (! $owner || ! $owner->hasPermission('projects.use')) {
                continue;
            }
            $late = $rows->where('due_on', '<', $today)->count();
            $todayN = $rows->count() - $late;
            $parts = array_filter([$late ? "{$late} late" : null, $todayN ? "{$todayN} due today" : null]);
            ProjectNotices::tell($owner, ProjectNotices::FOLLOW_UP, 'Your follow-ups: ' . implode(', ', $parts),
                "You have {$rows->count()} next " . ($rows->count() === 1 ? 'action' : 'actions') . ' to do. ' . $rows->sortBy('due_on')->take(5)->pluck('what')->implode('; ') . ($rows->count() > 5 ? '; and more.' : '.'),
                '/admin/projects/follow-ups', 'Open my follow-ups');
            DB::table('project_follow_ups')->whereIn('id', $rows->pluck('id'))->update(['reminded_on' => $today]);
            $told++;
        }

        return $told;
    }

    // ------------------------------------------------------------------ inside

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(array $d, User $by, ?object $f): array
    {
        $what = trim(preg_replace('/\s+/', ' ', (string) ($d['what'] ?? '')));
        if ($what === '') {
            throw new ProjectException('Say what the next action is.');
        }
        try {
            $due = \Carbon\Carbon::parse((string) ($d['due_on'] ?? ''))->format('Y-m-d');
        } catch (\Throwable) {
            throw new ProjectException('Give the next action a date.');
        }
        if (($d['due_on'] ?? '') === '' || ($d['due_on'] ?? null) === null) {
            throw new ProjectException('Give the next action a date.');
        }
        if ($due < now()->format('Y-m-d') && (! $f || $due !== $f->due_on)) {
            throw new ProjectException('Choose a date that has not passed.');
        }
        $owner = (int) ($d['owner_id'] ?? $by->id);
        if ($owner !== (int) ($f->owner_id ?? 0) && $owner !== (int) $by->id) {
            $o = User::find($owner);
            if (! $o || ! $o->hasPermission('projects.use') || ! $o->hasPermission('projects.interactions')) {
                throw new ProjectException('Give it to someone who can follow up relationships.');
            }
        }

        return ['what' => mb_substr($what, 0, 200), 'due_on' => $due, 'owner_id' => $owner];
    }

    /** @return array<string, mixed> */
    private function shape(object $f, ?string $owner): array
    {
        $today = now()->format('Y-m-d');
        $late = $f->due_on < $today;

        return ['id' => (int) $f->id, 'what' => $f->what, 'due_on' => $f->due_on, 'owner' => ['id' => (int) $f->owner_id, 'name' => $owner], 'late' => $late, 'today' => $f->due_on === $today,
            'days_late' => $late ? (int) \Carbon\Carbon::parse($f->due_on)->diffInDays(\Carbon\Carbon::parse($today)) : 0, 'subject_type' => $f->subject_type];
    }

    /** @return array<string, mixed> */
    private function subjectNames(\Illuminate\Support\Collection $rows): array
    {
        $ids = fn (string $t) => $rows->where('subject_type', $t)->pluck('subject_id')->unique()->all();
        $leads = DB::table('project_leads')->whereIn('id', $ids('lead'))->whereNull('deleted_at')->get(['id', 'name', 'owner_id']);
        $opps = DB::table('project_opportunities')->whereIn('id', $ids('opportunity'))->whereNull('deleted_at')->get(['id', 'title', 'owner_id']);
        $customers = DB::table('customers')->whereIn('id', $ids('customer'))->whereNull('deleted_at')->get(['id', 'company_name', 'first_name', 'last_name']);

        return ['lead' => $leads->pluck('name', 'id')->all(), 'opportunity' => $opps->pluck('title', 'id')->all(),
            'customer' => $customers->mapWithKeys(fn ($c) => [$c->id => $c->company_name ?: trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''))])->all(),
            '_owner' => ['lead' => $leads->pluck('owner_id', 'id')->map(fn ($v) => (int) $v)->all(), 'opportunity' => $opps->pluck('owner_id', 'id')->map(fn ($v) => (int) $v)->all()]];
    }

    private function url(string $type, int $id): string
    {
        return match ($type) { 'lead' => "/admin/projects/leads/{$id}", 'customer' => "/admin/projects/clients/{$id}", default => "/admin/projects/pipeline?open={$id}" };
    }
}
