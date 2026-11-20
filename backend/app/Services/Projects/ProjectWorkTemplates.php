<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Work templates (docs/PROJECTS_STAGE11_SPEC.md, build 11.1): how a piece of work of one kind starts: its phases, the tasks under them (due so
 * many days after the start, with an estimate) and its key dates. Chosen when a work starts (one template per kind of work is the default) or
 * applied later, when only what is not there yet is added. Also the per-kind settings: confidential to start with, opening check required.
 */
class ProjectWorkTemplates
{
    public const KINDS = ['phase', 'task', 'date'];

    public function __construct(private ProjectAccess $access) {}

    public static function ready(): bool
    {
        return ProjectsSetup::ready() && Schema::hasTable('project_work_templates') && Schema::hasTable('project_date_rules');
    }

    /** For Configuration: one kind of work's templates with their items, and its settings. @return array<string, mixed> */
    public function forType(int $typeId, User $user): array
    {
        $type = DB::table('project_types')->where('id', $typeId)->whereNull('deleted_at')->first() ?? throw new ProjectException('That kind of work is not there.', 404);
        if (! self::ready()) {
            return ['ready' => false];
        }
        $templates = DB::table('project_work_templates')->where('type_id', $typeId)->orderByDesc('is_default')->orderBy('name')->get();
        $items = DB::table('project_template_items')->whereIn('template_id', $templates->pluck('id')->all() ?: [0])->orderBy('sort_order')->orderBy('id')->get()->groupBy('template_id');
        $s = DB::table('project_type_settings')->where('type_id', $typeId)->first();

        return ['ready' => true, 'type' => ['id' => (int) $type->id, 'name' => $type->name, 'industry' => $type->industry_key],
            'settings' => ['confidential_default' => (bool) ($s->confidential_default ?? false), 'opening_required' => (bool) ($s->opening_required ?? false)],
            'templates' => $templates->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'is_default' => (bool) $t->is_default, 'is_active' => (bool) $t->is_active,
                'items' => ($items[$t->id] ?? collect())->map(fn ($i) => ['kind' => $i->kind, 'ref' => $i->ref, 'parent_ref' => $i->parent_ref, 'title' => $i->title, 'offset_days' => $i->offset_days !== null ? (int) $i->offset_days : null,
                    'estimate_minutes' => $i->estimate_minutes !== null ? (int) $i->estimate_minutes : null, 'date_kind' => $i->date_kind, 'warn_days' => $i->warn_days])->values()->all()])->all(),
            'date_kinds' => collect(app(ProjectLists::class)->of('key_date', true, $type->industry_key))->map(fn ($k) => ['key' => $k['key'], 'name' => $k['name']])->values()->all(),
            'can' => ['change' => $user->hasPermission('projects.config.stages')]];
    }

    /** @param array<string, mixed> $d type_id, name, is_default, is_active, items [{kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days}] */
    public function save(?int $id, array $d, User $by): int
    {
        $by->hasPermission('projects.config.stages') || throw new ProjectException('Changing work templates needs the permission to set up kinds of work.', 403);
        self::ready() || throw new ProjectException('Work templates need database script 268.', 409);
        $current = $id ? (DB::table('project_work_templates')->where('id', $id)->first() ?? throw new ProjectException('That template is not there.', 404)) : null;
        $typeId = $current ? (int) $current->type_id : (int) ($d['type_id'] ?? 0);
        $type = DB::table('project_types')->where('id', $typeId)->whereNull('deleted_at')->first() ?? throw new ProjectException('Choose a kind of work.');
        $name = trim((string) ($d['name'] ?? $current->name ?? ''));
        $name !== '' || throw new ProjectException('Give the template a name.');
        if (DB::table('project_work_templates')->where('type_id', $typeId)->where('name', $name)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new ProjectException('This kind of work already has a template with that name.');
        }
        $items = $this->cleanItems((array) ($d['items'] ?? []), $type->industry_key);
        $default = array_key_exists('is_default', $d) ? (bool) $d['is_default'] : (bool) ($current->is_default ?? false);

        return DB::transaction(function () use ($id, $typeId, $name, $default, $d, $items, $by, $current) {
            if ($default) {
                DB::table('project_work_templates')->where('type_id', $typeId)->update(['is_default' => 0]);
            }
            $row = ['name' => mb_substr($name, 0, 120), 'is_default' => $default ? 1 : 0, 'is_active' => array_key_exists('is_active', $d) ? ($d['is_active'] ? 1 : 0) : (int) ($current->is_active ?? 1), 'updated_at' => now()];
            if ($id) {
                DB::table('project_work_templates')->where('id', $id)->update($row);
            } else {
                $id = DB::table('project_work_templates')->insertGetId($row + ['type_id' => $typeId, 'created_by' => $by->id, 'created_at' => now()]);
            }
            if (array_key_exists('items', $d)) {
                DB::table('project_template_items')->where('template_id', $id)->delete();
                foreach ($items as $n => $i) {
                    DB::table('project_template_items')->insert($i + ['template_id' => $id, 'sort_order' => ($n + 1) * 10]);
                }
            }
            ProjectLog::record(null, $by, 'work_template.saved', 'work_template', $id, null, ['name' => $name, 'items' => count($items)]);

            return $id;
        });
    }

    /** @param array<string, mixed> $d confidential_default, opening_required */
    public function saveSettings(int $typeId, array $d, User $by): void
    {
        $by->hasPermission('projects.config.stages') || throw new ProjectException('Changing kinds of work needs the permission to set them up.', 403);
        self::ready() || throw new ProjectException('These settings need database script 268.', 409);
        DB::table('project_types')->where('id', $typeId)->whereNull('deleted_at')->exists() || throw new ProjectException('That kind of work is not there.', 404);
        $old = DB::table('project_type_settings')->where('type_id', $typeId)->first();
        $row = ['confidential_default' => array_key_exists('confidential_default', $d) ? ($d['confidential_default'] ? 1 : 0) : (int) ($old->confidential_default ?? 0),
            'opening_required' => array_key_exists('opening_required', $d) ? ($d['opening_required'] ? 1 : 0) : (int) ($old->opening_required ?? 0)];
        DB::table('project_type_settings')->updateOrInsert(['type_id' => $typeId], $row + ['updated_by' => $by->id, 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'type.settings_saved', 'type', $typeId, $old ? ['confidential_default' => (int) $old->confidential_default, 'opening_required' => (int) $old->opening_required] : null, $row);
    }

    /** What a kind of work offers when a piece of work starts. @return array<int, array{id: int, name: string, is_default: bool}> */
    public function offered(int $typeId): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('project_work_templates')->where('type_id', $typeId)->where('is_active', 1)->orderByDesc('is_default')->orderBy('name')->get(['id', 'name', 'is_default'])
            ->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'is_default' => (bool) $t->is_default])->all();
    }

    public function setting(int $typeId, string $key): bool
    {
        return self::ready() && (bool) DB::table('project_type_settings')->where('type_id', $typeId)->value($key);
    }

    /**
     * Make the template's phases, tasks and key dates on a work, from its start day (today when it has none). What is there already (same name in
     * the same place) is left alone. When a work starts this is part of starting it; later it needs the right to change tasks.
     * @return array{phases: int, tasks: int, dates: int}
     */
    public function apply(object $project, int $templateId, User $by, bool $starting = false): array
    {
        self::ready() || throw new ProjectException('Work templates need database script 268.', 409);
        if (! $starting) {
            $this->access->authorize($by, 'tasks', $project);
        }
        $t = DB::table('project_work_templates')->where('id', $templateId)->where('type_id', $project->type_id)->where('is_active', 1)->first() ?? throw new ProjectException('Choose a template of this kind of work.');
        $items = DB::table('project_template_items')->where('template_id', $t->id)->orderBy('sort_order')->orderBy('id')->get();
        $start = Carbon::parse($project->start_date ?: now()->toDateString())->startOfDay();
        $made = ['phases' => 0, 'tasks' => 0, 'dates' => 0];
        $dates = ProjectsSetup::work();

        DB::transaction(function () use ($project, $items, $start, $by, &$made, $dates, $t) {
            $phases = [];   // ref => phase id
            foreach ($items->where('kind', 'phase') as $i) {
                $parent = $i->parent_ref ? ($phases[$i->parent_ref] ?? null) : null;
                $id = DB::table('project_phases')->where('project_id', $project->id)->where('parent_id', $parent)->where('name', $i->title)->whereNull('deleted_at')->value('id');
                if (! $id) {
                    $sort = ((int) DB::table('project_phases')->where('project_id', $project->id)->where('parent_id', $parent)->max('sort_order')) + 10;
                    $id = DB::table('project_phases')->insertGetId(['project_id' => $project->id, 'parent_id' => $parent, 'name' => mb_substr($i->title, 0, 160), 'sort_order' => $sort, 'state' => 'open', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
                    $made['phases']++;
                }
                $phases[$i->ref ?: $i->title] = (int) $id;
            }
            if ($dates) {
                foreach ($items->where('kind', 'task') as $i) {
                    $phase = $i->parent_ref ? ($phases[$i->parent_ref] ?? null) : null;
                    if (DB::table('project_work_tasks')->where('project_id', $project->id)->where('title', $i->title)->whereNull('deleted_at')->exists()) {
                        continue;
                    }
                    $number = (int) DB::table('project_work_tasks')->where('project_id', $project->id)->lockForUpdate()->max('number') + 1;
                    DB::table('project_work_tasks')->insert(['project_id' => $project->id, 'number' => $number, 'phase_id' => $phase, 'title' => mb_substr($i->title, 0, 200), 'status' => 'todo', 'priority' => 'medium',
                        'start_date' => $start->toDateString(), 'due_date' => $i->offset_days !== null ? $start->copy()->addDays((int) $i->offset_days)->toDateString() : null, 'estimate_minutes' => $i->estimate_minutes,
                        'sort_order' => $number, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
                    $made['tasks']++;
                }
                foreach ($items->where('kind', 'date') as $i) {
                    if (DB::table('project_key_dates')->where('project_id', $project->id)->where('title', $i->title)->whereNull('deleted_at')->exists()) {
                        continue;
                    }
                    $id = DB::table('project_key_dates')->insertGetId(['project_id' => $project->id, 'phase_id' => $i->parent_ref ? ($phases[$i->parent_ref] ?? null) : null, 'kind' => $i->date_kind, 'title' => mb_substr($i->title, 0, 200),
                        'starts_at' => $start->copy()->addDays((int) ($i->offset_days ?? 0))->format('Y-m-d 00:00:00'), 'all_day' => 1, 'responsible_id' => $project->lead_user_id, 'warn_days' => $i->warn_days,
                        'state' => 'open', 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
                    app(ProjectKeyDates::class)->sync($id);
                    app(ProjectDateRules::class)->dateEvent($project, $id, 'date_set', $by);
                    $made['dates']++;
                }
            }
            ProjectLog::record((int) $project->id, $by, 'work_template.applied', 'work_template', (int) $t->id, null, ['template' => $t->name] + $made);
        });

        return $made;
    }

    // ------------------------------------------------------------------ inside

    /** @return array<int, array<string, mixed>> */
    private function cleanItems(array $items, string $industry): array
    {
        count($items) <= 300 || throw new ProjectException('A template can hold up to 300 phases, tasks and dates.');
        $kinds = collect(app(ProjectLists::class)->of('key_date', false, $industry))->pluck('key')->all();
        $refs = [];
        $out = [];
        foreach ($items as $n => $i) {
            $kind = $i['kind'] ?? null;
            in_array($kind, self::KINDS, true) || throw new ProjectException('Each line is a phase, a task or a date.');
            $title = trim((string) ($i['title'] ?? ''));
            $title !== '' || throw new ProjectException('Line ' . ($n + 1) . ' has no name.');
            $parent = trim((string) ($i['parent_ref'] ?? '')) ?: null;
            if ($parent && ! in_array($parent, $refs, true)) {
                throw new ProjectException("\"{$title}\" sits under a phase that is not above it in the template.");
            }
            $ref = $kind === 'phase' ? (trim((string) ($i['ref'] ?? '')) ?: mb_substr($title, 0, 40)) : null;
            if ($ref) {
                $refs[] = $ref;
            }
            $offset = isset($i['offset_days']) && $i['offset_days'] !== '' && $i['offset_days'] !== null ? (int) $i['offset_days'] : null;
            if ($offset !== null && ($offset < 0 || $offset > 3650)) {
                throw new ProjectException('Days after the start are between 0 and 3650.');
            }
            $dateKind = $kind === 'date' && ! empty($i['date_kind']) ? (string) $i['date_kind'] : null;
            if ($dateKind && ! in_array($dateKind, $kinds, true)) {
                throw new ProjectException("Choose a kind of key date for \"{$title}\" from the list.");
            }
            $out[] = ['kind' => $kind, 'ref' => $ref, 'parent_ref' => $parent, 'title' => mb_substr($title, 0, 200), 'offset_days' => $kind === 'phase' ? null : $offset,
                'estimate_minutes' => $kind === 'task' && ! empty($i['estimate_minutes']) ? max(0, (int) $i['estimate_minutes']) : null, 'date_kind' => $dateKind,
                'warn_days' => $kind === 'date' && ! empty($i['warn_days']) ? mb_substr((string) $i['warn_days'], 0, 40) : null];
        }
        if (count(array_unique(array_map(fn ($i) => $i['kind'] . '|' . $i['title'], $out))) !== count($out)) {
            throw new ProjectException('Two lines of the same kind have the same name.');
        }

        return $out;
    }
}
