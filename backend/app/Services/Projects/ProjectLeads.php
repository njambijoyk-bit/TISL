<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Leads (docs/PROJECTS_STAGE3_SPEC.md, build 3.1): people and companies that are not clients yet. A lead lives only here: it is not a row of
 * `customers` and Books never hears of it until it is won. A lead is seen by its owner and by anyone who holds `projects.leads.view`;
 * it is changed by someone who holds `projects.leads.manage` and can see it.
 */
class ProjectLeads
{
    public const STATUSES = ['new' => 'New', 'working' => 'Working', 'won' => 'Won', 'lost' => 'Lost'];

    public function __construct(private ProjectLists $lists) {}

    public function canSee(User $user, object $lead): bool
    {
        return (int) $lead->owner_id === (int) $user->id || $user->hasPermission('projects.leads.view');
    }

    /** The lead, or "not found" for someone who may not see it (so its existence is not given away). */
    public function find(int $id, User $user, bool $toChange = false): object
    {
        $lead = ProjectsSetup::relationships() ? DB::table('project_leads')->where('id', $id)->whereNull('deleted_at')->first() : null;
        if (! $lead || ! $this->canSee($user, $lead)) {
            throw new ProjectException('Not found.', 404);
        }
        if ($toChange && ! $user->hasPermission('projects.leads.manage')) {
            ProjectLog::refused(null, $user, 'lead.change', 'Does not hold projects.leads.manage', 'lead', $id);
            throw new ProjectException('You may not change leads.', 403);
        }

        return $lead;
    }

