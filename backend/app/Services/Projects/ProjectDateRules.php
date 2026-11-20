<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Date rules (docs/PROJECTS_STAGE11_SPEC.md, build 11.3): when a key date of one kind is set or marked done, or a work enters a stage, make a key
 * date of another kind so many days later (calendar or working days), with its warnings. A date made by a rule names the rule. Moving the first
 * date moves the one made from it, while that one is still open and has not been moved or changed by hand. A made date can start a rule of its
 * own, up to five steps.
 */
class ProjectDateRules
{
    public const TRIGGERS = ['date_set' => 'A key date of this kind is set', 'date_done' => 'A key date of this kind is done', 'stage' => 'The work enters this stage'];

    private const DEPTH = 5;

    public function __construct(private ProjectAccess $access) {}

    // ---------------------------------------------------------------- Configuration

    /** @return array<string, mixed> */
    public function config(string $industry, User $user): array
    {
        $ready = ProjectWorkTemplates::ready();
        $types = DB::table('project_types')->where('industry_key', $industry)->whereNull('deleted_at')->pluck('id')->all();

        return ['ready' => $ready, 'triggers' => self::TRIGGERS,
            'rules' => $ready ? DB::table('project_date_rules')->where('industry_key', $industry)->orderBy('trigger_kind')->orderBy('name')->get()->map(fn ($r) => $this->shape($r))->all() : [],
            'date_kinds' => collect(app(ProjectLists::class)->of('key_date', true, $industry))->map(fn ($k) => ['key' => $k['key'], 'name' => $k['name']])->values()->all(),
            'stages' => DB::table('project_stages')->whereIn('type_id', $types ?: [0])->whereNull('deleted_at')->orderBy('sort_order')->distinct()->pluck('name')->unique()->values()->all(),
            'can' => ['change' => $user->hasPermission('projects.config.stages')]];
    }

