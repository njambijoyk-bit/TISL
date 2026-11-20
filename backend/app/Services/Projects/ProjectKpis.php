<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * KPIs (docs/PROJECTS_STAGE12_SPEC.md, builds 12.1 and 12.2): a measure from the library with a green and an amber target, where it applies
 * (every industry, one industry, or one kind of work) and whether the client sees it. Targets are percentages, counts, days or hours, never
 * amounts (choice 1). A piece of work's health is its worst KPI (choice 2).
 */
class ProjectKpis
{
    public const STATUSES = ['good', 'warn', 'bad', 'none'];

    public function __construct(private ProjectAccess $access, private ProjectMeasures $measures) {}

    public static function ready(): bool
    {
        return ProjectsSetup::ready() && Schema::hasTable('project_kpis') && Schema::hasTable('project_updates');
    }

    // ---------------------------------------------------------------- Configuration (12.1)

    /** @return array<string, mixed> */
    public function config(User $user): array
    {
        $ready = self::ready();
        $types = DB::table('project_types')->whereNull('deleted_at')->pluck('name', 'id');

        return ['ready' => $ready,
            'kpis' => $ready ? DB::table('project_kpis')->orderByRaw('industry_key IS NOT NULL')->orderBy('industry_key')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn ($k) => $this->shape($k) + ['type' => $k->type_id ? ($types[$k->type_id] ?? null) : null])->all() : [],
            'measures' => collect(ProjectMeasures::MEASURES)->map(fn ($m, $key) => ['key' => $key, 'name' => $m[0], 'unit' => $m[1], 'about' => $m[2], 'higher' => $m[3], 'books' => $m[4], 'how' => $m[5]])->values()->all(),
            'industries' => DB::table('project_industries')->where('is_active', 1)->orderBy('sort_order')->get(['key', 'name'])->map(fn ($i) => ['key' => $i->key, 'name' => $i->name])->all(),
            'can' => ['change' => $user->hasPermission('projects.kpis')]];
    }

    /** @param array<string, mixed> $d measure, name, industry_key, type_id, target_good, target_warn, client_sees, is_active */
    public function save(?int $id, array $d, User $by): int
    {
        $by->hasPermission('projects.kpis') || throw new ProjectException('Setting KPIs needs the KPI permission.', 403);
        self::ready() || throw new ProjectException('KPIs need database script 269.', 409);
        $current = $id ? (DB::table('project_kpis')->where('id', $id)->first() ?? throw new ProjectException('That KPI is not there.', 404)) : null;
        $get = fn ($k, $default = null) => array_key_exists($k, $d) ? $d[$k] : ($current->{$k} ?? $default);
        $measure = (string) $get('measure');
        $m = ProjectMeasures::MEASURES[$measure] ?? throw new ProjectException('Choose what it measures from the list.');
        $name = trim((string) $get('name')) ?: $m[0];
        $industry = $get('industry_key') ?: null;
        if ($industry && ! DB::table('project_industries')->where('key', $industry)->exists()) {
            throw new ProjectException('Choose an industry.');
        }
        $type = $get('type_id') ? (int) $get('type_id') : null;
        if ($type) {
            $t = DB::table('project_types')->where('id', $type)->whereNull('deleted_at')->first() ?? throw new ProjectException('Choose a kind of work.');
            $industry = $t->industry_key;
        }
        if ($m[2] !== 'work' && ($industry || $type)) {
            throw new ProjectException('A measure about people or the company applies everywhere, not to one industry.');
        }
        foreach (['target_good', 'target_warn'] as $k) {
            if (! is_numeric($get($k))) {
                throw new ProjectException('Give a green and an amber target as numbers.');
            }
        }
        [$good, $warn] = [round((float) $get('target_good'), 2), round((float) $get('target_warn'), 2)];
        if (($m[3] && $warn > $good) || (! $m[3] && $warn < $good)) {
            throw new ProjectException($m[3] ? 'Higher is better here, so amber must start at or below green.' : 'Lower is better here, so amber must start at or above green.');
        }
        if ($m[1] === 'pct' && (max($good, $warn) > 1000 || min($good, $warn) < -1000)) {
            throw new ProjectException('A percentage target must be between -1000 and 1000.');
        }
        $row = ['measure' => $measure, 'name' => mb_substr($name, 0, 120), 'industry_key' => $industry, 'type_id' => $type, 'target_good' => $good, 'target_warn' => $warn,
            'client_sees' => $m[2] === 'work' && $get('client_sees') ? 1 : 0, 'is_active' => $get('is_active', 1) ? 1 : 0, 'updated_at' => now()];
        if ($id) {
            DB::table('project_kpis')->where('id', $id)->update($row);
        } else {
            $id = DB::table('project_kpis')->insertGetId($row + ['key' => 'k' . substr(md5($name . microtime()), 0, 12), 'sort_order' => (int) DB::table('project_kpis')->max('sort_order') + 10, 'created_by' => $by->id, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, 'kpi.saved', 'kpi', $id, $current ? (array) $current : null, $row);

        return $id;
    }

    // ---------------------------------------------------------------- working it out

    // ---------------------------------------------------------------- scorecards (12.2)

    /** A piece of work's scorecard: each KPI now, its last eight weeks, and the health. Money figures only for those who see the money. @return array<string, mixed> */
    public function scorecard(object $project, User $user): array
    {
        $this->access->authorize($user, 'open', $project);
        if (! self::ready()) {
            return ['ready' => false];
        }
        $money = $this->access->decide($user, 'money', $project)['allowed'];
        $kpis = $this->forWork($project);
        $weeks = $this->weeks(8);
        $history = DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('subject_id', $project->id)->whereIn('week', $weeks)->get()->groupBy('kpi_id');
        $rows = $kpis->map(function ($k) use ($project, $money, $weeks, $history) {
            $r = $this->evaluate($k, 'work', $project);
            $books = ProjectMeasures::MEASURES[$k->measure][4];
            $past = ($history[$k->id] ?? collect())->keyBy(fn ($h) => substr((string) $h->week, 0, 10));

            return $this->shape($k) + ['status' => $r['status'], 'value' => $books && ! $money ? null : $r['value'], 'detail' => $books && ! $money ? 'The figure is for those who see the work\'s money.' : $r['detail'],
                'weeks' => array_map(fn ($w) => $past[$w]->status ?? null, $weeks)];
        })->values()->all();

        return ['ready' => true, 'health' => self::worst(array_column($rows, 'status')), 'kpis' => $rows, 'weeks' => $weeks, 'can' => ['change' => $user->hasPermission('projects.kpis')]];
    }

    /** What the client sees on the portal: the KPIs marked so, never a money one. @return array<int, array<string, mixed>> */
    public function forClient(object $project): array
    {
        if (! self::ready()) {
            return [];
        }

        return $this->forWork($project)->filter(fn ($k) => $k->client_sees && ! ProjectMeasures::MEASURES[$k->measure][4])
            ->map(fn ($k) => ['name' => $k->name, 'unit' => ProjectMeasures::MEASURES[$k->measure][1]] + array_intersect_key($this->evaluate($k, 'work', $project), ['value' => 1, 'status' => 1]))->values()->all();
    }

    /** Health of many works from their latest snapshot (for the list). @return array<int, string> project id => good|warn|bad|none */
    public function healthOf(array $ids): array
    {
        if (! self::ready() || ! $ids) {
            return [];
        }
        $latest = DB::table('project_kpi_snapshots')->where('subject_type', 'work')->whereIn('subject_id', $ids)->max('week');
        if (! $latest) {
            return [];
        }
        $out = [];
        foreach (DB::table('project_kpi_snapshots')->where('subject_type', 'work')->whereIn('subject_id', $ids)->where('week', $latest)->get(['subject_id', 'status'])->groupBy('subject_id') as $id => $rows) {
            $out[(int) $id] = self::worst($rows->pluck('status')->all());
        }

        return $out;
    }

    /** Works whose latest health is this one (the list's filter). @return int[] */
    public function worksWithHealth(string $health): array
    {
        if (! self::ready()) {
            return [];
        }
        $latest = DB::table('project_kpi_snapshots')->where('subject_type', 'work')->max('week');
        if (! $latest) {
            return [];
        }
        $by = DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('week', $latest)->get(['subject_id', 'status'])->groupBy('subject_id');

        return $by->filter(fn ($rows) => self::worst($rows->pluck('status')->all()) === $health)->keys()->map(fn ($v) => (int) $v)->all();
    }

    /**
     * Every morning: this week's row for each KPI of each open work and each person, kept over the week (the Monday's week). A work that turns
     * red is told to its lead once. @return array{works: int, people: int, turned_red: int}
     */
    public function snapshot(?Carbon $now = null): array
    {
        $now ??= now();
        if (! self::ready()) {
            return ['works' => 0, 'people' => 0, 'turned_red' => 0];
        }
        $week = $now->copy()->startOfWeek()->toDateString();
        $red = 0;
        $works = DB::table('projects')->whereNull('deleted_at')->whereIn('state', ['open', 'on_hold'])->whereNull('frozen_at')->get();
        foreach ($works as $project) {
            $before = $this->latestHealth((int) $project->id);
            $statuses = [];
            foreach ($this->forWork($project) as $k) {
                $r = $this->evaluate($k, 'work', $project, $now);
                $statuses[] = $r['status'];
                $this->keep($k, 'work', (int) $project->id, $week, $r);
            }
            if (self::worst($statuses) === 'bad' && $before !== 'bad') {
                $red++;
                $bad = $this->forWork($project)->filter(fn ($k) => $this->evaluate($k, 'work', $project, $now)['status'] === 'bad')->pluck('name')->all();
                ProjectNotices::tell(User::find($project->lead_user_id), ProjectNotices::TASK, "{$project->number} has turned red", implode(', ', $bad) . ' missed the target.', "/admin/projects/{$project->id}", 'Open the scorecard');
                app(ProjectRules::class)->fire('kpi_red', $project, null, ['kpis' => $bad]);
            }
        }
        $people = 0;
        $personKpis = DB::table('project_kpis')->where('is_active', 1)->whereIn('measure', $this->measuresAbout('person'))->get();
        if ($personKpis->isNotEmpty()) {
            foreach (app(\App\Services\Notify\Staff::class)->holding('projects.use') as $u) {
                foreach ($personKpis as $k) {
                    $this->keep($k, 'person', (int) $u->id, $week, $this->evaluate($k, 'person', (int) $u->id, $now));
                }
                $people++;
            }
        }

        return ['works' => $works->count(), 'people' => $people, 'turned_red' => $red];
    }

    /** @return string[] the Mondays of the last $n weeks, oldest first */
    public function weeks(int $n): array
    {
        $out = [];
        for ($i = $n - 1; $i >= 0; $i--) {
            $out[] = now()->startOfWeek()->subWeeks($i)->toDateString();
        }

        return $out;
    }

    private function keep(object $k, string $type, int $id, string $week, array $r): void
    {
        $money = ProjectMeasures::MEASURES[$k->measure][4];
        DB::table('project_kpi_snapshots')->updateOrInsert(['kpi_id' => $k->id, 'subject_type' => $type, 'subject_id' => $id, 'week' => $week],
            ['status' => $r['status'], 'value' => $money ? null : $r['value'], 'created_at' => now()]);   // a money figure is never kept, only its status
    }

    private function latestHealth(int $projectId): string
    {
        $latest = DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('subject_id', $projectId)->max('week');

        return $latest ? self::worst(DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('subject_id', $projectId)->where('week', $latest)->pluck('status')->all()) : 'none';
    }

    /** The KPIs that apply to a piece of work. */
    public function forWork(object $project)
    {
        return DB::table('project_kpis')->where('is_active', 1)->whereIn('measure', $this->measuresAbout('work'))
            ->where(fn ($q) => $q->whereNull('industry_key')->orWhere('industry_key', $project->industry_key))->where(fn ($q) => $q->whereNull('type_id')->orWhere('type_id', $project->type_id))
            ->orderByRaw('industry_key IS NULL')->orderBy('sort_order')->get();
    }

    /** One KPI on one subject: the figure, the status, how it was worked out. @return array<string, mixed> */
    public function evaluate(object $kpi, string $subjectType, object|int $subject, ?Carbon $now = null): array
    {
        $r = match ($subjectType) {
            'work' => $this->measures->work($kpi->measure, $subject, $now),
            'person' => $this->measures->person($kpi->measure, (int) $subject, $now),
            default => $this->measures->company($kpi->measure, $now),
        };

        return ['value' => $r['value'], 'detail' => $r['detail'], 'status' => $this->status($kpi, $r['value'])];
    }

    public function status(object $kpi, ?float $value): string
    {
        if ($value === null) {
            return 'none';
        }
        $higher = ProjectMeasures::MEASURES[$kpi->measure][3] ?? true;
        if ($higher) {
            return $value >= (float) $kpi->target_good ? 'good' : ($value >= (float) $kpi->target_warn ? 'warn' : 'bad');
        }

        return $value <= (float) $kpi->target_good ? 'good' : ($value <= (float) $kpi->target_warn ? 'warn' : 'bad');
    }

    /** Health: the worst status among the KPIs that could be worked out. */
    public static function worst(array $statuses): string
    {
        foreach (['bad', 'warn', 'good'] as $s) {
            if (in_array($s, $statuses, true)) {
                return $s;
            }
        }

        return 'none';
    }

    /** @return string[] */
    public function measuresAbout(string $about): array
    {
        return array_keys(array_filter(ProjectMeasures::MEASURES, fn ($m) => $m[2] === $about));
    }

    /** @return array<string, mixed> */
    public function shape(object $k): array
    {
        $m = ProjectMeasures::MEASURES[$k->measure] ?? ['?', 'count', 'work', true, false, ''];

        return ['id' => (int) $k->id, 'key' => $k->key, 'measure' => $k->measure, 'name' => $k->name, 'industry' => $k->industry_key, 'type_id' => $k->type_id ? (int) $k->type_id : null,
            'target_good' => (float) $k->target_good, 'target_warn' => (float) $k->target_warn, 'client_sees' => (bool) $k->client_sees, 'is_active' => (bool) $k->is_active,
            'unit' => $m[1], 'about' => $m[2], 'higher' => $m[3], 'books' => $m[4], 'how' => $m[5]];
    }
}
