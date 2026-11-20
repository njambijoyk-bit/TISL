<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rules (docs/PROJECTS_STAGE12_SPEC.md, build 12.5): when something happens on a piece of work, if it matches, then do these things.
 * What a rule may do is short on purpose (choice 3): tell someone, make a task, make a key date, add a follower, tag the work's conversation,
 * raise a client flag. Never a serious action, never anything in Books, never deleting, never moving a stage. A rule does not start itself
 * again, runs at most so many times a day, can be tried against the last 30 days first, and every run is logged.
 */
class ProjectRules
{
    /** event => [what it is called, what its value is (null = none)] */
    public const EVENTS = [
        'work_started' => ['A piece of work starts', null],
        'stage_entered' => ['The work enters a stage', 'The stage'],
        'task_late' => ['A task goes past its due day', null],
        'date_missed' => ['A key date is missed', 'Kind of key date (empty = any)'],
        'snag_raised' => ['A snag is raised', null],
        'snag_late' => ['A snag is late by so many days', 'Days late'],
        'kpi_red' => ['The work turns red', null],
        'opportunity_moved' => ['An opportunity moves to a pipeline stage', 'The pipeline stage'],
        'timesheet_missing' => ['Someone\'s time on the work was not sent in last week', null],
        'every_morning' => ['Every morning, for each open work', null],
    ];

    public const ACTIONS = ['tell', 'task', 'date', 'follow', 'tag', 'flag'];

    public const WHO = ['lead' => 'The lead', 'members' => 'Everyone on the work', 'followers' => 'Its followers', 'lead_manager' => 'The lead\'s manager', 'owner' => 'The opportunity\'s owner', 'person' => 'The person it is about'];

    private static bool $running = false;

    public function __construct(private ProjectAccess $access) {}

    public static function ready(): bool
    {
        return ProjectKpis::ready() && Schema::hasTable('project_rule_runs');
    }

    // ---------------------------------------------------------------- Configuration

    /** @return array<string, mixed> */
    public function config(User $user): array
    {
        $ready = self::ready();
        $today = now()->startOfDay();

        return ['ready' => $ready,
            'rules' => $ready ? DB::table('project_rules')->orderByDesc('is_active')->orderBy('name')->get()->map(fn ($r) => $this->shape($r) + [
                'runs_today' => DB::table('project_rule_runs')->where('rule_id', $r->id)->where('outcome', 'done')->where('created_at', '>=', $today)->count(),
                'last_runs' => DB::table('project_rule_runs')->where('rule_id', $r->id)->orderByDesc('id')->limit(5)->get(['subject', 'outcome', 'note', 'created_at'])->map(fn ($x) => (array) $x)->all()])->all() : [],
            'events' => collect(self::EVENTS)->map(fn ($e, $k) => ['key' => $k, 'name' => $e[0], 'value' => $e[1]])->values()->all(), 'who' => self::WHO,
            'industries' => DB::table('project_industries')->where('is_active', 1)->orderBy('sort_order')->get(['key', 'name'])->map(fn ($i) => (array) $i)->all(),
            'tags' => Schema::hasTable('project_tags') ? DB::table('project_tags')->where('is_active', 1)->orderBy('name')->get(['key', 'name'])->map(fn ($t) => (array) $t)->all() : [],
            'flags' => DB::table('project_lists')->where('list', 'flag')->where('is_active', 1)->orderBy('sort_order')->get(['key', 'name'])->map(fn ($f) => (array) $f)->all(),
            'settings' => app(ProjectSettings::class)->get('insights'),
            'can' => ['change' => $user->hasPermission('projects.rules'), 'settings' => $user->hasPermission('projects.config.manage')]];
    }