    /**
     * @param array<string, mixed> $f scope (mine|all), status (open|new|working|won|lost), q, page, per_page
     * @return array<string, mixed>
     */
    public function list(User $user, array $f): array
    {
        if (! ProjectsSetup::relationships()) {
            return ['data' => [], 'total' => 0, 'page' => 1, 'per_page' => 25, 'counts' => array_fill_keys(array_keys(self::STATUSES), 0)];
        }
        $seeAll = $user->hasPermission('projects.leads.view');
        $base = fn () => DB::table('project_leads as l')->whereNull('l.deleted_at')->when(! $seeAll || ($f['scope'] ?? 'mine') === 'mine', fn ($q) => $q->where('l.owner_id', $user->id));
        $q = $base();
        $status = (string) ($f['status'] ?? 'open');
        $status === 'open' ? $q->whereIn('l.status', ['new', 'working']) : (isset(self::STATUSES[$status]) ? $q->where('l.status', $status) : null);
        if (($term = trim((string) ($f['q'] ?? ''))) !== '') {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $term) . '%';
            $q->where(fn ($w) => $w->where('l.name', 'like', $like)->orWhere('l.contact_name', 'like', $like)->orWhere('l.email', 'like', $like)->orWhere('l.phone', 'like', $like));
        }
        $per = min(100, max(5, (int) ($f['per_page'] ?? 25)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $total = (clone $q)->count();
        $rows = $q->orderByRaw("CASE l.status WHEN 'new' THEN 0 WHEN 'working' THEN 1 WHEN 'won' THEN 2 ELSE 3 END")->orderByDesc('l.id')->forPage($page, $per)->get(['l.*']);
        $counts = $base()->groupBy('l.status')->selectRaw('l.status, COUNT(*) as n')->pluck('n', 'status');

        return ['data' => $this->present($rows), 'total' => $total, 'page' => $page, 'per_page' => $per,
            'counts' => array_map(fn ($s) => (int) ($counts[$s] ?? 0), array_combine(array_keys(self::STATUSES), array_keys(self::STATUSES))), 'sees_all' => $seeAll];
    }

    /** @return array<string, mixed> */
    public function show(object $lead, User $user): array
    {
        return $this->present(collect([$lead]))[0] + ['notes' => $lead->notes, 'can' => ['change' => $user->hasPermission('projects.leads.manage')]];
    }

    /** @param array<string, mixed> $d @return int */
    public function create(array $d, User $by): int
    {
        if (! ProjectsSetup::relationships()) {
            throw new ProjectException('This needs database script 259. Run it first.', 409);
        }
        $values = $this->values($d, null, $by);
        $id = DB::table('project_leads')->insertGetId($values + ['status' => 'new', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'lead.created', 'lead', $id, null, ['name' => $values['name'], 'source' => $this->lists->name($values['source_id'])]);

        return $id;
    }

    /** @param array<string, mixed> $d */
    public function update(object $lead, array $d, User $by): void
    {
        $this->open($lead);
        $new = $this->values($d + (array) $lead, $lead, $by);
        $changed = array_filter($new, fn ($v, $k) => (string) ($lead->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if (! $changed) {
            return;
        }
        DB::table('project_leads')->where('id', $lead->id)->update($changed + ['updated_at' => now()]);
        ProjectLog::record(null, $by, 'lead.changed', 'lead', (int) $lead->id, array_intersect_key((array) $lead, $changed), $changed);
    }

    /** Working, lost (with a reason from the list), or back to working after being lost. Won is not set here: winning makes a client (ProjectWins). */
    public function setStatus(object $lead, string $status, mixed $reasonId, ?string $note, User $by): void
    {
        if ($lead->status === 'won') {
            throw new ProjectException('This lead was won and is a client now. Work with the client instead.');
        }
        if (! in_array($status, ['new', 'working', 'lost'], true)) {
            throw new ProjectException('A lead can be new, working or lost. It is won by winning an opportunity or by making it a client.');
        }
        $values = ['status' => $status, 'lost_reason_id' => null, 'lost_note' => null];
        if ($status === 'lost') {
            $values['lost_reason_id'] = (int) $this->lists->need('lost_reason', $reasonId, 'why it was lost')->id;
            $values['lost_note'] = ($n = trim((string) $note)) === '' ? null : mb_substr($n, 0, 200);
        }
        if ($lead->status === $status && (int) $lead->lost_reason_id === (int) $values['lost_reason_id']) {
            return;
        }
        DB::table('project_leads')->where('id', $lead->id)->update($values + ['updated_at' => now()]);
        ProjectLog::record(null, $by, 'lead.' . $status, 'lead', (int) $lead->id, ['status' => $lead->status], ['status' => $status, 'why' => $this->lists->name($values['lost_reason_id']), 'note' => $values['lost_note']]);
    }

    /** People a lead can be given to: anyone who can work leads. @return array<int, array{id: int, name: string}> */
    public function owners(): array
    {
        return app(\App\Services\Notify\Staff::class)->holding('projects.leads.manage')->filter(fn ($u) => $u->hasPermission('projects.use'))->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all();
    }

    // ------------------------------------------------------------------ inside

    private function open(object $lead): void
    {
        if ($lead->status === 'won') {
            throw new ProjectException('This lead was won and is a client now. Change the client instead.');
        }
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(array $d, ?object $lead, User $by): array
    {
        $line = fn (string $k, int $max) => ($v = trim(preg_replace('/\s+/', ' ', (string) ($d[$k] ?? '')))) === '' ? null : mb_substr($v, 0, $max);
        $name = $line('name', 160);
        if ($name === null) {
            throw new ProjectException('Give the lead a name: the company, or the person.');
        }
        $email = $line('email', 160);
        if ($email !== null && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ProjectException('That is not an email address.');
        }
        $source = ($d['source_id'] ?? null) ? (int) ((int) ($lead->source_id ?? 0) === (int) $d['source_id'] ? $d['source_id'] : $this->lists->need('source', $d['source_id'], 'where they came from')->id) : null;
        $referred = ($d['referred_by_customer_id'] ?? null) ? (int) $d['referred_by_customer_id'] : null;
        if ($referred && ! DB::table('customers')->where('id', $referred)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('Choose the client who referred them from the list.');
        }
        $industry = $line('industry_key', 40);
        if ($industry !== null && ! DB::table('project_industries')->where('key', $industry)->exists()) {
            throw new ProjectException('Choose an industry from the list.');
        }
        $owner = (int) ($d['owner_id'] ?? $by->id);
        if ($owner !== (int) ($lead->owner_id ?? 0)) {
            $o = User::find($owner);
            if (! $o || ! $o->hasPermission('projects.use') || ! $o->hasPermission('projects.leads.manage')) {
                throw new ProjectException('Give it to someone who can work leads.');
            }
        }
        $notes = trim((string) ($d['notes'] ?? ''));

        return ['name' => $name, 'contact_name' => $line('contact_name', 120), 'email' => $email === null ? null : mb_strtolower($email), 'phone' => ProjectDuplicates::phone($d['phone'] ?? null), 'industry_key' => $industry,
            'source_id' => $source, 'referred_by_customer_id' => $referred, 'owner_id' => $owner, 'notes' => $notes === '' ? null : mb_substr($notes, 0, 5000)];
    }

    /** @param \Illuminate\Support\Collection<int, object> $rows @return array<int, array<string, mixed>> */
    private function present(\Illuminate\Support\Collection $rows): array
    {
        $users = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->unique())->pluck('name', 'id');
        $lists = DB::table('project_lists')->whereIn('id', $rows->pluck('source_id')->merge($rows->pluck('lost_reason_id'))->filter()->unique())->pluck('name', 'id');
        $refs = DB::table('customers')->whereIn('id', $rows->pluck('referred_by_customer_id')->filter()->unique())->get(['id', 'company_name', 'first_name', 'last_name'])->keyBy('id');
        $refName = fn ($id) => ($c = $refs[$id] ?? null) ? ($c->company_name ?: trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''))) : null;
        $extra = app(ProjectFollowUps::class)->nextFor('lead', $rows->pluck('id')->all());

        return $rows->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name, 'contact_name' => $l->contact_name, 'email' => $l->email, 'phone' => $l->phone, 'industry' => $l->industry_key,
            'source' => $l->source_id ? ['id' => (int) $l->source_id, 'name' => $lists[$l->source_id] ?? null] : null,
            'referred_by' => $l->referred_by_customer_id ? ['id' => (int) $l->referred_by_customer_id, 'name' => $refName($l->referred_by_customer_id)] : null,
            'owner' => ['id' => (int) $l->owner_id, 'name' => $users[$l->owner_id] ?? null], 'status' => $l->status,
            'lost' => $l->status === 'lost' ? ['reason' => $lists[$l->lost_reason_id] ?? null, 'note' => $l->lost_note] : null,
            'customer_id' => $l->customer_id ? (int) $l->customer_id : null, 'created_at' => $l->created_at,
            'next' => $extra[(int) $l->id] ?? null])->values()->all();
    }
}
