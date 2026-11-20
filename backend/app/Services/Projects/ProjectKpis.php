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