    /** @param array<string, mixed> $d name, trigger_event, trigger_value, conditions, actions, is_active, max_per_day */
    public function save(?int $id, array $d, User $by): int
    {
        $by->hasPermission('projects.rules') || throw new ProjectException('Rules need the permission to create automatic rules.', 403);
        self::ready() || throw new ProjectException('Rules need database script 269.', 409);
        $current = $id ? (DB::table('project_rules')->where('id', $id)->first() ?? throw new ProjectException('That rule is not there.', 404)) : null;
        $get = fn ($k, $default = null) => array_key_exists($k, $d) ? $d[$k] : ($current->{$k} ?? $default);
        $event = (string) $get('trigger_event');
        array_key_exists($event, self::EVENTS) || throw new ProjectException('Choose what starts the rule.');
        $value = trim((string) $get('trigger_value')) ?: null;
        if ($event === 'snag_late' && (! ctype_digit((string) $value) || (int) $value < 1)) {
            throw new ProjectException('Say after how many days late.');
        }
        if (in_array($event, ['stage_entered', 'opportunity_moved'], true) && ! $value) {
            throw new ProjectException('Choose the stage.');
        }
        $conditions = $this->cleanConditions(is_array($c = $get('conditions')) ? $c : (json_decode((string) $c, true) ?: []));
        $actions = $this->cleanActions(is_array($a = $get('actions')) ? $a : (json_decode((string) $a, true) ?: []), $event);
        $name = trim((string) $get('name'));
        $name !== '' || throw new ProjectException('Give the rule a name.');
        $max = max(1, min(500, (int) $get('max_per_day', 50)));
        $row = ['name' => mb_substr($name, 0, 160), 'trigger_event' => $event, 'trigger_value' => $value ? mb_substr($value, 0, 120) : null, 'conditions' => json_encode($conditions), 'actions' => json_encode($actions),
            'is_active' => $get('is_active', 0) ? 1 : 0, 'max_per_day' => $max, 'updated_at' => now()];
        if ($id) {
            DB::table('project_rules')->where('id', $id)->update($row);
        } else {
            $id = DB::table('project_rules')->insertGetId($row + ['created_by' => $by->id, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'rule.saved', 'rule', $id, null, ['name' => $name, 'on' => (bool) $row['is_active']]);

        return $id;
    }

    // ---------------------------------------------------------------- running

    /** Something happened: run the switched-on rules it starts. $about: what it was (task, date kind, stage, user...). */
    public function fire(string $event, ?object $project, ?User $by = null, array $about = []): void
    {
        if (self::$running || ! self::ready()) {
            return;   // a rule's own actions never start rules
        }
        foreach (DB::table('project_rules')->where('is_active', 1)->where('trigger_event', $event)->get() as $rule) {
            if (! $this->starts($rule, $about)) {
                continue;
            }
            $subject = $this->subject($event, $project, $about);
            if ($project && ! $this->matches($rule, $project)) {
                continue;
            }
            if (DB::table('project_rule_runs')->where('rule_id', $rule->id)->where('outcome', 'done')->where('created_at', '>=', now()->startOfDay())->count() >= (int) $rule->max_per_day) {
                $this->log($rule, $project, $event, $subject, [], 'skipped', 'Reached its runs for today.');
                continue;
            }
            self::$running = true;
            try {
                $done = [];
                foreach (json_decode((string) $rule->actions, true) ?: [] as $a) {
                    $done[] = $this->act($a, $rule, $project, $about);
                }
                $this->log($rule, $project, $event, $subject, $done, 'done', null);
                if ($project) {
                    ProjectLog::record((int) $project->id, null, 'rule.ran', 'rule', (int) $rule->id, null, ['rule' => $rule->name, 'did' => $done]);
                }
            } catch (\Throwable $e) {
                report($e);
                $this->log($rule, $project, $event, $subject, [], 'failed', mb_substr($e->getMessage(), 0, 300));
            } finally {
                self::$running = false;
            }
        }
    }

    /** Every morning: late tasks and snags, missing timesheets on Tuesdays, and the every-morning rules. @return int rules run */
    public function morning(?Carbon $now = null): int
    {
        $now ??= now();
        if (! self::ready() || ! DB::table('project_rules')->where('is_active', 1)->exists()) {
            return 0;
        }
        $before = DB::table('project_rule_runs')->count();
        $open = fn () => DB::table('projects')->whereNull('deleted_at')->whereIn('state', ['open', 'on_hold'])->whereNull('frozen_at');
        $yesterday = $now->copy()->subDay()->toDateString();
        foreach (DB::table('project_work_tasks as t')->join('projects as p', 'p.id', '=', 't.project_id')->whereNull('p.deleted_at')->whereIn('p.state', ['open', 'on_hold'])->whereNull('t.deleted_at')
            ->whereNotIn('t.status', ['done', 'cancelled'])->where('t.due_date', $yesterday)->get(['t.id', 't.title', 't.project_id']) as $t) {
            $this->fire('task_late', DB::table('projects')->find($t->project_id), null, ['task_id' => (int) $t->id, 'title' => $t->title]);
        }
        if (ProjectsSetup::site()) {
            foreach (DB::table('project_rules')->where('is_active', 1)->where('trigger_event', 'snag_late')->pluck('trigger_value')->unique() as $days) {
                foreach (DB::table('project_snags')->where('state', 'open')->whereNull('deleted_at')->where('due_on', $now->copy()->subDays((int) $days)->toDateString())->get(['id', 'number', 'title', 'project_id']) as $s) {
                    $this->fire('snag_late', DB::table('projects')->find($s->project_id), null, ['days' => (int) $days, 'title' => "Snag {$s->number}: {$s->title}"]);
                }
            }
        }
        if ($now->isTuesday()) {
            $from = $now->copy()->startOfWeek()->subWeek();
            foreach (DB::table('project_time')->whereNull('deleted_at')->where('state', 'draft')->whereBetween('work_date', [$from->toDateString(), $from->copy()->addDays(6)->toDateString()])->distinct()->get(['user_id', 'project_id']) as $x) {
                $this->fire('timesheet_missing', DB::table('projects')->find($x->project_id), null, ['user_id' => (int) $x->user_id]);
            }
        }
        if (DB::table('project_rules')->where('is_active', 1)->where('trigger_event', 'every_morning')->exists()) {
            foreach ($open()->get() as $p) {
                $this->fire('every_morning', $p);
            }
        }

        return DB::table('project_rule_runs')->count() - $before;
    }

    /** What a rule would have done in the last 30 days, from what happened. Nothing is done. @return array{runs: int, examples: string[]} */
    public function trial(int $id, User $user): array
    {
        $user->hasPermission('projects.rules') || throw new ProjectException('Rules need the permission to create automatic rules.', 403);
        $rule = DB::table('project_rules')->where('id', $id)->first() ?? throw new ProjectException('That rule is not there.', 404);
        $from = now()->subDays(30);
        $events = [];
        $work = fn ($id) => DB::table('projects')->where('id', $id)->whereNull('deleted_at')->first();
        switch ($rule->trigger_event) {
            case 'work_started':
                foreach (DB::table('projects')->whereNull('deleted_at')->where('created_at', '>=', $from)->get() as $p) {
                    $events[] = [$p, [], "{$p->number} started"];
                }
                break;
            case 'stage_entered':
                foreach (DB::table('project_log')->whereIn('action', ['stage.moved', 'project.closed'])->where('created_at', '>=', $from)->get() as $l) {
                    $stage = json_decode((string) $l->new_values, true)['stage'] ?? null;
                    if ($stage && ($p = $work($l->project_id))) {
                        $events[] = [$p, ['stage' => $stage], "{$p->number} entered {$stage}"];
                    }
                }
                break;
            case 'date_missed':
                foreach (DB::table('project_key_dates')->where('state', 'missed')->whereNull('deleted_at')->where('starts_at', '>=', $from)->get() as $k) {
                    if ($p = $work($k->project_id)) {
                        $events[] = [$p, ['kind' => $k->kind], "{$p->number}: {$k->title} missed"];
                    }
                }
                break;
            case 'task_late':
                foreach (DB::table('project_work_tasks')->whereNull('deleted_at')->where('due_date', '>=', $from->toDateString())->where('due_date', '<', now()->toDateString())
                    ->where(fn ($q) => $q->whereNotIn('status', ['done', 'cancelled'])->orWhereRaw('substr(completed_at, 1, 10) > due_date'))->get() as $t) {
                    if ($p = $work($t->project_id)) {
                        $events[] = [$p, [], "{$p->number}: {$t->title} went late"];
                    }
                }
                break;
            case 'snag_raised':
            case 'snag_late':
                if (ProjectsSetup::site()) {
                    foreach (DB::table('project_snags')->whereNull('deleted_at')->where('created_at', '>=', $from)->get() as $s) {
                        $late = $rule->trigger_event === 'snag_late';
                        if ($late && (! $s->due_on || Carbon::parse($s->due_on)->addDays((int) $rule->trigger_value)->gt(now()) || ($s->fixed_at && Carbon::parse($s->fixed_at)->lte(Carbon::parse($s->due_on)->addDays((int) $rule->trigger_value))))) {
                            continue;
                        }
                        if ($p = $work($s->project_id)) {
                            $events[] = [$p, ['days' => (int) $rule->trigger_value], "{$p->number}: snag {$s->number}" . ($late ? ' went late' : ' raised')];
                        }
                    }
                }
                break;
            case 'kpi_red':
                foreach (DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('status', 'bad')->where('week', '>=', $from->copy()->startOfWeek()->toDateString())->distinct()->pluck('subject_id') as $pid) {
                    if ($p = $work($pid)) {
                        $events[] = [$p, [], "{$p->number} was red"];
                    }
                }
                break;
            case 'opportunity_moved':
                foreach (DB::table('project_log')->where('action', 'opportunity.moved')->where('created_at', '>=', $from)->get() as $l) {
                    $stage = json_decode((string) $l->new_values, true)['stage'] ?? null;
                    $events[] = [null, ['stage' => $stage, 'opportunity_id' => (int) $l->subject_id], "An opportunity moved to {$stage}"];
                }
                break;
            default:
                $n = DB::table('projects')->whereNull('deleted_at')->whereIn('state', ['open', 'on_hold'])->count();

                return ['runs' => $n, 'examples' => [$rule->trigger_event === 'every_morning' ? "Every morning on each of the {$n} open works that match." : 'This one can only be tried as it happens.']];
        }
        $hits = array_values(array_filter($events, fn ($e) => $this->starts($rule, $e[1]) && (! $e[0] || $this->matches($rule, $e[0]))));

        return ['runs' => count($hits), 'examples' => array_slice(array_column($hits, 2), 0, 10)];
    }

    // ------------------------------------------------------------------ inside

    private function starts(object $rule, array $about): bool
    {
        $value = $rule->trigger_value;

        return match ($rule->trigger_event) {
            'stage_entered', 'opportunity_moved' => $value !== null && mb_strtolower((string) ($about['stage'] ?? '')) === mb_strtolower($value),
            'date_missed' => ! $value || ($about['kind'] ?? null) === $value,
            'snag_late' => (int) ($about['days'] ?? 0) === (int) $value,
            default => true,
        };
    }

    private function matches(object $rule, object $project): bool
    {
        $c = json_decode((string) $rule->conditions, true) ?: [];
        if (! empty($c['industry']) && $project->industry_key !== $c['industry']) {
            return false;
        }
        if (! empty($c['type_id']) && (int) $project->type_id !== (int) $c['type_id']) {
            return false;
        }
        if (! empty($c['priority']) && ! in_array($project->priority, (array) $c['priority'], true)) {
            return false;
        }
        if (! empty($c['lead_id']) && (int) $project->lead_user_id !== (int) $c['lead_id']) {
            return false;
        }
        if (! empty($c['stage']) && mb_strtolower((string) DB::table('project_stages')->where('id', $project->stage_id)->value('name')) !== mb_strtolower($c['stage'])) {
            return false;
        }
        if (! empty($c['field']['key'])) {
            $field = DB::table('project_fields')->where('key', $c['field']['key'])->value('id');
            $v = $field ? DB::table('project_field_values')->where('project_id', $project->id)->where('field_id', $field)->value('value') : null;
            if ((string) $v !== (string) ($c['field']['value'] ?? '')) {
                return false;
            }
        }

        return true;
    }

    /** One action. Each answers what it did, in words. */
    private function act(array $a, object $rule, ?object $project, array $about): string
    {
        $title = $project ? "{$rule->name} · {$project->number}" : $rule->name;
        $path = $project ? "/admin/projects/{$project->id}" : '/admin/projects/pipeline';
        switch ($a['do']) {
            case 'tell':
                $people = $this->people($a['who'] ?? 'lead', $project, $about, $a['user_id'] ?? null);
                ProjectNotices::tell($people, ProjectNotices::TASK, $title, ($a['message'] ?? '') ?: ($about['title'] ?? 'A rule ran.'), $path, 'Open it');

                return 'told ' . (count($people) ? implode(', ', array_map(fn ($u) => $u->name, $people)) : 'nobody (no one to tell)');
            case 'task':
                if (! $project) {
                    return 'no task: not about a piece of work';
                }
                $number = (int) DB::table('project_work_tasks')->where('project_id', $project->id)->max('number') + 1;
                $id = DB::table('project_work_tasks')->insertGetId(['project_id' => $project->id, 'number' => $number, 'title' => mb_substr((string) $a['title'], 0, 200), 'status' => 'todo', 'priority' => 'high',
                    'due_date' => now()->addDays((int) ($a['days'] ?? 1))->toDateString(), 'sort_order' => $number, 'created_at' => now(), 'updated_at' => now()]);
                foreach ($this->people($a['who'] ?? 'lead', $project, $about, $a['user_id'] ?? null) as $u) {
                    DB::table('project_task_people')->insertOrIgnore(['task_id' => $id, 'user_id' => $u->id]);
                }

                return "made task {$project->number}-T{$number}";
            case 'date':
                if (! $project) {
                    return 'no key date: not about a piece of work';
                }
                $id = DB::table('project_key_dates')->insertGetId(['project_id' => $project->id, 'kind' => $a['kind'] ?? null, 'title' => mb_substr((string) $a['title'], 0, 200), 'starts_at' => now()->startOfDay()->addDays((int) ($a['days'] ?? 7))->format('Y-m-d 00:00:00'),
                    'all_day' => 1, 'responsible_id' => $project->lead_user_id, 'state' => 'open', 'created_at' => now(), 'updated_at' => now()]);
                app(ProjectKeyDates::class)->sync($id);

                return "made key date \"{$a['title']}\"";
            case 'follow':
                if (! $project) {
                    return 'no one follows: not about a piece of work';
                }
                $people = $this->people($a['who'] ?? 'lead_manager', $project, $about, $a['user_id'] ?? null);
                foreach ($people as $u) {
                    DB::table('project_follows')->updateOrInsert(['user_id' => $u->id, 'subject_type' => 'project', 'subject_id' => $project->id], ['muted' => 0, 'created_at' => now()]);
                }

                return 'followed by ' . (count($people) ? implode(', ', array_map(fn ($u) => $u->name, $people)) : 'nobody');
            case 'tag':
                $tag = DB::table('project_tags')->where('key', $a['tag'] ?? '')->value('id');
                $thread = $project ? DB::table('project_threads')->where('project_id', $project->id)->where('state', 'open')->orderByDesc('last_message_at')->value('id') : null;
                if (! $tag || ! $thread) {
                    return 'not tagged: ' . (! $tag ? 'the tag is not there' : 'no open conversation');
                }
                DB::table('project_thread_tags')->insertOrIgnore(['thread_id' => $thread, 'tag_id' => $tag]);

                return "tagged #{$a['tag']}";
            case 'flag':
                $customer = $project?->customer_id ?: (isset($about['opportunity_id']) ? DB::table('project_opportunities')->where('id', $about['opportunity_id'])->value('customer_id') : null);
                $flag = DB::table('project_lists')->where('list', 'flag')->where('key', $a['flag'] ?? '')->value('id');
                if (! $customer || ! $flag) {
                    return 'no flag: ' . (! $customer ? 'no client' : 'the flag is not there');
                }
                if (DB::table('project_client_flags')->where('customer_id', $customer)->where('flag_id', $flag)->whereNull('removed_at')->exists()) {
                    return 'the client already has that flag';
                }
                DB::table('project_client_flags')->insert(['customer_id' => $customer, 'flag_id' => $flag, 'reason' => mb_substr("By the rule \"{$rule->name}\"", 0, 300), 'set_at' => now()]);

                return 'flagged the client';
        }

        return 'nothing';
    }

    /** @return User[] */
    private function people(string $who, ?object $project, array $about, mixed $userId): array
    {
        $ids = match ($who) {
            'lead' => $project ? [(int) $project->lead_user_id] : [],
            'members' => $project ? DB::table('project_members')->where('project_id', $project->id)->where('status', 'active')->pluck('user_id')->all() : [],
            'followers' => $project ? DB::table('project_follows')->where('subject_type', 'project')->where('subject_id', $project->id)->where('muted', 0)->pluck('user_id')->all() : [],
            'lead_manager' => $project ? array_filter([$this->managerOf((int) $project->lead_user_id)]) : [],
            'owner' => isset($about['opportunity_id']) ? [(int) DB::table('project_opportunities')->where('id', $about['opportunity_id'])->value('owner_id')] : [],
            'person' => isset($about['user_id']) ? [(int) $about['user_id']] : [],
            'user' => $userId ? [(int) $userId] : [],
            default => [],
        };

        return User::whereIn('id', array_values(array_unique(array_filter($ids))) ?: [0])->get()->all();
    }

    private function managerOf(int $userId): ?int
    {
        if (! Schema::hasTable('employees') || ! Schema::hasColumn('employees', 'manager_id')) {
            return null;
        }
        $manager = DB::table('employees')->where('user_id', $userId)->value('manager_id');

        return $manager ? (int) DB::table('employees')->where('id', $manager)->value('user_id') ?: null : null;
    }

    private function cleanConditions(array $c): array
    {
        $out = [];
        if (! empty($c['industry'])) {
            DB::table('project_industries')->where('key', $c['industry'])->exists() || throw new ProjectException('Choose an industry.');
            $out['industry'] = (string) $c['industry'];
        }
        if (! empty($c['type_id'])) {
            DB::table('project_types')->where('id', (int) $c['type_id'])->exists() || throw new ProjectException('Choose a kind of work.');
            $out['type_id'] = (int) $c['type_id'];
        }
        if (! empty($c['priority'])) {
            $p = array_values(array_intersect((array) $c['priority'], ProjectService::PRIORITIES));
            $p || throw new ProjectException('Choose a priority.');
            $out['priority'] = $p;
        }
        foreach (['lead_id' => 'int', 'stage' => 'string'] as $k => $t) {
            if (! empty($c[$k])) {
                $out[$k] = $t === 'int' ? (int) $c[$k] : mb_substr((string) $c[$k], 0, 120);
            }
        }
        if (! empty($c['field']['key'])) {
            $out['field'] = ['key' => (string) $c['field']['key'], 'value' => (string) ($c['field']['value'] ?? '')];
        }

        return $out;
    }

    private function cleanActions(array $actions, string $event): array
    {
        $actions || throw new ProjectException('Add at least one thing the rule does.');
        count($actions) <= 6 || throw new ProjectException('A rule does at most six things.');
        $out = [];
        foreach ($actions as $a) {
            $do = $a['do'] ?? null;
            in_array($do, self::ACTIONS, true) || throw new ProjectException('A rule may tell, make a task or a key date, add a follower, tag or flag. Nothing else.');
            $who = $a['who'] ?? null;
            if (in_array($do, ['tell', 'task', 'follow'], true)) {
                ($who === 'user' || array_key_exists((string) $who, self::WHO)) || throw new ProjectException('Choose who.');
                if ($who === 'user' && ! User::whereKey((int) ($a['user_id'] ?? 0))->exists()) {
                    throw new ProjectException('Choose the person.');
                }
                if ($who === 'owner' && $event !== 'opportunity_moved') {
                    throw new ProjectException('"The opportunity\'s owner" is only for rules about opportunities.');
                }
                if ($who === 'person' && $event !== 'timesheet_missing') {
                    throw new ProjectException('"The person it is about" is only for rules about timesheets.');
                }
            }
            if (in_array($do, ['task', 'date'], true) && trim((string) ($a['title'] ?? '')) === '') {
                throw new ProjectException('Name the ' . ($do === 'task' ? 'task' : 'key date') . ' it makes.');
            }
            if ($event === 'opportunity_moved' && in_array($do, ['task', 'date', 'follow', 'tag'], true)) {
                throw new ProjectException('An opportunity is not a piece of work yet: a rule about it can tell or flag only.');
            }
            $out[] = array_filter(['do' => $do, 'who' => $who, 'user_id' => isset($a['user_id']) ? (int) $a['user_id'] : null, 'title' => isset($a['title']) ? mb_substr(trim((string) $a['title']), 0, 200) : null,
                'message' => isset($a['message']) ? mb_substr(trim((string) $a['message']), 0, 500) : null, 'days' => isset($a['days']) ? max(0, min(365, (int) $a['days'])) : null,
                'kind' => $a['kind'] ?? null, 'tag' => $a['tag'] ?? null, 'flag' => $a['flag'] ?? null], fn ($v) => $v !== null && $v !== '');
        }

        return $out;
    }

    private function subject(string $event, ?object $project, array $about): string
    {
        return mb_substr(trim(($project ? "{$project->number} " : '') . ($about['title'] ?? ($about['stage'] ?? self::EVENTS[$event][0]))), 0, 200);
    }

    private function log(object $rule, ?object $project, string $event, string $subject, array $done, string $outcome, ?string $note): void
    {
        DB::table('project_rule_runs')->insert(['rule_id' => $rule->id, 'project_id' => $project?->id, 'event' => $event, 'subject' => $subject, 'done' => json_encode($done), 'outcome' => $outcome, 'note' => $note, 'created_at' => now()]);
        DB::table('project_rules')->where('id', $rule->id)->update(['last_run_at' => now()]);
    }

    /** @return array<string, mixed> */
    private function shape(object $r): array
    {
        return ['id' => (int) $r->id, 'key' => $r->key, 'name' => $r->name, 'trigger_event' => $r->trigger_event, 'trigger_value' => $r->trigger_value, 'conditions' => json_decode((string) $r->conditions, true) ?: (object) [],
            'actions' => json_decode((string) $r->actions, true) ?: [], 'is_active' => (bool) $r->is_active, 'max_per_day' => (int) $r->max_per_day, 'last_run_at' => $r->last_run_at];
    }
}
