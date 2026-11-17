<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The history (docs/PROJECTS_STAGE3_SPEC.md, build 3.4): calls, meetings, visits, emails and notes with a lead, a client or another party,
 * optionally with one of their contacts and about one piece of work. An entry about a confidential piece of work is seen only by the people
 * on it. An entry marked team-only is never shown to the client, whatever a later stage shares. Only the person who wrote an entry changes it.
 */
class ProjectInteractions
{
    public const KINDS = ['call' => 'Call', 'meeting' => 'Meeting', 'visit' => 'Visit', 'email' => 'Email', 'note' => 'Note'];

    public function __construct(private ProjectRelations $relations) {}

    /** @return array<int, array<string, mixed>> newest first */
    public function of(string $type, int $id, User $user, int $limit = 100): array
    {
        if (! ProjectsSetup::relationships() || $type === 'opportunity') {
            return $type === 'opportunity' ? $this->ofOpportunity($id, $user) : [];
        }

        return $this->present(DB::table('project_interactions')->where('subject_type', $type)->where('subject_id', $id)->whereNull('deleted_at')->orderByDesc('happened_at')->orderByDesc('id')->limit($limit)->get(), $user);
    }

    /** @param array<string, mixed> $d kind, summary, happened_at, contact_id, project_id, opportunity_id, team_only */
    public function add(string $type, int $id, array $d, User $by): int
    {
        if ($type === 'opportunity') {   // what is said about an opportunity is said to the lead or client it is for
            $o = DB::table('project_opportunities')->where('id', $id)->first();
            [$type, $id, $d['opportunity_id']] = $o->customer_id ? ['customer', (int) $o->customer_id, $id] : ['lead', (int) $o->lead_id, $id];
        }
        $values = $this->values($type, $id, $d, $by);
        $iid = DB::table('project_interactions')->insertGetId($values + ['subject_type' => $type, 'subject_id' => $id, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record($values['project_id'], $by, 'history.added', 'interaction', $iid, null, ['kind' => self::KINDS[$values['kind']], 'with' => $type]);

        return $iid;
    }

    public function find(int $id, User $user, bool $toChange): object
    {
        $i = ProjectsSetup::relationships() ? DB::table('project_interactions')->where('id', $id)->whereNull('deleted_at')->first() : null;
        if (! $i || ! $this->relations->mayReadAbout($i->project_id ? (int) $i->project_id : null, $user)) {
            throw new ProjectException('Not found.', 404);
        }
        $this->relations->authorize($i->subject_type, (int) $i->subject_id, $user, $toChange);
        if ($toChange && (int) $i->created_by !== (int) $user->id) {
            throw new ProjectException('Only the person who wrote it can change it.', 403);
        }

        return $i;
    }

    /** @param array<string, mixed> $d */
    public function change(object $i, array $d, User $by): void
    {
        $values = $this->values($i->subject_type, (int) $i->subject_id, $d + ['kind' => $i->kind, 'summary' => $i->summary, 'happened_at' => $i->happened_at, 'contact_id' => $i->contact_id, 'project_id' => $i->project_id, 'opportunity_id' => $i->opportunity_id, 'team_only' => $i->team_only], $by);
        DB::table('project_interactions')->where('id', $i->id)->update($values + ['updated_at' => now()]);
        ProjectLog::record($values['project_id'], $by, 'history.changed', 'interaction', (int) $i->id);
    }

    public function remove(object $i, User $by): void
    {
        DB::table('project_interactions')->where('id', $i->id)->update(['deleted_at' => now()]);
        ProjectLog::record($i->project_id ? (int) $i->project_id : null, $by, 'history.removed', 'interaction', (int) $i->id, ['kind' => $i->kind, 'summary' => mb_substr($i->summary, 0, 120)], null);
    }

    /** The most recent entry of each subject. @param int[] $ids @return array<int, string> id => when */
    public function lastFor(string $type, array $ids): array
    {
        if (! $ids || ! ProjectsSetup::relationships()) {
            return [];
        }

        return DB::table('project_interactions')->where('subject_type', $type)->whereIn('subject_id', $ids)->whereNull('deleted_at')->groupBy('subject_id')->selectRaw('subject_id, MAX(happened_at) as at')->pluck('at', 'subject_id')->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function ofOpportunity(int $id, User $user): array
    {
        return $this->present(DB::table('project_interactions')->where('opportunity_id', $id)->whereNull('deleted_at')->orderByDesc('happened_at')->limit(100)->get(), $user);
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(string $type, int $id, array $d, User $by): array
    {
        $kind = (string) ($d['kind'] ?? '');
        if (! isset(self::KINDS[$kind])) {
            throw new ProjectException('Say what it was: a call, a meeting, a visit, an email or a note.');
        }
        $summary = trim((string) ($d['summary'] ?? ''));
        if ($summary === '') {
            throw new ProjectException('Say what was said or done.');
        }
        try {
            $at = ($d['happened_at'] ?? null) ? \Carbon\Carbon::parse((string) $d['happened_at']) : now();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
        if ($at->isAfter(now()->addMinutes(5))) {
            throw new ProjectException('The history is what has happened. For something still to do, set a next action.');
        }
        $contactId = ($d['contact_id'] ?? null) ? (int) $d['contact_id'] : null;
        if ($contactId && ! DB::table('project_contacts')->where('id', $contactId)->where('owner_type', $type)->where('owner_id', $id)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('Choose one of their own contacts.');
        }
        $projectId = ($d['project_id'] ?? null) ? (int) $d['project_id'] : null;
        if ($projectId) {
            $p = DB::table('projects')->where('id', $projectId)->whereNull('deleted_at')->first();
            if (! $p || ! app(ProjectAccess::class)->base($by, 'open', $p)['allowed']) {
                throw new ProjectException('Choose a piece of work you can open.');
            }
        }

        return ['kind' => $kind, 'summary' => mb_substr($summary, 0, 5000), 'happened_at' => $at->format('Y-m-d H:i:s'), 'contact_id' => $contactId, 'project_id' => $projectId,
            'opportunity_id' => ($d['opportunity_id'] ?? null) ? (int) $d['opportunity_id'] : null, 'team_only' => empty($d['team_only']) ? 0 : 1];
    }

    /** @param \Illuminate\Support\Collection<int, object> $rows @return array<int, array<string, mixed>> */
    private function present(\Illuminate\Support\Collection $rows, User $user): array
    {
        $rows = $rows->filter(fn ($i) => $this->relations->mayReadAbout($i->project_id ? (int) $i->project_id : null, $user))->values();
        $users = DB::table('users')->whereIn('id', $rows->pluck('created_by')->filter()->unique())->pluck('name', 'id');
        $contacts = DB::table('project_contacts')->whereIn('id', $rows->pluck('contact_id')->filter()->unique())->pluck('name', 'id');
        $projects = DB::table('projects')->whereIn('id', $rows->pluck('project_id')->filter()->unique())->pluck('number', 'id');
        $opps = DB::table('project_opportunities')->whereIn('id', $rows->pluck('opportunity_id')->filter()->unique())->pluck('title', 'id');

        return $rows->map(fn ($i) => ['id' => (int) $i->id, 'kind' => $i->kind, 'kind_name' => self::KINDS[$i->kind] ?? $i->kind, 'summary' => $i->summary, 'happened_at' => $i->happened_at,
            'by' => $users[$i->created_by] ?? null, 'contact' => $i->contact_id ? ['id' => (int) $i->contact_id, 'name' => $contacts[$i->contact_id] ?? null] : null,
            'project' => $i->project_id ? ['id' => (int) $i->project_id, 'number' => $projects[$i->project_id] ?? null] : null,
            'opportunity' => $i->opportunity_id ? ['id' => (int) $i->opportunity_id, 'title' => $opps[$i->opportunity_id] ?? null] : null,
            'team_only' => (bool) $i->team_only, 'mine' => (int) $i->created_by === (int) $user->id])->all();
    }
}
