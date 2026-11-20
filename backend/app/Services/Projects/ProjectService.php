<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The project record: starting one, changing it, moving it through its stages, putting it on hold, closing, freezing. One structure for every
 * industry: a Matter, a Contract and a Job are rows of the same table, told apart by their industry and kind of work.
 *
 * No amount of money is ever kept here. What a project is worth, costs and earns is read from the vouchers that carry its cost centre.
 * Who may do what is asked of ProjectAccess before every change, and every change is written to the project log with the old and new values.
 */
class ProjectService
{
    public const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    public const STATES = ['open', 'on_hold', 'closed', 'cancelled'];

    /** the columns a person may change after a project exists (its industry, kind of work, number, branch and lead are set when it starts) */
    private const EDITABLE = ['title', 'description', 'customer_id', 'priority', 'reference', 'authority', 'place', 'start_date', 'due_date', 'closing_period_ends'];

    public function __construct(private ProjectAccess $access, private ProjectCostCentres $costCentres, private Authorizer $authorizer) {}

    /**
     * The settings and the names are asked for when they are needed, never kept: they remember what they read for the length of one request, and a
     * service that outlived a request (a long-running worker) would otherwise go on using a default industry someone has since changed.
     */
    private function settings(): ProjectSettings
    {
        return app(ProjectSettings::class);
    }

    private function names(): ProjectNames
    {
        return app(ProjectNames::class);
    }

    // ------------------------------------------------------------------ reading

    public function find(int $id): object
    {
        $p = ProjectsSetup::ready() ? DB::table('projects')->where('id', $id)->first() : null;
        if (! $p) {
            throw new ProjectException('Not found.', 404);
        }

        return $p;
    }

    /** Find a project this person may do `ability` on, or stop. */
    public function findFor(User $user, int $id, string $ability = 'open'): object
    {
        $p = $this->find($id);
        $this->access->authorize($user, $ability, $p);

        return $p;
    }