    /** @param array<string, mixed> $d industry, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active */
    public function save(?int $id, array $d, User $by): void
    {
        $by->hasPermission('projects.config.stages') || throw new ProjectException('Changing date rules needs the permission to set up kinds of work.', 403);
        ProjectWorkTemplates::ready() || throw new ProjectException('Date rules need database script 268.', 409);
        $current = $id ? (DB::table('project_date_rules')->where('id', $id)->first() ?? throw new ProjectException('That rule is not there.', 404)) : null;
        $industry = $current->industry_key ?? (string) ($d['industry'] ?? '');
        DB::table('project_industries')->where('key', $industry)->exists() || throw new ProjectException('Choose an industry.');
        $get = fn ($k, $default = null) => array_key_exists($k, $d) ? $d[$k] : ($current->{$k} ?? $default);
        $trigger = (string) $get('trigger_kind');
        array_key_exists($trigger, self::TRIGGERS) || throw new ProjectException('Choose what starts the rule.');
        $value = trim((string) $get('trigger_value'));
        $value !== '' || throw new ProjectException($trigger === 'stage' ? 'Choose the stage.' : 'Choose the kind of key date.');
        $kinds = collect(app(ProjectLists::class)->of('key_date', false, $industry))->pluck('key')->all();
        if ($trigger !== 'stage' && ! in_array($value, $kinds, true)) {
            throw new ProjectException('Choose a kind of key date from the list.');
        }
        $make = trim((string) $get('make_kind')) ?: null;
        if ($make && ! in_array($make, $kinds, true)) {
            throw new ProjectException('Choose the kind of the date it makes from the list.');
        }
        if ($trigger !== 'stage' && $make === $value) {
            throw new ProjectException('A rule cannot make a date of the kind that starts it.');
        }
        $title = trim((string) $get('make_title'));
        $title !== '' || throw new ProjectException('Name the date it makes.');
        $offset = (int) $get('offset_days', 0);
        ($offset >= 0 && $offset <= 3650) || throw new ProjectException('Days after are between 0 and 3650.');
        $name = trim((string) $get('name')) ?: $title;
        $row = ['name' => mb_substr($name, 0, 160), 'trigger_kind' => $trigger, 'trigger_value' => mb_substr($value, 0, 80), 'make_kind' => $make, 'make_title' => mb_substr($title, 0, 200), 'offset_days' => $offset,
            'working_days' => $get('working_days') ? 1 : 0, 'warn_days' => ($w = trim((string) $get('warn_days'))) !== '' ? mb_substr($w, 0, 40) : null, 'is_active' => $get('is_active', 1) ? 1 : 0, 'updated_at' => now()];
        if ($id) {
            DB::table('project_date_rules')->where('id', $id)->update($row);
        } else {
            $id = DB::table('project_date_rules')->insertGetId($row + ['industry_key' => $industry, 'key' => 'r' . substr(md5($name . microtime()), 0, 10), 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'date_rule.saved', 'date_rule', $id, null, $row);
    }

    // ---------------------------------------------------------------- what starts a rule

    /** A key date was set (made) or marked done. */
    public function dateEvent(object $project, int $keyDateId, string $event, User $by, int $depth = 0): void
    {
        if (! ProjectWorkTemplates::ready() || $depth >= self::DEPTH) {
            return;
        }
        $k = DB::table('project_key_dates')->where('id', $keyDateId)->whereNull('deleted_at')->first();
        if (! $k || ! $k->kind) {
            return;
        }
        $base = $event === 'date_done' ? now()->startOfDay() : Carbon::parse($k->starts_at)->startOfDay();
        foreach ($this->rules($project, $event, $k->kind) as $r) {
            if (DB::table('project_rule_dates')->where('rule_id', $r->id)->where('source_date_id', $k->id)->exists()) {
                continue;   // made once from each date
            }
            $this->make($project, $r, $base, (int) $k->id, $by, $depth);
        }
    }

    /** The work entered a stage. */
    public function stageEvent(object $project, string $stageName, User $by): void
    {
        if (! ProjectWorkTemplates::ready()) {
            return;
        }
        foreach ($this->rules($project, 'stage', $stageName) as $r) {
            $made = DB::table('project_rule_dates as d')->join('project_key_dates as k', 'k.id', '=', 'd.key_date_id')->where('d.rule_id', $r->id)->where('k.project_id', $project->id)->whereNull('k.deleted_at')->exists();
            if (! $made) {
                $this->make($project, $r, now()->startOfDay(), null, $by, 0);
            }
        }
    }

    /** A key date moved: the open dates made from it that nobody has touched move with it. */
    public function moved(object $project, int $keyDateId, User $by): void
    {
        if (! ProjectWorkTemplates::ready()) {
            return;
        }
        $k = DB::table('project_key_dates')->where('id', $keyDateId)->first();
        foreach (DB::table('project_rule_dates')->where('source_date_id', $keyDateId)->where('touched', 0)->get() as $link) {
            $made = DB::table('project_key_dates')->where('id', $link->key_date_id)->whereNull('deleted_at')->where('state', 'open')->first();
            $r = DB::table('project_date_rules')->where('id', $link->rule_id)->first();
            if (! $made || ! $r || $r->trigger_kind !== 'date_set') {
                continue;
            }
            $when = $this->after(Carbon::parse($k->starts_at)->startOfDay(), (int) $r->offset_days, (bool) $r->working_days)->format('Y-m-d 00:00:00');
            if ($when === $made->starts_at) {
                continue;
            }
            DB::table('project_key_dates')->where('id', $made->id)->update(['starts_at' => $when, 'moved_from' => $made->starts_at, 'move_reason' => mb_substr("Moved with {$k->title}", 0, 200), 'moved_by' => $by->id, 'warned' => null, 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'key_date.moved_by_rule', 'key_date', (int) $made->id, ['when' => $made->starts_at], ['when' => $when, 'rule' => $r->name]);
            app(ProjectKeyDates::class)->sync((int) $made->id);
            $this->moved($project, (int) $made->id, $by);   // and what was made from it
        }
    }

    /** Someone moved or changed a date a rule made: it no longer follows its source. */
    public function touched(int $keyDateId): void
    {
        if (ProjectWorkTemplates::ready()) {
            DB::table('project_rule_dates')->where('key_date_id', $keyDateId)->update(['touched' => 1]);
        }
    }

    /** For the key dates list: which rule made a date. @return array<int, string> key date id => rule name */
    public function madeBy(array $ids): array
    {
        if (! ProjectWorkTemplates::ready() || ! $ids) {
            return [];
        }

        return DB::table('project_rule_dates as d')->join('project_date_rules as r', 'r.id', '=', 'd.rule_id')->whereIn('d.key_date_id', $ids)->pluck('r.name', 'd.key_date_id')->map(fn ($n) => (string) $n)->all();
    }

    // ------------------------------------------------------------------ inside

    private function rules(object $project, string $trigger, string $value)
    {
        return DB::table('project_date_rules')->where('industry_key', $project->industry_key)->where('is_active', 1)->where('trigger_kind', $trigger)->where('trigger_value', $value)->orderBy('id')->get();
    }

    private function make(object $project, object $r, Carbon $base, ?int $sourceId, User $by, int $depth): void
    {
        $when = $this->after($base, (int) $r->offset_days, (bool) $r->working_days);
        $id = DB::table('project_key_dates')->insertGetId(['project_id' => $project->id, 'kind' => $r->make_kind, 'title' => $r->make_title, 'starts_at' => $when->format('Y-m-d 00:00:00'), 'all_day' => 1,
            'responsible_id' => $project->lead_user_id, 'warn_days' => $r->warn_days, 'state' => 'open', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('project_rule_dates')->insert(['key_date_id' => $id, 'rule_id' => $r->id, 'source_date_id' => $sourceId, 'touched' => 0, 'created_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'key_date.made_by_rule', 'key_date', $id, null, ['title' => $r->make_title, 'when' => $when->toDateString(), 'rule' => $r->name]);
        app(ProjectKeyDates::class)->sync($id);
        $this->dateEvent($project, $id, 'date_set', $by, $depth + 1);
    }

    private function after(Carbon $from, int $days, bool $working): Carbon
    {
        if (! $working) {
            return $from->copy()->addDays($days);
        }
        $d = $from->copy();
        $left = $days;
        while ($left > 0) {
            $d->addDay();
            if (! $d->isWeekend()) {
                $left--;
            }
        }

        return $d;
    }

    /** @return array<string, mixed> */
    private function shape(object $r): array
    {
        return ['id' => (int) $r->id, 'name' => $r->name, 'trigger_kind' => $r->trigger_kind, 'trigger_value' => $r->trigger_value, 'make_kind' => $r->make_kind, 'make_title' => $r->make_title,
            'offset_days' => (int) $r->offset_days, 'working_days' => (bool) $r->working_days, 'warn_days' => $r->warn_days, 'is_active' => (bool) $r->is_active];
    }
}
