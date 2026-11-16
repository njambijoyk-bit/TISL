<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The pipeline (docs/PROJECTS_STAGE3_SPEC.md, build 3.2): opportunities, each a piece of work a lead or a client might give, moving through
 * stages an owner defines. An opportunity is seen by its owner and by anyone who holds `projects.leads.view`; it is changed with
 * `projects.pipeline`.
 *
 * What one is worth: the total of the Books quotation linked to it, read from the books each time. Before there is a quotation it can carry
 * an estimate, which is a guess and never posted anywhere.
 */
class ProjectPipeline
{
    public function __construct(private ProjectLists $lists, private ProjectLeads $leads) {}

    // ------------------------------------------------------------------ stages

    /** @return array<int, array<string, mixed>> */
    public function stages(bool $onlyActive = false): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $open = DB::table('project_opportunities')->whereNull('deleted_at')->groupBy('stage_id')->selectRaw('stage_id, COUNT(*) as n')->pluck('n', 'stage_id');

        return DB::table('project_pipeline_stages')->when($onlyActive, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn ($s) => ['id' => (int) $s->id, 'key' => $s->key, 'name' => $s->name, 'kind' => $s->kind, 'is_active' => (bool) $s->is_active, 'opportunities' => (int) ($open[$s->id] ?? 0)])->all();
    }

    public function addStage(string $name, User $by): void
    {
        $name = $this->stageName($name, null);
        // a new stage goes just before Won, so the two ends stay the ends
        $won = (int) DB::table('project_pipeline_stages')->where('kind', 'won')->value('sort_order');
        DB::table('project_pipeline_stages')->where('sort_order', '>=', $won)->increment('sort_order', 10);
        $key = \Illuminate\Support\Str::slug($name, '_') ?: 'stage';
        for ($i = 2, $base = $key; DB::table('project_pipeline_stages')->where('key', $key)->exists(); $i++) {
            $key = "{$base}_{$i}";
        }
        $id = DB::table('project_pipeline_stages')->insertGetId(['key' => $key, 'name' => $name, 'kind' => 'open', 'is_active' => 1, 'sort_order' => $won, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'pipeline.stage_added', 'pipeline_stage', $id, null, ['name' => $name]);
    }

    /** @param array<string, mixed> $d name, is_active, move (up|down) */
    public function changeStage(int $id, array $d, User $by): void
    {
        $s = DB::table('project_pipeline_stages')->where('id', $id)->first();
        if (! $s) {
            throw new ProjectException('Not found.', 404);
        }
        if (isset($d['move'])) {
            if ($s->kind !== 'open') {
                throw new ProjectException('Won and Lost stay at the end.');
            }
            $other = DB::table('project_pipeline_stages')->where('kind', 'open')->where('sort_order', $d['move'] === 'up' ? '<' : '>', $s->sort_order)->orderBy('sort_order', $d['move'] === 'up' ? 'desc' : 'asc')->first();
            if ($other) {
                DB::table('project_pipeline_stages')->where('id', $s->id)->update(['sort_order' => $other->sort_order]);
                DB::table('project_pipeline_stages')->where('id', $other->id)->update(['sort_order' => $s->sort_order]);
            }

            return;
        }
        $new = [];
        if (array_key_exists('name', $d)) {
            $new['name'] = $this->stageName((string) $d['name'], $id);
        }
        if (array_key_exists('is_active', $d) && (bool) $d['is_active'] !== (bool) $s->is_active) {
            if (! $d['is_active']) {
                if ($s->kind !== 'open') {
                    throw new ProjectException('Won and Lost cannot be switched off.');
                }
                if (DB::table('project_opportunities')->where('stage_id', $id)->whereNull('deleted_at')->exists()) {
                    throw new ProjectException('There are opportunities at this stage. Move them first.');
                }
                if (DB::table('project_pipeline_stages')->where('kind', 'open')->where('is_active', 1)->count() <= 1) {
                    throw new ProjectException('The pipeline needs at least one stage before Won.');
                }
            }
            $new['is_active'] = $d['is_active'] ? 1 : 0;
        }
        if ($new) {
            DB::table('project_pipeline_stages')->where('id', $id)->update($new + ['updated_at' => now()]);
            ProjectLog::record(null, $by, 'pipeline.stage_changed', 'pipeline_stage', $id, array_intersect_key((array) $s, $new), $new);
        }
    }

    // ------------------------------------------------------------------ opportunities

    public function canSee(User $user, object $opp): bool
    {
        return (int) $opp->owner_id === (int) $user->id || $user->hasPermission('projects.leads.view');
    }

    public function find(int $id, User $user, bool $toChange = false): object
    {
        $o = ProjectsSetup::relationships() ? DB::table('project_opportunities')->where('id', $id)->whereNull('deleted_at')->first() : null;
        if (! $o || ! $this->canSee($user, $o)) {
            throw new ProjectException('Not found.', 404);
        }
        if ($toChange && ! $user->hasPermission('projects.pipeline')) {
            ProjectLog::refused(null, $user, 'opportunity.change', 'Does not hold projects.pipeline', 'opportunity', $id);
            throw new ProjectException('You may not work the pipeline.', 403);
        }

        return $o;
    }

    /**
     * The board: every stage with its opportunities. Won and Lost show the last 30 days.
     *
     * @param array<string, mixed> $f scope (mine|all), q
     * @return array<string, mixed>
     */
    public function board(User $user, array $f): array
    {
        $stages = $this->stages(true);
        if (! $stages) {
            return ['stages' => [], 'open' => 0, 'sees_all' => false];
        }
        $seeAll = $user->hasPermission('projects.leads.view');
        $q = DB::table('project_opportunities')->whereNull('deleted_at')->when(! $seeAll || ($f['scope'] ?? 'mine') === 'mine', fn ($w) => $w->where('owner_id', $user->id))
            ->where(fn ($w) => $w->whereNull('closed_at')->orWhere('closed_at', '>', now()->subDays(30)));
        if (($term = trim((string) ($f['q'] ?? ''))) !== '') {
            $q->where('title', 'like', '%' . str_replace(['%', '_'], ['\%', '\_'], $term) . '%');
        }
        $rows = $this->present($q->orderByRaw('expected_on IS NULL')->orderBy('expected_on')->orderByDesc('id')->limit(500)->get(), $user);
        $by = collect($rows)->groupBy(fn ($o) => $o['stage']['id']);
        $open = 0;
        foreach ($stages as &$s) {
            $s['items'] = ($by[$s['id']] ?? collect())->values()->all();
            $s['totals'] = $this->totals($s['items']);
            $open += $s['kind'] === 'open' ? count($s['items']) : 0;
        }

        return ['stages' => $stages, 'open' => $open, 'sees_all' => $seeAll];
    }

    /** @return array<string, mixed> */
    public function show(object $opp, User $user): array
    {
        return $this->present(collect([$opp]), $user)[0] + ['notes' => $opp->notes];
    }

    /** The opportunities of one lead or one client, for their pages. @return array<int, array<string, mixed>> */
    public function of(string $type, int $id, User $user): array
    {
        if (! ProjectsSetup::relationships()) {
            return [];
        }
        $rows = DB::table('project_opportunities')->whereNull('deleted_at')->where($type === 'lead' ? 'lead_id' : 'customer_id', $id)->orderByDesc('id')->limit(100)->get()->filter(fn ($o) => $this->canSee($user, $o));

        return $this->present($rows->values(), $user);
    }

    /** @param array<string, mixed> $d */
    public function create(array $d, User $by): int
    {
        if (! ProjectsSetup::relationships()) {
            throw new ProjectException('This needs database script 259. Run it first.', 409);
        }
        $values = $this->values($d, null, $by);
        $first = DB::table('project_pipeline_stages')->where('kind', 'open')->where('is_active', 1)->orderBy('sort_order')->value('id');
        $id = DB::table('project_opportunities')->insertGetId($values + ['stage_id' => $first, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'opportunity.created', 'opportunity', $id, null, ['title' => $values['title']]);
        if ($values['lead_id']) {
            DB::table('project_leads')->where('id', $values['lead_id'])->where('status', 'new')->update(['status' => 'working', 'updated_at' => now()]);   // a lead with an opportunity is being worked
        }

        return $id;
    }

    /** @param array<string, mixed> $d */
    public function update(object $opp, array $d, User $by): void
    {
        $this->open($opp);
        $new = $this->values($d + (array) $opp, $opp, $by);
        $changed = array_filter($new, fn ($v, $k) => (string) ($opp->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if ($changed) {
            DB::table('project_opportunities')->where('id', $opp->id)->update($changed + ['updated_at' => now()]);
            ProjectLog::record(null, $by, 'opportunity.changed', 'opportunity', (int) $opp->id, array_intersect_key((array) $opp, $changed), $changed);
        }
    }

    /** Move to another stage. Lost needs a reason. Won is not done here: winning makes a client and can start the project (ProjectWins). */
    public function move(object $opp, int $stageId, mixed $reasonId, User $by): void
    {
        $to = DB::table('project_pipeline_stages')->where('id', $stageId)->where('is_active', 1)->first();
        if (! $to) {
            throw new ProjectException('Choose a stage from the pipeline.');
        }
        $from = DB::table('project_pipeline_stages')->where('id', $opp->stage_id)->first();
        if ($from && $from->kind === 'won') {
            throw new ProjectException('This was won. It cannot go back into the pipeline.');
        }
        if ($to->kind === 'won') {
            throw new ProjectException('Winning is its own step: it makes the client and can start the work.');
        }
        if ((int) $to->id === (int) $opp->stage_id) {
            return;
        }
        $values = ['stage_id' => $to->id, 'lost_reason_id' => null, 'closed_at' => null];
        if ($to->kind === 'lost') {
            $values['lost_reason_id'] = (int) $this->lists->need('lost_reason', $reasonId, 'why it was lost')->id;
            $values['closed_at'] = now();
        }
        DB::table('project_opportunities')->where('id', $opp->id)->update($values + ['updated_at' => now()]);
        ProjectLog::record(null, $by, 'opportunity.moved', 'opportunity', (int) $opp->id, ['stage' => $from->name ?? null], ['stage' => $to->name, 'why' => $this->lists->name($values['lost_reason_id'])]);
    }

    /** What the form offers. @return array<string, mixed> */
    public function options(): array
    {
        return [
            'types' => DB::table('project_types as t')->join('project_industries as i', 'i.key', '=', 't.industry_key')->where('t.is_active', 1)->where('i.is_active', 1)->orderBy('i.sort_order')->orderBy('t.name')
                ->get(['t.id', 't.name', 'i.name as industry'])->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'industry' => $t->industry])->all(),
            'owners' => app(\App\Services\Notify\Staff::class)->holding('projects.pipeline')->filter(fn ($u) => $u->hasPermission('projects.use'))->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all(),
            'lost_reasons' => $this->lists->of('lost_reason', true),
            'stages' => array_values(array_map(fn ($s) => ['id' => $s['id'], 'name' => $s['name'], 'kind' => $s['kind']], $this->stages(true))),
            'books' => Schema::hasTable('vouchers'),
        ];
    }

    /** Vouchers to link as the quotation, for someone who may see the books. @return array<int, array<string, mixed>> */
    public function findQuotations(string $q, User $user): array
    {
        $type = app(ProjectLinkTypes::class)->get('books.voucher');

        return $type && $user->hasPermission('books.view') ? ($type['search'])($q) : [];
    }

    // ------------------------------------------------------------------ inside

    private function open(object $opp): void
    {
        if ($opp->closed_at !== null && DB::table('project_pipeline_stages')->where('id', $opp->stage_id)->value('kind') === 'won') {
            throw new ProjectException('This was won. Change the work it became instead.');
        }
    }

    private function stageName(string $name, ?int $except): string
    {
        $name = trim(preg_replace('/\s+/', ' ', $name));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new ProjectException('Give the stage a name of up to 80 characters.');
        }
        if (DB::table('project_pipeline_stages')->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->when($except, fn ($q) => $q->where('id', '!=', $except))->exists()) {
            throw new ProjectException('The pipeline already has a stage with that name.');
        }

        return $name;
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function values(array $d, ?object $opp, User $by): array
    {
        $title = trim(preg_replace('/\s+/', ' ', (string) ($d['title'] ?? '')));
        if ($title === '') {
            throw new ProjectException('Say what the work is.');
        }
        $leadId = ($d['lead_id'] ?? null) ? (int) $d['lead_id'] : null;
        $customerId = ($d['customer_id'] ?? null) ? (int) $d['customer_id'] : null;
        if (! $opp) {
            if (($leadId === null) === ($customerId === null)) {
                throw new ProjectException('Say who it is for: a lead, or a client.');
            }
            if ($leadId) {
                $lead = $this->leads->find($leadId, $by);
                if ($lead->status === 'won' && $lead->customer_id) {   // already a client: the opportunity belongs to the client
                    $customerId = (int) $lead->customer_id;
                } elseif ($lead->status === 'lost') {
                    throw new ProjectException('That lead was lost. Bring it back first.');
                }
            } elseif (! DB::table('customers')->where('id', $customerId)->whereNull('deleted_at')->exists()) {
                throw new ProjectException('Choose the client from the list.');
            }
        } else {
            [$leadId, $customerId] = [$opp->lead_id ? (int) $opp->lead_id : null, $opp->customer_id ? (int) $opp->customer_id : null];   // who it is for does not change
        }
        $typeId = ($d['type_id'] ?? null) ? (int) $d['type_id'] : null;
        if ($typeId && $typeId !== (int) ($opp->type_id ?? 0) && ! DB::table('project_types')->where('id', $typeId)->where('is_active', 1)->exists()) {
            throw new ProjectException('Choose a kind of work that is switched on.');
        }
        $owner = (int) ($d['owner_id'] ?? $by->id);
        if ($owner !== (int) ($opp->owner_id ?? 0)) {
            $o = User::find($owner);
            if (! $o || ! $o->hasPermission('projects.use') || ! $o->hasPermission('projects.pipeline')) {
                throw new ProjectException('Give it to someone who can work the pipeline.');
            }
        }
        $expected = null;
        if (($d['expected_on'] ?? null) !== null && $d['expected_on'] !== '') {
            try {
                $expected = \Carbon\Carbon::parse((string) $d['expected_on'])->format('Y-m-d');
            } catch (\Throwable) {
                throw new ProjectException('That is not a date.');
            }
        }
        $estimate = ($d['estimate'] ?? null) === null || $d['estimate'] === '' ? null : $d['estimate'];
        if ($estimate !== null && (! is_numeric($estimate) || (float) $estimate < 0 || (float) $estimate > 9999999999999)) {
            throw new ProjectException('The estimate is a number, zero or more.');
        }
        $currency = $estimate === null ? null : (mb_strtoupper(trim((string) ($d['estimate_currency'] ?? ''))) ?: null);
        if ($currency !== null && ! preg_match('/^[A-Z]{3}$/', $currency)) {
            throw new ProjectException('Give the currency as three letters, like KES.');
        }
        $voucher = ($d['quotation_voucher_id'] ?? null) ? (int) $d['quotation_voucher_id'] : null;
        if ($voucher && $voucher !== (int) ($opp->quotation_voucher_id ?? 0)) {
            $type = app(ProjectLinkTypes::class)->get('books.voucher');
            if (! $type || ! $by->hasPermission('books.view') || ! isset(($type['describe'])([$voucher])[$voucher])) {
                throw new ProjectException('Choose a quotation from the books.');
            }
        }
        $notes = trim((string) ($d['notes'] ?? ''));

        return ['title' => mb_substr($title, 0, 160), 'lead_id' => $leadId, 'customer_id' => $customerId, 'type_id' => $typeId, 'owner_id' => $owner, 'expected_on' => $expected,
            'estimate' => $estimate === null ? null : number_format((float) $estimate, 2, '.', ''), 'estimate_currency' => $currency, 'quotation_voucher_id' => $voucher, 'notes' => $notes === '' ? null : mb_substr($notes, 0, 5000)];
    }

    /** @param Collection<int, object> $rows @return array<int, array<string, mixed>> */
    public function present(Collection $rows, User $user): array
    {
        $stages = DB::table('project_pipeline_stages')->get()->keyBy('id');
        $users = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->unique())->pluck('name', 'id');
        $leads = DB::table('project_leads')->whereIn('id', $rows->pluck('lead_id')->filter()->unique())->pluck('name', 'id');
        $customers = DB::table('customers')->whereIn('id', $rows->pluck('customer_id')->filter()->unique())->get(['id', 'company_name', 'first_name', 'last_name'])->keyBy('id');
        $types = DB::table('project_types')->whereIn('id', $rows->pluck('type_id')->filter()->unique())->pluck('name', 'id');
        $projects = DB::table('projects')->whereIn('id', $rows->pluck('project_id')->filter()->unique())->get(['id', 'number', 'confidential'])->keyBy('id');
        $reasons = DB::table('project_lists')->whereIn('id', $rows->pluck('lost_reason_id')->filter()->unique())->pluck('name', 'id');
        // the value is read from the books every time, and only for someone who may see the books
        $voucherIds = $rows->pluck('quotation_voucher_id')->filter()->unique()->values()->all();
        $type = app(ProjectLinkTypes::class)->get('books.voucher');
        $vouchers = $voucherIds && $type && $user->hasPermission('books.view') ? ($type['describe'])($voucherIds) : [];
        $next = app(ProjectFollowUps::class)->nextFor('opportunity', $rows->pluck('id')->all());

        return $rows->map(function ($o) use ($stages, $users, $leads, $customers, $types, $projects, $reasons, $vouchers, $next, $user) {
            $c = $o->customer_id ? ($customers[$o->customer_id] ?? null) : null;
            $for = $c ? ['type' => 'client', 'id' => (int) $c->id, 'name' => $c->company_name ?: trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''))]
                : ['type' => 'lead', 'id' => (int) $o->lead_id, 'name' => $leads[$o->lead_id] ?? null];
            $v = $o->quotation_voucher_id ? ($vouchers[$o->quotation_voucher_id] ?? null) : null;
            $value = $v ? ['amount' => $v['amount'], 'currency' => $v['currency'], 'from' => 'quotation', 'title' => $v['title'], 'url' => $v['url']]
                : ($o->quotation_voucher_id ? ['amount' => null, 'currency' => null, 'from' => 'quotation', 'title' => 'A quotation in the books', 'url' => null]   // linked, but this person may not see the books
                    : ($o->estimate !== null ? ['amount' => (float) $o->estimate, 'currency' => $o->estimate_currency, 'from' => 'estimate', 'title' => null, 'url' => null] : null));
            $s = $stages[$o->stage_id] ?? null;
            $p = $o->project_id ? ($projects[$o->project_id] ?? null) : null;

            return ['id' => (int) $o->id, 'title' => $o->title, 'for' => $for, 'kind' => $o->type_id ? ['id' => (int) $o->type_id, 'name' => $types[$o->type_id] ?? null] : null,
                'stage' => ['id' => (int) $o->stage_id, 'key' => $s->key ?? null, 'name' => $s->name ?? null, 'kind' => $s->kind ?? 'open'],
                'owner' => ['id' => (int) $o->owner_id, 'name' => $users[$o->owner_id] ?? null], 'expected_on' => $o->expected_on, 'value' => $value,
                'estimate' => $o->estimate === null ? null : (float) $o->estimate, 'estimate_currency' => $o->estimate_currency, 'quotation_voucher_id' => $o->quotation_voucher_id ? (int) $o->quotation_voucher_id : null,
                'project' => $p ? ['id' => (int) $p->id, 'number' => $p->number] : null, 'lost_reason' => $reasons[$o->lost_reason_id] ?? null, 'closed_at' => $o->closed_at,
                'next' => $next[(int) $o->id] ?? null, 'can' => ['change' => $user->hasPermission('projects.pipeline')]];
        })->values()->all();
    }

    /** @param array<int, array<string, mixed>> $items @return array<int, array{currency: ?string, amount: float, estimated: bool}> one total per currency */
    private function totals(array $items): array
    {
        $out = [];
        foreach ($items as $o) {
            if (! $o['value'] || $o['value']['amount'] === null) {
                continue;
            }
            $k = (string) $o['value']['currency'];
            $out[$k] ??= ['currency' => $o['value']['currency'], 'amount' => 0.0, 'estimated' => false];
            $out[$k]['amount'] += $o['value']['amount'];
            $out[$k]['estimated'] = $out[$k]['estimated'] || $o['value']['from'] === 'estimate';
        }

        return array_values($out);
    }
}