    /**
     * The list a person sees: the projects they are on, and with `projects.view_all` every one that is not confidential.
     *
     * @param array<string, mixed> $f scope (mine|all), state, type_id, stage_id, lead_user_id, industry, q, page, per_page
     * @return array{data: array<int, array<string, mixed>>, total: int, page: int, per_page: int, counts: array<string, int>}
     */
    public function list(User $user, array $f): array
    {
        if (! ProjectsSetup::ready()) {
            return ['data' => [], 'total' => 0, 'page' => 1, 'per_page' => 25, 'counts' => array_fill_keys(self::STATES, 0)];
        }
        $base = fn () => $this->access->visible(DB::table('projects as p'), $user, ($f['scope'] ?? 'mine') === 'mine');
        $counts = array_fill_keys(self::STATES, 0);
        foreach ($base()->selectRaw('p.state, COUNT(*) AS n')->groupBy('p.state')->pluck('n', 'state') as $state => $n) {
            $counts[$state] = (int) $n;
        }

        $q = $base();
        if (! empty($f['state'])) {
            $f['state'] === 'active' ? $q->whereIn('p.state', ['open', 'on_hold']) : $q->where('p.state', $f['state']);
        }
        foreach (['type_id', 'stage_id', 'lead_user_id', 'customer_id'] as $k) {
            if (! empty($f[$k])) {
                $q->where("p.{$k}", (int) $f[$k]);
            }
        }
        if (! empty($f['industry'])) {
            $q->where('p.industry_key', $f['industry']);
        }
        if (($term = trim((string) ($f['q'] ?? ''))) !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term) . '%';
            $q->where(fn ($w) => $w->where('p.number', 'like', $like)->orWhere('p.title', 'like', $like)->orWhere('p.reference', 'like', $like));
        }
        $per = min(100, max(5, (int) ($f['per_page'] ?? 25)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('p.created_at')->orderByDesc('p.id')->offset(($page - 1) * $per)->limit($per)->pluck('p.id')->all();

        return ['data' => $this->presentMany($rows), 'total' => $total, 'page' => $page, 'per_page' => $per, 'counts' => $counts];
    }

    /** One project as the screen shows it, with its stages, the words for it, and what this person may do. @return array<string, mixed> */
    public function show(User $user, object $project): array
    {
        $out = $this->presentMany([(int) $project->id])[0];
        $out['stages'] = DB::table('project_stages')->where('type_id', $project->type_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'state', 'status_token', 'required_fields'])
            ->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name, 'state' => $s->state, 'status' => $s->status_token, 'required_fields' => json_decode((string) $s->required_fields, true) ?: []])->all();
        $out['cost_centre_path'] = $this->costCentres->path($project->cost_centre_id ? (int) $project->cost_centre_id : null);
        // a project in an industry other than the person's own is shown in ITS words, so a law firm's one construction job still reads as a contract
        $industry = $project->industry_key === $this->settings()->defaultIndustry() ? $this->names()->industryFor($user) : $project->industry_key;
        $out['words'] = array_map(fn ($n) => ['name' => $n['name'], 'plural' => $n['plural']], $this->names()->names($industry));
        $out['fields'] = app(ProjectShape::class)->valuesFor($project, $user);
        $out['can'] = $this->access->abilities($user, $project);
        $out['links_count'] = (int) DB::table('project_links')->where('project_id', $project->id)->whereNull('deleted_at')->count();   // for the Overview (stage 7); what each is shows on the Links tab
        $out['locks'] = app(ProjectLocks::class)->stateFor($project, $user);   // which parts are behind a password here, and which this person has open

        return $out;
    }

    /** What the "new" form offers. @return array<string, mixed> */
    public function options(User $user): array
    {
        $general = $this->settings()->get('general');
        $industries = array_values(array_filter($this->names()->industries(true), fn ($i) => $general['project_may_use_other_industry'] || $i['key'] === $general['default_industry']));
        $types = ProjectsSetup::ready()
            ? DB::table('project_types')->whereNull('deleted_at')->where('is_active', 1)->whereIn('industry_key', array_column($industries, 'key'))->orderBy('sort_order')->orderBy('name')
                ->get(['id', 'industry_key', 'name', 'number_prefix'])->map(fn ($t) => ['id' => (int) $t->id, 'industry' => $t->industry_key, 'name' => $t->name, 'prefix' => $t->number_prefix])->all()
            : [];
        $branches = Schema::hasTable('locations')
            ? DB::table('locations')->where('is_active', 1)->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])
                ->filter(fn ($l) => $this->authorizer->canAccessLocation($user, (int) $l->id, true))->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->values()->all()
            : [];
        // the extra fields each kind of work asks for (a sensitive one is not offered to someone who may not see it)
        $shape = app(ProjectShape::class);
        $maySee = $user->hasPermission('projects.fields.sensitive');
        $fields = [];
        $templates = [];
        $startConfidential = [];
        $wt = app(ProjectWorkTemplates::class);
        foreach ($types as $t) {
            $fields[$t['id']] = array_values(array_filter($shape->fields($t['industry'], $t['id']), fn ($f) => $maySee || ! $f['sensitive']));
            $templates[$t['id']] = $wt->offered($t['id']);   // stage 11: how a work of this kind can start
            $startConfidential[$t['id']] = $wt->setting($t['id'], 'confidential_default');
        }
        $staff = app(\App\Services\Notify\Staff::class)->holding('projects.use')->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all();
        $words = [];
        foreach ($industries as $i) {
            $words[$i['key']] = array_map(fn ($n) => ['name' => $n['name'], 'plural' => $n['plural']], $this->names()->names($i['key']));
        }

        return ['default_industry' => $general['default_industry'], 'industries' => $industries, 'types' => $types, 'branches' => $branches,
            'leads' => $staff, 'fields' => $fields, 'templates' => $templates, 'start_confidential' => $startConfidential,
            'priorities' => self::PRIORITIES, 'words' => $words, 'cost_centres' => $this->costCentres->ready(),
            'can' => ['create' => $user->hasPermission('projects.create'), 'confidential' => $user->hasPermission('projects.confidential')]];
    }

    /** Clients to pick from, by name, company, email or customer number. @return array<int, array{id: int, name: string, detail: ?string}> */
    public function customers(string $q): array
    {
        if (! Schema::hasTable('customers')) {
            return [];
        }
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)) . '%';

        return DB::table('customers')->whereNull('deleted_at')
            ->when(trim($q) !== '', fn ($w) => $w->where(fn ($x) => $x->where('company_name', 'like', $like)->orWhere('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                ->orWhere('email', 'like', $like)->orWhere('customer_number', 'like', $like)))
            ->orderBy('company_name')->orderBy('first_name')->limit(20)->get(['id', 'first_name', 'last_name', 'company_name', 'email', 'customer_number'])
            ->pipe(function ($rows) {
                $flags = ProjectClients::flagNames($rows->pluck('id')->map(fn ($v) => (int) $v)->all());   // a flag shows wherever a client is picked

                return $rows->map(fn ($c) => ['id' => (int) $c->id, 'name' => self::customerName($c), 'detail' => $c->customer_number ?: $c->email, 'flags' => $flags[(int) $c->id] ?? []]);
            })->all();
    }

    // ------------------------------------------------------------------ starting

    /**
     * Start a project. All of it happens or none of it: the number, the cost centre in the books, the row, the people on it, the log line.
     *
     * @param array<string, mixed> $d
     */
    public function create(array $d, User $by): object
    {
        if (! ProjectsSetup::ready()) {
            throw new ProjectException('Projects is not set up yet: run database script 257 first.', 409);
        }
        $general = $this->settings()->get('general');
        $industry = (string) ($d['industry_key'] ?? $general['default_industry']);
        if ($industry !== $general['default_industry'] && ! $general['project_may_use_other_industry']) {
            throw new ProjectException('Only the company\'s own industry can be used.');
        }
        if (! DB::table('project_industries')->where('key', $industry)->where('is_active', 1)->exists()) {
            throw new ProjectException('Choose an industry that is switched on.');
        }
        $type = DB::table('project_types')->where('id', (int) ($d['type_id'] ?? 0))->whereNull('deleted_at')->where('is_active', 1)->first();
        if (! $type || $type->industry_key !== $industry) {
            throw new ProjectException('Choose a kind of work from that industry.');
        }
        $stage = DB::table('project_stages')->where('type_id', $type->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->first();
        if (! $stage) {
            throw new ProjectException('That kind of work has no stages yet. Add one in Configuration first.');
        }
        $values = $this->clean($d, null);
        if (($values['title'] ?? '') === '') {
            throw new ProjectException('Give it a title.');
        }
        $confidential = ! empty($d['confidential']);
        $byDefault = ! $confidential && app(ProjectWorkTemplates::class)->setting((int) $type->id, 'confidential_default');   // stage 11: this kind of work starts confidential (healthcare)
        if ($confidential && ! $by->hasPermission('projects.confidential')) {
            ProjectLog::refused(null, $by, 'project.confidential', 'Does not hold projects.confidential', 'project');
            throw new ProjectException('You may not make this confidential.', 403);
        }
        $leadId = (int) ($d['lead_user_id'] ?? $by->id);
        $lead = $leadId === (int) $by->id ? $by : User::find($leadId);
        if (! $lead || ! $lead->hasPermission('projects.use')) {
            throw new ProjectException('The lead must be someone who can open Projects.');
        }
        $locationId = ! empty($d['location_id']) ? (int) $d['location_id'] : null;
        if ($locationId && (! Schema::hasTable('locations') || ! DB::table('locations')->where('id', $locationId)->exists() || ! $this->authorizer->canAccessLocation($by, $locationId, true))) {
            throw new ProjectException('Choose a branch you work at.');
        }
        $roles = DB::table('project_roles')->whereIn('key', ['lead', 'member'])->where('is_active', 1)->pluck('id', 'key');
        if (! isset($roles['lead'])) {
            throw new ProjectException('The Lead project role is missing or switched off. Put it back in Configuration first.');
        }

        $confidential = $confidential || $byDefault;
        $id = DB::transaction(function () use ($values, $industry, $type, $stage, $confidential, $lead, $locationId, $by, $roles, $d) {
            $number = $this->nextNumber($type->number_prefix);
            $cc = $this->costCentres->forProject($number, $values['title'], $locationId);   // a failure here undoes everything: no project without its cost centre
            $now = now();
            $id = DB::table('projects')->insertGetId($values + [
                'number' => $number, 'industry_key' => $industry, 'type_id' => $type->id, 'lead_user_id' => $lead->id, 'location_id' => $locationId, 'cost_centre_id' => $cc?->id,
                'stage_id' => $stage->id, 'state' => $stage->state, 'priority' => $values['priority'] ?? 'medium', 'confidential' => $confidential ? 1 : 0,
                'created_by' => $by->id, 'updated_by' => $by->id, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $member = fn (int $userId, int $roleId) => DB::table('project_members')->insert(['project_id' => $id, 'user_id' => $userId, 'project_role_id' => $roleId, 'status' => 'active',
                'invited_by' => $by->id, 'invited_at' => $now, 'answered_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
            $member((int) $lead->id, (int) $roles['lead']);
            if ((int) $lead->id !== (int) $by->id) {
                $member((int) $by->id, (int) ($roles['member'] ?? $roles['lead']));   // whoever started it stays on it
            }
            app(ProjectHours::class)->applyDefault($id);   // the company's default hours, when it has set any
            // the extra fields an owner defined for this kind of work: a required one left empty undoes the whole start
            app(ProjectShape::class)->saveValues(DB::table('projects')->where('id', $id)->first(), (array) ($d['fields'] ?? []), $by, true);

            return $id;
        });
        $project = $this->find($id);
        ProjectLog::record($id, $by, 'project.created', 'project', $id, null, ['number' => $project->number, 'title' => $project->title, 'type' => $type->name, 'lead' => $lead->name,
            'confidential' => (bool) $project->confidential, 'confidential_by_default' => $byDefault, 'cost_centre_id' => $project->cost_centre_id]);
        // stage 11: the chosen work template (or the kind of work's default; 0 = none) makes its phases, tasks and key dates
        $templates = app(ProjectWorkTemplates::class);
        $chosen = array_key_exists('template_id', $d) ? (int) $d['template_id'] : (collect($templates->offered((int) $type->id))->firstWhere('is_default', true)['id'] ?? 0);
        if ($chosen > 0) {
            $templates->apply($project, $chosen, $by, true);
        }

        return $project;
    }

    // ------------------------------------------------------------------ changing

    /** @param array<string, mixed> $d */
    public function update(object $project, array $d, User $by): object
    {
        $this->access->authorize($by, 'edit', $project);
        $new = $this->clean($d, $project);
        if (array_key_exists('title', $new) && $new['title'] === '') {
            throw new ProjectException('Give it a title.');
        }
        if (array_key_exists('confidential', $d) && (bool) $d['confidential'] !== (bool) $project->confidential) {
            $this->access->authorize($by, 'confidential', $project);
            $new['confidential'] = $d['confidential'] ? 1 : 0;
        }
        $changed = array_filter($new, fn ($v, $k) => (string) ($project->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        $hasFields = array_key_exists('fields', $d) && is_array($d['fields']);
        if (! $changed && ! $hasFields) {
            return $project;
        }
        $extra = ['old' => [], 'new' => []];
        DB::transaction(function () use ($project, $changed, $by, $hasFields, $d, &$extra) {
            if ($changed) {
                DB::table('projects')->where('id', $project->id)->update($changed + ['updated_by' => $by->id, 'updated_at' => now()]);
            }
            if (isset($changed['title'])) {
                $this->costCentres->rename($project->cost_centre_id ? (int) $project->cost_centre_id : null, $project->number, $changed['title']);
            }
            if ($hasFields) {
                $extra = app(ProjectShape::class)->saveValues($project, $d['fields'], $by, false);
            }
        });
        if (! $changed && ! $extra['new']) {
            return $project;
        }
        ProjectLog::record((int) $project->id, $by, 'project.changed', 'project', (int) $project->id, array_intersect_key((array) $project, $changed) + $extra['old'], $changed + $extra['new']);

        return $this->find((int) $project->id);
    }

    /** Move to another stage of its kind of work. Entering or leaving a closed stage is closing or reopening, and needs that permission. */
    public function moveStage(object $project, int $stageId, User $by): object
    {
        $this->access->authorize($by, 'stage', $project);
        $stage = DB::table('project_stages')->where('id', $stageId)->where('type_id', $project->type_id)->whereNull('deleted_at')->first();
        if (! $stage) {
            throw new ProjectException('That stage does not belong to this kind of work.');
        }
        if ((int) $project->stage_id === (int) $stage->id && $project->state === $stage->state) {
            return $project;
        }
        if (in_array($project->state, ['on_hold', 'cancelled'], true)) {
            throw new ProjectException($project->state === 'on_hold' ? 'It is on hold. Resume it before moving it on.' : 'It was cancelled. Reopen it before moving it on.');
        }
        if ($stage->state === 'closed' || $project->state === 'closed') {
            $this->access->authorize($by, 'close', $project);
        }
        $required = json_decode((string) $stage->required_fields, true) ?: [];
        $missing = array_merge($this->missingFor($project, $required), app(ProjectShape::class)->missingExtra($project, $required));
        if ($missing) {
            throw new ProjectException('Fill these in first: ' . implode(', ', $missing) . '.');
        }
        $old = DB::table('project_stages')->where('id', $project->stage_id)->value('name');
        DB::table('projects')->where('id', $project->id)->update(['stage_id' => $stage->id, 'state' => $stage->state, 'closed_at' => $stage->state === 'closed' ? now() : null,
            'updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $stage->state === 'closed' ? 'project.closed' : ($project->state === 'closed' ? 'project.reopened' : 'stage.moved'), 'project', (int) $project->id,
            ['stage' => $old, 'state' => $project->state], ['stage' => $stage->name, 'state' => $stage->state]);
        if ($stage->state === 'closed' && $project->state !== 'closed') {
            app(ProjectMaterials::class)->useUp($project, $by);   // stage 10: what the work's Stock jobs hold becomes a cost of the work
        }

        return $this->find((int) $project->id);
    }

    /** hold | resume | cancel | reopen: the states a project can be in apart from the one its stage gives it. */
    public function setState(object $project, string $action, User $by, ?string $reason = null): object
    {
        $stageState = (string) (DB::table('project_stages')->where('id', $project->stage_id)->value('state') ?? 'open');
        [$ability, $from, $to] = match ($action) {
            'hold' => ['stage', ['open'], 'on_hold'],
            'resume' => ['stage', ['on_hold'], $stageState === 'closed' ? 'open' : $stageState],
            'cancel' => ['close', ['open', 'on_hold'], 'cancelled'],
            'reopen' => ['close', ['cancelled'], $stageState === 'closed' ? 'open' : $stageState],
            default => throw new ProjectException('There is no such action.', 404),
        };
        $this->access->authorize($by, $ability, $project);
        if (! in_array($project->state, $from, true)) {
            throw new ProjectException('That cannot be done from where it is now.');
        }
        DB::table('projects')->where('id', $project->id)->update(['state' => $to, 'closed_at' => $to === 'cancelled' ? now() : null, 'updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'project.' . ['hold' => 'held', 'resume' => 'resumed', 'cancel' => 'cancelled', 'reopen' => 'reopened'][$action], 'project', (int) $project->id,
            ['state' => $project->state], ['state' => $to] + ($reason ? ['reason' => mb_substr($reason, 0, 200)] : []));

        return $this->find((int) $project->id);
    }

    /** Freeze a finished project so nothing on it can change, or unfreeze it. Only a closed or cancelled one can be frozen. */
    public function freeze(object $project, bool $frozen, User $by): object
    {
        $this->access->authorize($by, 'freeze', $project);
        if ($frozen === ($project->frozen_at !== null)) {
            return $project;
        }
        if ($frozen && ! in_array($project->state, ['closed', 'cancelled'], true)) {
            throw new ProjectException('Close it first. Only finished work can be frozen.');
        }
        DB::table('projects')->where('id', $project->id)->update(['frozen_at' => $frozen ? now() : null, 'frozen_by' => $frozen ? $by->id : null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, $frozen ? 'project.frozen' : 'project.unfrozen', 'project', (int) $project->id, ['frozen' => ! $frozen], ['frozen' => $frozen]);

        return $this->find((int) $project->id);
    }

    // ------------------------------------------------------------------ inside

    /** The next number of a series, safe when two people start a project at the same moment. */
    private function nextNumber(string $prefix): string
    {
        $row = DB::table('project_series')->where('prefix', $prefix)->lockForUpdate()->first();
        if (! $row) {
            DB::table('project_series')->insert(['prefix' => $prefix, 'next_number' => 1, 'width' => 4]);
            $row = (object) ['next_number' => 1, 'width' => 4];
        }
        $n = (int) $row->next_number;
        do {
            $number = $prefix . '-' . str_pad((string) $n, (int) $row->width, '0', STR_PAD_LEFT);
            $n++;
        } while (DB::table('projects')->where('number', $number)->exists());
        DB::table('project_series')->where('prefix', $prefix)->update(['next_number' => $n]);

        return $number;
    }

    /**
     * The changeable columns out of what was sent, tidied and checked. For a new project every column is returned; for a change only the ones sent.
     *
     * @param array<string, mixed> $d
     * @return array<string, mixed>
     */
    private function clean(array $d, ?object $existing): array
    {
        $out = [];
        foreach (self::EDITABLE as $k) {
            if (! array_key_exists($k, $d)) {
                if (! $existing) {
                    $out[$k] = $k === 'priority' ? 'medium' : null;
                }
                continue;
            }
            $v = $d[$k];
            $out[$k] = match ($k) {
                'title' => $this->line((string) $v, 200),
                'description' => ($t = trim(strip_tags((string) $v))) === '' ? null : mb_substr($t, 0, 20000),
                'customer_id' => $this->customer($v),
                'priority' => in_array($v, self::PRIORITIES, true) ? $v : throw new ProjectException('Choose a priority from the list.'),
                'reference' => $this->line((string) $v, 120) ?: null,
                'authority' => $this->line((string) $v, 160) ?: null,
                'place' => $this->line((string) $v, 300) ?: null,
                default => $this->date($v),
            };
        }
        $start = $out['start_date'] ?? $existing?->start_date ?? null;
        $due = $out['due_date'] ?? $existing?->due_date ?? null;
        if ($start && $due && substr((string) $due, 0, 10) < substr((string) $start, 0, 10)) {
            throw new ProjectException('The end date is before the start date.');
        }

        return $out;
    }

    private function line(string $s, int $max): string
    {
        $s = trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F<>]/u', ' ', strip_tags($s))));

        return mb_substr($s, 0, $max);
    }

    private function date(mixed $v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        try {
            return \Carbon\Carbon::parse((string) $v)->toDateString();
        } catch (\Throwable) {
            throw new ProjectException('That is not a date.');
        }
    }

    private function customer(mixed $v): ?int
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (! Schema::hasTable('customers') || ! DB::table('customers')->where('id', (int) $v)->whereNull('deleted_at')->exists()) {
            throw new ProjectException('That client does not exist.');
        }

        return (int) $v;
    }

    /** Which of a stage's required fields are still empty, in the words of the project's industry. @return string[] */
    private function missingFor(object $project, array $fields): array
    {
        $term = ['customer_id' => 'client', 'reference' => 'reference', 'authority' => 'authority', 'place' => 'place'];
        $plain = ['start_date' => 'Start date', 'due_date' => 'Expected end', 'description' => 'Description'];
        $missing = [];
        foreach ($fields as $f) {
            if ((isset($term[$f]) || isset($plain[$f])) && ($project->$f === null || $project->$f === '')) {
                $missing[] = isset($term[$f]) ? $this->names()->word($project->industry_key, $term[$f]) : $plain[$f];
            }
        }

        return $missing;
    }

    /** @param int[] $ids @return array<int, array<string, mixed>> in the order given */
    private function presentMany(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $hasCustomers = Schema::hasTable('customers');
        $hasLocations = Schema::hasTable('locations');
        $rows = DB::table('projects as p')->leftJoin('project_types as t', 't.id', '=', 'p.type_id')->leftJoin('project_stages as s', 's.id', '=', 'p.stage_id')
            ->leftJoin('project_industries as i', 'i.key', '=', 'p.industry_key')->leftJoin('users as u', 'u.id', '=', 'p.lead_user_id')
            ->when($hasCustomers, fn ($q) => $q->leftJoin('customers as c', 'c.id', '=', 'p.customer_id')->addSelect('c.first_name as c_first', 'c.last_name as c_last', 'c.company_name as c_company'))
            ->when($hasLocations, fn ($q) => $q->leftJoin('locations as l', 'l.id', '=', 'p.location_id')->addSelect('l.name as l_name'))
            ->whereIn('p.id', $ids)
            ->addSelect('p.*', 't.name as type_name', 's.name as stage_name', 's.status_token as stage_status', 'i.name as industry_name', 'u.name as lead_name')->get()->keyBy('id');

        $out = [];
        foreach ($ids as $id) {
            if (! ($r = $rows[$id] ?? null)) {
                continue;
            }
            $out[] = [
                'id' => (int) $r->id, 'number' => $r->number, 'title' => $r->title, 'description' => $r->description,
                'industry' => ['key' => $r->industry_key, 'name' => $r->industry_name], 'type' => ['id' => (int) $r->type_id, 'name' => $r->type_name],
                'stage' => $r->stage_id ? ['id' => (int) $r->stage_id, 'name' => $r->stage_name, 'status' => $r->stage_status] : null,
                'state' => $r->state, 'priority' => $r->priority,
                'customer' => $r->customer_id ? ['id' => (int) $r->customer_id, 'name' => $hasCustomers ? self::customerName((object) ['first_name' => $r->c_first, 'last_name' => $r->c_last, 'company_name' => $r->c_company]) : null] : null,
                'lead' => ['id' => (int) $r->lead_user_id, 'name' => $r->lead_name],
                'branch' => $r->location_id ? ['id' => (int) $r->location_id, 'name' => $hasLocations ? $r->l_name : null] : null,
                'cost_centre_id' => $r->cost_centre_id ? (int) $r->cost_centre_id : null,
                'reference' => $r->reference, 'authority' => $r->authority, 'place' => $r->place,
                'start_date' => $r->start_date ? substr((string) $r->start_date, 0, 10) : null, 'due_date' => $r->due_date ? substr((string) $r->due_date, 0, 10) : null,
                'closing_period_ends' => $r->closing_period_ends ? substr((string) $r->closing_period_ends, 0, 10) : null, 'closed_at' => $r->closed_at,
                'confidential' => (bool) $r->confidential, 'frozen' => $r->frozen_at !== null, 'created_at' => $r->created_at,
            ];
        }

        return $out;
    }

    public static function customerName(object $c): string
    {
        $person = trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''));

        return trim((string) ($c->company_name ?? '')) ?: ($person ?: 'Client');
    }
}
