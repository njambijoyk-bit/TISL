<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The casebook (docs/PROJECTS_STAGE8_SPEC.md, build 8.5): a safe way to raise a problem. Anyone with `projects.casebook.report` reports: kind,
 * what happened, when, who or what it is about, and whether to hide their name. Each kind is routed one of six ways (owner's choice 3), and never
 * to anyone the report is about. Handlers (`projects.casebook.handle`) move it through its states, write notes, and message the reporter without
 * learning a hidden name. Revealing one needs `projects.casebook.identity` and is a serious action; the reporter is told (owner's choice 4).
 * Nothing here is in a piece of work's log: every view, change, note, message and reveal is in the case's own add-only log.
 */
class ProjectCasebook
{
    public const ROUTES = ['handlers' => 'Everyone who handles cases', 'person' => 'A named person', 'manager' => 'The reporter\'s manager', 'department' => 'The head of a department', 'owners' => 'The company owners', 'outside' => 'Someone outside, by email'];
    public const STATES = ['new' => 'New', 'looking' => 'Being looked into', 'action' => 'Action taken', 'closed' => 'Closed'];

    public function __construct(private ProjectTeam $team, private ProjectAccess $access) {}

    // ------------------------------------------------------------------ kinds (Configuration)

    /** @return array<int, array<string, mixed>> */
    public function kinds(bool $all = false): array
    {
        $this->needReady();

        return DB::table('project_case_kinds')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($k) => ['id' => (int) $k->id, 'key' => $k->key, 'name' => $k->name, 'route' => $k->route, 'route_user_id' => $k->route_user_id ? (int) $k->route_user_id : null,
                'route_department_id' => $k->route_department_id ? (int) $k->route_department_id : null, 'route_email' => $k->route_email, 'route_name' => $k->route_name,
                'client_flag' => (bool) $k->client_flag, 'is_active' => (bool) $k->is_active])->all();
    }

    /** @param array<string, mixed> $d name, route, route_user_id, route_department_id, route_email, route_name, client_flag, is_active */
    public function saveKind(?int $id, array $d, User $by): void
    {
        $this->needReady();
        $name = trim((string) ($d['name'] ?? ''));
        $route = (string) ($d['route'] ?? 'handlers');
        if ($name === '' || ! isset(self::ROUTES[$route])) {
            throw new ProjectException('Give the kind a name and choose where it goes.');
        }
        $row = ['name' => mb_substr($name, 0, 80), 'route' => $route, 'route_user_id' => null, 'route_department_id' => null, 'route_email' => null, 'route_name' => null,
            'client_flag' => (int) ! empty($d['client_flag']), 'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : 1];
        if ($route === 'person') {
            $row['route_user_id'] = DB::table('users')->where('id', (int) ($d['route_user_id'] ?? 0))->value('id') ?? throw new ProjectException('Choose the person it goes to.');
        }
        if ($route === 'department') {
            $row['route_department_id'] = Schema::hasTable('departments') ? (DB::table('departments')->where('id', (int) ($d['route_department_id'] ?? 0))->value('id') ?? throw new ProjectException('Choose the department.')) : throw new ProjectException('There are no departments in HR yet.');
        }
        if ($route === 'outside') {
            $row['route_email'] = filter_var(trim((string) ($d['route_email'] ?? '')), FILTER_VALIDATE_EMAIL) ?: throw new ProjectException('Give the email address it goes to.');
            $row['route_name'] = mb_substr(trim((string) ($d['route_name'] ?? '')), 0, 120) ?: null;
        }
        if ($id) {
            DB::table('project_case_kinds')->where('id', $id)->exists() || throw new ProjectException('Not found.', 404);
            DB::table('project_case_kinds')->where('id', $id)->update($row);
        } else {
            $key = trim(preg_replace('/[^a-z0-9]+/', '_', mb_strtolower($name)), '_');
            DB::table('project_case_kinds')->where('key', $key)->exists() && throw new ProjectException('There is already a kind like that.');
            DB::table('project_case_kinds')->insert($row + ['key' => mb_substr($key, 0, 30), 'sort_order' => (int) DB::table('project_case_kinds')->max('sort_order') + 1, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'casebook.kind_saved', null, null, null, ['name' => $name, 'route' => $route]);
    }

    // ------------------------------------------------------------------ reporting

    /** @param array<string, mixed> $d kind_id, what, happened_on, about_people [ids], about_clients [ids], hide_name, project_id @return int */
    public function report(User $by, array $d): int
    {
        $this->needReady();
        $kind = DB::table('project_case_kinds')->where('id', (int) ($d['kind_id'] ?? 0))->where('is_active', 1)->first() ?? throw new ProjectException('Choose what kind of thing it is.');
        $what = trim((string) ($d['what'] ?? ''));
        if (mb_strlen($what) < 10) {
            throw new ProjectException('Say what happened, in a few words at least.');
        }
        $people = array_values(array_diff(array_unique(array_map('intval', (array) ($d['about_people'] ?? []))), [(int) $by->id]));
        $people = DB::table('users')->whereIn('id', $people ?: [0])->pluck('id')->map(fn ($v) => (int) $v)->all();
        $clients = Schema::hasTable('customers') ? DB::table('customers')->whereIn('id', array_map('intval', (array) ($d['about_clients'] ?? [])) ?: [0])->pluck('id')->map(fn ($v) => (int) $v)->all() : [];
        $project = null;
        if (! empty($d['project_id'])) {
            $p = DB::table('projects')->where('id', (int) $d['project_id'])->whereNull('deleted_at')->first();
            $project = $p && $this->access->decide($by, 'open', $p)['allowed'] ? (int) $p->id : throw new ProjectException('Choose a piece of work you are on, or none.');
        }
        $happened = ! empty($d['happened_on']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $d['happened_on']) ? $d['happened_on'] : null;

        [$recipients, $outside, $how] = $this->route($kind, $by, $people);
        $id = DB::transaction(function () use ($kind, $by, $d, $happened, $what, $project, $how, $people, $clients, $recipients) {
            $id = DB::table('project_cases')->insertGetId(['number' => 'tmp-' . uniqid(), 'kind_id' => $kind->id, 'reporter_id' => $by->id, 'hide_name' => (int) ! empty($d['hide_name']), 'happened_on' => $happened,
                'what' => mb_substr($what, 0, 20000), 'project_id' => $project, 'state' => 'new', 'routed_to' => $how, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('project_cases')->where('id', $id)->update(['number' => 'CB-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT)]);
            foreach ($people as $u) {
                DB::table('project_case_subjects')->insert(['case_id' => $id, 'subject_type' => 'person', 'subject_id' => $u]);
            }
            foreach ($clients as $c) {
                DB::table('project_case_subjects')->insert(['case_id' => $id, 'subject_type' => 'client', 'subject_id' => $c]);
            }
            $this->log($id, $by, 'reported', ! empty($d['hide_name']) ? 'name hidden' : null);
            foreach ($recipients as $u) {
                DB::table('project_case_log')->insert(['case_id' => $id, 'user_id' => $u, 'action' => 'routed', 'detail' => 'sent to this person', 'created_at' => now()]);
            }

            return $id;
        });
        $case = DB::table('project_cases')->where('id', $id)->first();
        ProjectNotices::tell(User::whereIn('id', $recipients ?: [0])->get(), ProjectNotices::CASEBOOK, "A casebook report: {$kind->name}", "{$case->number}. Open it in Projects → Casebook.", "/admin/projects/casebook/{$id}", 'Open it');
        if ($outside) {
            try {
                app(Notifier::class)->sendToContact(['name' => $kind->route_name, 'email' => $kind->route_email], ProjectNotices::CASEBOOK, "A casebook report: {$kind->name} ({$case->number})",
                    ($case->hide_name ? 'The person who reported this asked for their name to be hidden.' : "Reported by {$by->name}.") . ($happened ? " It happened on {$happened}." : '') . "\n\n{$what}",
                    ['only' => ['email'], 'subject' => "A casebook report ({$case->number})"]);
                $this->log($id, null, 'routed', 'sent by email to ' . ($kind->route_name ?: 'someone outside'));
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $id;
    }

    // ------------------------------------------------------------------ seeing and handling

    /** The cases this person reported, and the ones they handle. @return array<string, mixed> */
    public function list(User $viewer, array $f = []): array
    {
        $this->needReady();
        $kinds = DB::table('project_case_kinds')->pluck('name', 'id');
        $mine = DB::table('project_cases')->where('reporter_id', $viewer->id)->orderByDesc('id')->limit(100)->get();
        $handle = collect();
        if ($this->mayHandleAny($viewer)) {
            $handle = DB::table('project_cases')->when(! empty($f['state']) && isset(self::STATES[$f['state']]), fn ($q) => $q->where('state', $f['state']), fn ($q) => $q->where('state', '!=', 'closed'))
                ->orderByDesc('id')->limit(300)->get()->filter(fn ($c) => $this->handles($viewer, $c))->values();
        }
        $shape = fn ($c, $asReporter) => ['id' => (int) $c->id, 'number' => $c->number, 'kind' => $kinds[$c->kind_id] ?? null, 'state' => $c->state, 'state_name' => self::STATES[$c->state],
            'reported_at' => $c->created_at, 'reporter' => $asReporter ? 'You' : $this->reporterName($c, $viewer), 'what' => mb_substr($c->what, 0, 140)];

        return ['mine' => $mine->map(fn ($c) => $shape($c, true))->all(), 'handling' => $handle->map(fn ($c) => $shape($c, false))->all(), 'states' => self::STATES,
            'can' => ['report' => $viewer->hasPermission('projects.casebook.report'), 'handle' => $this->mayHandleAny($viewer)]];
    }

    /** Who and what a report may be about: staff, and the clients of the work the reporter is on. @return array{people: array<int, array{id: int, name: string}>, clients: array<int, array{id: int, name: string}>} */
    public function subjects(User $reporter): array
    {
        $people = app(Staff::class)->holding('projects.use')->reject(fn ($u) => (int) $u->id === (int) $reporter->id)->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->sortBy('name')->values()->all();
        $q = DB::table('projects as p')->whereNotNull('p.customer_id');
        $ids = $this->access->visible($q, $reporter, true)->distinct()->pluck('p.customer_id')->all();
        $clients = Schema::hasTable('customers') ? DB::table('customers')->whereIn('id', $ids ?: [0])->get()->map(fn ($c) => ['id' => (int) $c->id, 'name' => trim(($c->company_name ?? '') ?: (($c->first_name ?? '') . ' ' . ($c->last_name ?? '')))])->sortBy('name')->values()->all() : [];

        return ['people' => $people, 'clients' => $clients];
    }

    /** @return array<string, mixed> */
    public function show(User $viewer, int $id, bool $logView = true): array
    {
        $c = $this->readable($viewer, $id);
        $asReporter = (int) $c->reporter_id === (int) $viewer->id;
        if (! $asReporter && $logView) {
            $this->log((int) $c->id, $viewer, 'viewed');
        }
        $kind = DB::table('project_case_kinds')->where('id', $c->kind_id)->first();
        $names = DB::table('users')->pluck('name', 'id');
        $subjects = DB::table('project_case_subjects')->where('case_id', $c->id)->get();
        $clients = Schema::hasTable('customers') ? DB::table('customers')->whereIn('id', $subjects->where('subject_type', 'client')->pluck('subject_id')->all() ?: [0])->get() : collect();
        $messages = DB::table('project_case_messages')->where('case_id', $c->id)->when($asReporter, fn ($q) => $q->where('internal', 0))->orderBy('id')->get();
        $handlerName = fn ($m) => $m->from_reporter ? ($asReporter ? 'You' : $this->reporterName($c, $viewer)) : ($names[$m->user_id] ?? 'Someone');

        return ['id' => (int) $c->id, 'number' => $c->number, 'kind' => ['name' => $kind->name, 'client_flag' => (bool) $kind->client_flag], 'state' => $c->state, 'states' => self::STATES,
            'what' => $c->what, 'happened_on' => $c->happened_on, 'reported_at' => $c->created_at, 'reporter' => $asReporter ? 'You' : $this->reporterName($c, $viewer), 'hidden' => (bool) $c->hide_name && ! $c->revealed_at,
            'revealed' => $c->revealed_at ? ['at' => $c->revealed_at, 'by' => $names[$c->revealed_by] ?? null] : null,
            'about' => array_merge($subjects->where('subject_type', 'person')->map(fn ($s) => ['type' => 'person', 'id' => (int) $s->subject_id, 'name' => $names[$s->subject_id] ?? 'Someone'])->values()->all(),
                $clients->map(fn ($cl) => ['type' => 'client', 'id' => (int) $cl->id, 'name' => trim(($cl->company_name ?? '') ?: (($cl->first_name ?? '') . ' ' . ($cl->last_name ?? '')))])->values()->all()),
            'project' => $c->project_id ? DB::table('projects')->where('id', $c->project_id)->first(['id', 'number', 'title']) : null,
            'handler' => $c->handler_id ? ($names[$c->handler_id] ?? null) : null, 'outcome' => $c->outcome, 'routed_to' => self::ROUTES[$c->routed_to] ?? $c->routed_to,
            'messages' => $messages->map(fn ($m) => ['id' => (int) $m->id, 'from' => $handlerName($m), 'from_reporter' => (bool) $m->from_reporter, 'internal' => (bool) $m->internal, 'body' => $m->body, 'at' => $m->created_at])->all(),
            'log' => $asReporter ? [] : DB::table('project_case_log')->where('case_id', $c->id)->orderBy('id')->get()->map(fn ($l) => ['action' => $l->action, 'who' => $l->user_id ? ($l->action === 'reported' && $c->hide_name && ! $c->revealed_at ? 'The reporter' : ($names[$l->user_id] ?? null)) : null, 'detail' => $l->detail, 'at' => $l->created_at])->all(),
            'flags' => ! $asReporter && $kind->client_flag && $viewer->hasPermission('projects.flags') ? app(ProjectLists::class)->of('flag', true) : [],
            'can' => ['handle' => ! $asReporter, 'reveal' => ! $asReporter && $c->hide_name && ! $c->revealed_at && $viewer->hasPermission('projects.casebook.identity'), 'message' => $c->state !== 'closed']];
    }

    /** Handlers: take it, move it, write the outcome. @param array<string, mixed> $d state, take, outcome */
    public function update(User $by, int $id, array $d): void
    {
        $c = $this->handled($by, $id);
        $row = ['updated_at' => now()];
        if (! empty($d['take'])) {
            $row['handler_id'] = $by->id;
            $this->log((int) $c->id, $by, 'taken');
        }
        if (array_key_exists('outcome', $d)) {
            $row['outcome'] = mb_substr(trim((string) $d['outcome']), 0, 5000) ?: null;
        }
        if (array_key_exists('state', $d) && $d['state'] !== $c->state) {
            isset(self::STATES[$d['state']]) || throw new ProjectException('Choose a state from the list.');
            $row['state'] = $d['state'];
            $row['closed_at'] = $d['state'] === 'closed' ? now() : null;
            $this->log((int) $c->id, $by, 'state', self::STATES[$c->state] . ' to ' . self::STATES[$d['state']]);
            ProjectNotices::tell(User::find($c->reporter_id), ProjectNotices::CASEBOOK, "Your report {$c->number}: " . mb_strtolower(self::STATES[$d['state']]), 'Open it to see where it stands.', "/admin/projects/casebook/{$c->id}", 'Open it');
        }
        DB::table('project_cases')->where('id', $c->id)->update($row);
    }

    /** A message: the reporter writes to handlers; a handler writes to the reporter, or a note only handlers see. */
    public function message(User $by, int $id, string $body, bool $internal): void
    {
        $c = $this->readable($by, $id);
        $body = trim($body);
        if ($body === '') {
            throw new ProjectException('Write a message.');
        }
        if ($c->state === 'closed') {
            throw new ProjectException('This case is closed.');
        }
        $fromReporter = (int) $c->reporter_id === (int) $by->id;
        DB::table('project_case_messages')->insert(['case_id' => $c->id, 'user_id' => $by->id, 'from_reporter' => (int) $fromReporter, 'internal' => (int) (! $fromReporter && $internal), 'body' => mb_substr($body, 0, 10000), 'created_at' => now()]);
        $this->log((int) $c->id, $fromReporter && $c->hide_name && ! $c->revealed_at ? null : $by, $internal && ! $fromReporter ? 'note' : 'message', $fromReporter ? 'from the reporter' : null);
        if ($fromReporter) {
            ProjectNotices::tell(User::whereIn('id', $this->handlerIds($c) ?: [0])->get(), ProjectNotices::CASEBOOK, "A new message on {$c->number}", 'From the person who reported it.', "/admin/projects/casebook/{$c->id}", 'Open it');
        } elseif (! $internal) {
            ProjectNotices::tell(User::find($c->reporter_id), ProjectNotices::CASEBOOK, "A reply on your report {$c->number}", 'Open it to read it.', "/admin/projects/casebook/{$c->id}", 'Open it');
        }
    }

    /** Reveal a hidden name (the controller has already passed the serious-action gate). @return string the name */
    public function reveal(User $by, int $id, ?string $reason): string
    {
        $c = $this->handled($by, $id);
        if (! $by->hasPermission('projects.casebook.identity')) {
            throw new ProjectException('You may not reveal a hidden name.', 403);
        }
        if (! $c->hide_name || $c->revealed_at) {
            throw new ProjectException('The name is not hidden.');
        }
        DB::table('project_cases')->where('id', $c->id)->update(['revealed_at' => now(), 'revealed_by' => $by->id, 'updated_at' => now()]);
        $this->log((int) $c->id, $by, 'revealed', $reason ? mb_substr($reason, 0, 280) : null);
        ProjectNotices::tell(User::find($c->reporter_id), ProjectNotices::CASEBOOK, "Your name on {$c->number} was revealed", "{$by->name} revealed your name to the people handling your report." . ($reason ? " Why: {$reason}" : ''), "/admin/projects/casebook/{$c->id}", 'Open it');

        return (string) DB::table('users')->where('id', $c->reporter_id)->value('name');
    }

    /** A "difficult client" case raises a flag on the client it is about (Stage 3; needs `projects.flags`). */
    public function flagClient(User $by, int $id, int $clientId, int $flagId, string $reason): void
    {
        $c = $this->handled($by, $id);
        $kind = DB::table('project_case_kinds')->where('id', $c->kind_id)->first();
        if (! $kind->client_flag || ! $by->hasPermission('projects.flags')) {
            throw new ProjectException('A flag cannot be raised from this case.', 403);
        }
        if (! DB::table('project_case_subjects')->where(['case_id' => $c->id, 'subject_type' => 'client', 'subject_id' => $clientId])->exists()) {
            throw new ProjectException('Choose the client the case is about.');
        }
        app(ProjectClients::class)->addFlag(DB::table('customers')->where('id', $clientId)->first(), $flagId, $reason, $by);
        $this->log((int) $c->id, $by, 'flag', 'a flag was raised on the client');
    }

    // ------------------------------------------------------------------ inside

    /** Who a report goes to: never anyone it is about. @param int[] $about @return array{0: int[], 1: bool, 2: string} people, whether it also goes outside, how */
    private function route(object $kind, User $by, array $about): array
    {
        $handlers = fn () => app(Staff::class)->holding('projects.casebook.handle')->pluck('id')->map(fn ($v) => (int) $v)->all();
        $ids = match ($kind->route) {
            'person' => [(int) $kind->route_user_id],
            'manager' => (function () use ($by, $about) {
                $m = $this->team->hr((int) $by->id)['manager_user_id'];
                if ($m && in_array($m, $about, true)) {   // about the manager: their manager
                    $m = $this->team->hr($m)['manager_user_id'];
                }

                return $m ? [$m] : [];
            })(),
            'department' => Schema::hasTable('departments') && Schema::hasColumn('departments', 'manager_employee_id')
                ? array_filter([(int) DB::table('employees')->where('id', DB::table('departments')->where('id', $kind->route_department_id)->value('manager_employee_id'))->value('user_id')]) : [],
            'owners' => app(Staff::class)->holding('projects.casebook.identity')->pluck('id')->map(fn ($v) => (int) $v)->all(),
            'outside' => [],
            default => $handlers(),
        };
        $ids = array_values(array_diff(array_unique(array_filter($ids)), $about, [(int) $by->id]));
        if (! $ids && $kind->route !== 'outside') {   // nobody left (it was about them, or there is no such person): the handlers, then the owners
            $ids = array_values(array_diff($handlers(), $about, [(int) $by->id]));
            if (! $ids) {
                $ids = array_values(array_diff(app(Staff::class)->holding('projects.casebook.identity')->pluck('id')->map(fn ($v) => (int) $v)->all(), $about, [(int) $by->id]));
            }
        }

        return [$ids, $kind->route === 'outside', $kind->route];
    }

    private function mayHandleAny(User $u): bool
    {
        return $u->hasPermission('projects.casebook.handle') || DB::table('project_case_log')->where('action', 'routed')->where('user_id', $u->id)->exists();
    }

    /** May this person handle this case: it was routed to them, or they handle cases; and it is not about them, and not theirs. */
    private function handles(User $u, object $c): bool
    {
        if ((int) $c->reporter_id === (int) $u->id || DB::table('project_case_subjects')->where(['case_id' => $c->id, 'subject_type' => 'person', 'subject_id' => $u->id])->exists()) {
            return false;
        }

        return DB::table('project_case_log')->where(['case_id' => $c->id, 'action' => 'routed', 'user_id' => $u->id])->exists() || ($c->routed_to === 'handlers' && $u->hasPermission('projects.casebook.handle'))
            || ($c->routed_to === 'outside' && $u->hasPermission('projects.casebook.handle'));
    }

    /** @return int[] */
    private function handlerIds(object $c): array
    {
        $ids = DB::table('project_case_log')->where(['case_id' => $c->id, 'action' => 'routed'])->whereNotNull('user_id')->pluck('user_id')->map(fn ($v) => (int) $v)->all();
        if ($c->handler_id) {
            $ids[] = (int) $c->handler_id;
        }

        return array_values(array_unique($ids));
    }

    private function readable(User $u, int $id): object
    {
        $this->needReady();
        $c = DB::table('project_cases')->where('id', $id)->first();
        if (! $c || ((int) $c->reporter_id !== (int) $u->id && ! $this->handles($u, $c))) {
            throw new ProjectException('Not found.', 404);
        }

        return $c;
    }

    private function handled(User $u, int $id): object
    {
        $c = $this->readable($u, $id);
        if ((int) $c->reporter_id === (int) $u->id) {
            throw new ProjectException('Someone else handles your own report.', 403);
        }

        return $c;
    }

    private function reporterName(object $c, User $viewer): string
    {
        return $c->hide_name && ! $c->revealed_at ? 'Name hidden' : (string) DB::table('users')->where('id', $c->reporter_id)->value('name');
    }

    private function log(int $caseId, ?User $by, string $action, ?string $detail = null): void
    {
        DB::table('project_case_log')->insert(['case_id' => $caseId, 'user_id' => $by?->id, 'action' => $action, 'detail' => $detail, 'created_at' => now()]);
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::people()) {
            throw new ProjectException('The casebook needs database script 265.', 409);
        }
    }
}
