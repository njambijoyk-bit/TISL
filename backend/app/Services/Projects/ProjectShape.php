<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The shape of the work, which an owner sets without a developer: the kinds of work inside an industry (each with its own number series), the
 * stages each kind moves through, and extra fields. Nothing here can strand a project: a kind of work that has projects keeps its prefix, a
 * stage that projects sit on cannot be removed, and every kind of work keeps at least one stage.
 */
class ProjectShape
{
    public const FIELD_KINDS = ['text' => 'Text', 'number' => 'Number (a count or a measure, never money)', 'date' => 'Date', 'yes_no' => 'Yes or no', 'pick_one' => 'Pick one', 'pick_many' => 'Pick several', 'person' => 'A member of staff'];
    public const STATUS_TOKENS = ['info' => 'Information', 'good' => 'Good', 'warning' => 'Warning', 'problem' => 'Problem'];
    public const STAGE_STATES = ['open' => 'Open', 'closed' => 'Closed'];

    /** the built-in things a stage can ask to be filled before a project enters it, by column => the term that names it */
    public const REQUIRABLE = ['customer_id' => 'client', 'reference' => 'reference', 'authority' => 'authority', 'place' => 'place', 'start_date' => null, 'due_date' => null, 'description' => null];

    /** Everything the configuration tabs show for one industry. @return array<string, mixed> */
    public function forIndustry(string $industry): array
    {
        $types = DB::table('project_types')->where('industry_key', $industry)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('name')->get();
        $stages = DB::table('project_stages')->whereIn('type_id', $types->pluck('id'))->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get()->groupBy('type_id');
        $used = DB::table('projects')->whereIn('type_id', $types->pluck('id'))->selectRaw('type_id, stage_id, COUNT(*) AS n')->groupBy('type_id', 'stage_id')->get();
        $perType = $used->groupBy('type_id')->map(fn ($g) => (int) $g->sum('n'));
        $perStage = $used->pluck('n', 'stage_id');
        $series = DB::table('project_series')->whereIn('prefix', $types->pluck('number_prefix'))->pluck('next_number', 'prefix');

        return [
            'types' => $types->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'prefix' => $t->number_prefix, 'is_active' => (bool) $t->is_active, 'projects' => (int) ($perType[$t->id] ?? 0),
                'next_number' => (int) ($series[$t->number_prefix] ?? 1),
                'stages' => ($stages[$t->id] ?? collect())->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name, 'state' => $s->state, 'status' => $s->status_token,
                    'required_fields' => json_decode((string) $s->required_fields, true) ?: [], 'projects' => (int) ($perStage[$s->id] ?? 0)])->values()->all()])->all(),
            'fields' => $this->fields($industry, null, true),
        ];
    }

    // ------------------------------------------------------------------ kinds of work

    /** @param array<string, mixed> $d industry_key, name, prefix */
    public function addType(array $d, User $by): int
    {
        $industry = (string) ($d['industry_key'] ?? '');
        if (! DB::table('project_industries')->where('key', $industry)->exists()) {
            throw new ProjectException('There is no such industry.', 404);
        }
        $name = $this->line((string) ($d['name'] ?? ''), 80);
        $prefix = $this->prefix($d['prefix'] ?? '');
        $this->assertTypeFree($industry, $name, $prefix, null);
        $id = DB::transaction(function () use ($industry, $name, $prefix) {
            $id = DB::table('project_types')->insertGetId(['industry_key' => $industry, 'name' => $name, 'number_prefix' => $prefix, 'is_active' => 1,
                'sort_order' => ((int) DB::table('project_types')->where('industry_key', $industry)->max('sort_order')) + 10, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('project_series')->insertOrIgnore(['prefix' => $prefix, 'next_number' => 1, 'width' => 4]);
            // a new kind of work is usable at once: it starts with the two stages every piece of work has
            foreach ([['Open', 'open', 'info'], ['Closed', 'closed', 'good']] as $i => [$stage, $state, $token]) {
                DB::table('project_stages')->insert(['type_id' => $id, 'name' => $stage, 'sort_order' => ($i + 1) * 10, 'state' => $state, 'status_token' => $token, 'created_at' => now(), 'updated_at' => now()]);
            }

            return $id;
        });
        ProjectLog::record(null, $by, 'type.added', 'type', $id, null, ['industry' => $industry, 'name' => $name, 'prefix' => $prefix]);

        return $id;
    }

    /** @param array<string, mixed> $d name, prefix, is_active */
    public function changeType(int $id, array $d, User $by): void
    {
        $t = $this->type($id);
        $new = [];
        if (array_key_exists('name', $d)) {
            $new['name'] = $this->line((string) $d['name'], 80);
        }
        if (array_key_exists('prefix', $d)) {
            $new['number_prefix'] = $this->prefix($d['prefix']);
            if ($new['number_prefix'] !== $t->number_prefix && DB::table('projects')->where('type_id', $id)->exists()) {
                throw new ProjectException('Work already carries this prefix in its numbers. It cannot be changed now.');
            }
        }
        if (array_key_exists('is_active', $d)) {
            $new['is_active'] = $d['is_active'] ? 1 : 0;
        }
        $this->assertTypeFree($t->industry_key, $new['name'] ?? $t->name, $new['number_prefix'] ?? $t->number_prefix, $id);
        $changed = array_filter($new, fn ($v, $k) => (string) $t->$k !== (string) $v, ARRAY_FILTER_USE_BOTH);
        if (! $changed) {
            return;
        }
        DB::transaction(function () use ($id, $changed) {
            DB::table('project_types')->where('id', $id)->update($changed + ['updated_at' => now()]);
            if (isset($changed['number_prefix'])) {
                DB::table('project_series')->insertOrIgnore(['prefix' => $changed['number_prefix'], 'next_number' => 1, 'width' => 4]);
            }
        });
        ProjectLog::record(null, $by, 'type.changed', 'type', $id, array_intersect_key((array) $t, $changed), $changed);
    }

    // ------------------------------------------------------------------ stages

    /** @param array<string, mixed> $d name, state, status, required_fields */
    public function addStage(int $typeId, array $d, User $by): int
    {
        $t = $this->type($typeId);
        $v = $this->stageValues($t, $d, null);
        // a new stage goes just before the first closed one, where work in progress belongs
        $closed = DB::table('project_stages')->where('type_id', $typeId)->whereNull('deleted_at')->where('state', 'closed')->orderBy('sort_order')->first();
        $id = DB::transaction(function () use ($typeId, $v, $closed) {
            $id = DB::table('project_stages')->insertGetId($v + ['type_id' => $typeId, 'sort_order' => 0, 'created_at' => now(), 'updated_at' => now()]);
            $order = DB::table('project_stages')->where('type_id', $typeId)->whereNull('deleted_at')->where('id', '!=', $id)->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
            $at = $closed && $v['state'] !== 'closed' ? array_search($closed->id, $order) : count($order);
            array_splice($order, $at === false ? count($order) : $at, 0, [$id]);
            $this->renumber($order);

            return $id;
        });
        ProjectLog::record(null, $by, 'stage.added', 'stage', $id, null, ['kind_of_work' => $t->name, 'name' => $v['name'], 'state' => $v['state']]);

        return $id;
    }

    /** @param array<string, mixed> $d name, state, status, required_fields, move (up|down) */
    public function changeStage(int $stageId, array $d, User $by): void
    {
        $s = $this->stage($stageId);
        $t = $this->type((int) $s->type_id);
        $new = $this->stageValues($t, $d, $s);
        if (isset($new['state']) && $new['state'] !== $s->state && DB::table('projects')->where('stage_id', $stageId)->exists()) {
            throw new ProjectException('Work is at this stage. Whether the stage is open or closed cannot be changed under it: move the work first.');
        }
        $changed = array_filter($new, fn ($v, $k) => (string) ($s->$k ?? '') !== (string) $v, ARRAY_FILTER_USE_BOTH);
        $move = in_array($d['move'] ?? null, ['up', 'down'], true) ? $d['move'] : null;
        $moved = false;
        DB::transaction(function () use ($s, $changed, $move, &$moved) {
            if ($changed) {
                DB::table('project_stages')->where('id', $s->id)->update($changed + ['updated_at' => now()]);
            }
            if ($move) {
                $order = DB::table('project_stages')->where('type_id', $s->type_id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->pluck('id')->all();
                $i = array_search($s->id, $order);
                $j = $move === 'up' ? $i - 1 : $i + 1;
                if ($i !== false && isset($order[$j])) {
                    [$order[$i], $order[$j]] = [$order[$j], $order[$i]];
                    $this->renumber($order);
                    $moved = true;
                }
            }
        });
        if ($changed || $moved) {
            ProjectLog::record(null, $by, 'stage.changed', 'stage', $stageId, array_intersect_key((array) $s, $changed), $changed + ($moved ? ['moved' => $move] : []));
        }
    }

    public function removeStage(int $stageId, User $by): void
    {
        $s = $this->stage($stageId);
        if (DB::table('projects')->where('stage_id', $stageId)->exists()) {
            throw new ProjectException('Work is at this stage. Move it to another stage first.');
        }
        if (DB::table('project_stages')->where('type_id', $s->type_id)->whereNull('deleted_at')->count() <= 1) {
            throw new ProjectException('A kind of work needs at least one stage.');
        }
        DB::table('project_stages')->where('id', $stageId)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
        ProjectLog::record(null, $by, 'stage.removed', 'stage', $stageId, ['name' => $s->name], null);
    }

    // ------------------------------------------------------------------ extra fields

    /**
     * The extra fields that show on a project of this industry and kind of work (or, for the configuration page, every field of the industry).
     *
     * @return array<int, array<string, mixed>>
     */
    public function fields(string $industry, ?int $typeId, bool $forConfiguration = false): array
    {
        $typeIds = DB::table('project_types')->where('industry_key', $industry)->pluck('id')->all();

        return DB::table('project_fields as f')->leftJoin('project_types as t', 't.id', '=', 'f.type_id')->whereNull('f.deleted_at')
            ->when(! $forConfiguration, fn ($q) => $q->where('f.is_active', 1))
            ->where(function ($w) use ($industry, $typeId, $typeIds, $forConfiguration) {
                $w->where(fn ($x) => $x->whereNull('f.industry_key')->whereNull('f.type_id'))                         // on every project
                    ->orWhere(fn ($x) => $x->where('f.industry_key', $industry)->whereNull('f.type_id'))               // on every project of the industry
                    ->orWhere(fn ($x) => $forConfiguration ? $x->whereIn('f.type_id', $typeIds ?: [0]) : $x->where('f.type_id', $typeId ?? 0));   // on one kind of work
            })
            ->orderBy('f.sort_order')->orderBy('f.id')->get(['f.*', 't.name as type_name'])
            ->map(fn ($f) => ['id' => (int) $f->id, 'key' => $f->key, 'label' => $f->label, 'kind' => $f->kind, 'options' => json_decode((string) $f->options, true) ?: [],
                'scope' => $f->type_id ? 'type' : ($f->industry_key ? 'industry' : 'all'), 'type_id' => $f->type_id ? (int) $f->type_id : null, 'type_name' => $f->type_name,
                'required' => (bool) $f->is_required, 'sensitive' => (bool) $f->is_sensitive, 'is_active' => (bool) $f->is_active])->all();
    }

    /** @param array<string, mixed> $d label, kind, options, scope (all|industry|type), industry_key, type_id, required, sensitive */
    public function addField(array $d, User $by): int
    {
        $v = $this->fieldValues($d, null);
        $v['key'] = $this->uniqueFieldKey($v['label']);
        $v['sort_order'] = ((int) DB::table('project_fields')->max('sort_order')) + 10;
        $id = DB::table('project_fields')->insertGetId($v + ['is_active' => 1, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record(null, $by, 'field.added', 'field', $id, null, ['label' => $v['label'], 'kind' => $v['kind'], 'sensitive' => (bool) $v['is_sensitive']]);

        return $id;
    }

    /** @param array<string, mixed> $d label, options, required, sensitive, is_active (the kind of a field cannot change: values already hold that kind) */
    public function changeField(int $id, array $d, User $by): void
    {
        $f = DB::table('project_fields')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $f) {
            throw new ProjectException('Not found.', 404);
        }
        $new = $this->fieldValues($d, $f);
        if (array_key_exists('is_active', $d)) {
            $new['is_active'] = $d['is_active'] ? 1 : 0;
        }
        $changed = array_filter($new, fn ($v, $k) => (string) ($f->$k ?? '') !== (string) ($v ?? ''), ARRAY_FILTER_USE_BOTH);
        if (! $changed) {
            return;
        }
        DB::table('project_fields')->where('id', $id)->update($changed + ['updated_at' => now()]);
        ProjectLog::record(null, $by, 'field.changed', 'field', $id, array_intersect_key((array) $f, $changed), $changed);
    }

    // ------------------------------------------------------------------ values on a project

    /**
     * The extra fields of a project with their values, as this person may see them. A sensitive field is left out entirely for someone who does
     * not hold `projects.fields.sensitive`: not blank, not masked, absent.
     *
     * @return array<int, array<string, mixed>>
     */
    public function valuesFor(object $project, User $user): array
    {
        $values = DB::table('project_field_values')->where('project_id', $project->id)->pluck('value', 'field_id');
        $maySee = $user->hasPermission('projects.fields.sensitive');
        $out = [];
        foreach ($this->fields($project->industry_key, (int) $project->type_id) as $f) {
            if ($f['sensitive'] && ! $maySee) {
                continue;
            }
            $value = $this->read($f, $values[$f['id']] ?? null);
            // a member of staff is shown by name, so the screen never has to look anyone up
            $out[] = $f + ['value' => $value] + ($f['kind'] === 'person' && $value ? ['display' => DB::table('users')->where('id', $value)->value('name')] : []);
        }

        return $out;
    }

    /**
     * Check and save what was sent for a project's extra fields. Only fields this person may see are touched; on a new project every required
     * field must be filled.
     *
     * @param array<string, mixed> $sent key => value
     * @return array{old: array<string, mixed>, new: array<string, mixed>} what changed, by label, for the log (a sensitive value is logged as changed, never in words)
     */
    public function saveValues(object $project, array $sent, User $by, bool $isNew): array
    {
        $maySee = $by->hasPermission('projects.fields.sensitive');
        $existing = DB::table('project_field_values')->where('project_id', $project->id)->pluck('value', 'field_id');
        $old = [];
        $new = [];
        foreach ($this->fields($project->industry_key, (int) $project->type_id) as $f) {
            if ($f['sensitive'] && ! $maySee) {
                continue;
            }
            $given = array_key_exists($f['key'], $sent);
            if (! $given && ! $isNew) {
                continue;
            }
            $value = $this->write($f, $given ? $sent[$f['key']] : null);
            if ($f['required'] && ($value === null || $value === '' || $value === '[]')) {
                throw new ProjectException("Fill in {$f['label']}.");
            }
            $before = $existing[$f['id']] ?? null;
            if ((string) ($before ?? '') === (string) ($value ?? '')) {
                continue;
            }
            DB::table('project_field_values')->updateOrInsert(['project_id' => $project->id, 'field_id' => $f['id']], ['value' => $value, 'updated_at' => now()]);
            $old[$f['label']] = $f['sensitive'] ? '(hidden)' : $this->read($f, $before);
            $new[$f['label']] = $f['sensitive'] ? '(changed)' : $this->read($f, $value);
        }

        return ['old' => $old, 'new' => $new];
    }

    /** Which extra fields a stage asks for are still empty on a project (stage required_fields entries written `field:key`). @return string[] labels */
    public function missingExtra(object $project, array $required): array
    {
        $keys = array_map(fn ($r) => substr($r, 6), array_filter($required, fn ($r) => is_string($r) && str_starts_with($r, 'field:')));
        if (! $keys) {
            return [];
        }
        $values = DB::table('project_field_values')->where('project_id', $project->id)->pluck('value', 'field_id');
        $missing = [];
        foreach ($this->fields($project->industry_key, (int) $project->type_id) as $f) {
            $v = $values[$f['id']] ?? null;
            if (in_array($f['key'], $keys, true) && ($v === null || $v === '' || $v === '[]')) {
                $missing[] = $f['label'];
            }
        }

        return $missing;
    }

    // ------------------------------------------------------------------ inside

    /** @param array<string, mixed> $f */
    private function read(array $f, mixed $stored): mixed
    {
        if ($stored === null || $stored === '') {
            return $f['kind'] === 'pick_many' ? [] : null;
        }

        return match ($f['kind']) {
            'number' => $stored + 0,
            'yes_no' => $stored === '1',
            'pick_many' => json_decode((string) $stored, true) ?: [],
            'person' => (int) $stored,
            default => (string) $stored,
        };
    }

    /** @param array<string, mixed> $f */
    private function write(array $f, mixed $v): ?string
    {
        if ($v === null || $v === '' || $v === []) {
            return $f['kind'] === 'yes_no' && $v !== null && $v !== '' ? '0' : null;
        }
        switch ($f['kind']) {
            case 'number':
                if (! is_numeric($v)) {
                    throw new ProjectException("{$f['label']} must be a number.");
                }

                return (string) ($v + 0);
            case 'date':
                try {
                    return \Carbon\Carbon::parse((string) $v)->toDateString();
                } catch (\Throwable) {
                    throw new ProjectException("{$f['label']} must be a date.");
                }
            case 'yes_no':
                return filter_var($v, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
            case 'pick_one':
                if (! in_array($v, $f['options'], true)) {
                    throw new ProjectException("Choose {$f['label']} from its list.");
                }

                return (string) $v;
            case 'pick_many':
                $list = array_values(array_unique(array_filter((array) $v, 'is_string')));
                if (array_diff($list, $f['options'])) {
                    throw new ProjectException("Choose {$f['label']} from its list.");
                }

                return $list ? json_encode($list) : null;
            case 'person':
                if (! DB::table('users')->where('id', (int) $v)->exists()) {
                    throw new ProjectException("Choose a member of staff for {$f['label']}.");
                }

                return (string) (int) $v;
            default:
                return mb_substr(trim(strip_tags((string) $v)), 0, 2000) ?: null;
        }
    }

    private function type(int $id): object
    {
        $t = DB::table('project_types')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $t) {
            throw new ProjectException('Not found.', 404);
        }

        return $t;
    }

    private function stage(int $id): object
    {
        $s = DB::table('project_stages')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $s) {
            throw new ProjectException('Not found.', 404);
        }

        return $s;
    }

    private function assertTypeFree(string $industry, string $name, string $prefix, ?int $ignore): void
    {
        if ($name === '') {
            throw new ProjectException('Give the kind of work a name.');
        }
        $others = DB::table('project_types')->whereNull('deleted_at')->when($ignore, fn ($q) => $q->where('id', '!=', $ignore));
        if ((clone $others)->where('industry_key', $industry)->where('name', $name)->exists()) {
            throw new ProjectException('This industry already has a kind of work with that name.');
        }
        if ((clone $others)->where('number_prefix', $prefix)->exists()) {
            throw new ProjectException('Another kind of work already uses that prefix. Each needs its own, so no two pieces of work share a number.');
        }
    }

    private function prefix(mixed $v): string
    {
        $p = strtoupper(trim((string) $v));
        if (! preg_match('/^[A-Z][A-Z0-9]{0,7}$/', $p)) {
            throw new ProjectException('A prefix is 1 to 8 letters and digits, starting with a letter.');
        }

        return $p;
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function stageValues(object $type, array $d, ?object $existing): array
    {
        $out = [];
        if (! $existing || array_key_exists('name', $d)) {
            $out['name'] = $this->line((string) ($d['name'] ?? ''), 80);
            if ($out['name'] === '') {
                throw new ProjectException('Give the stage a name.');
            }
            if (DB::table('project_stages')->where('type_id', $type->id)->whereNull('deleted_at')->where('name', $out['name'])->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))->exists()) {
                throw new ProjectException('This kind of work already has a stage with that name.');
            }
        }
        if (! $existing || array_key_exists('state', $d)) {
            $out['state'] = (string) ($d['state'] ?? 'open');
            if (! isset(self::STAGE_STATES[$out['state']])) {
                throw new ProjectException('A stage is open or closed.');
            }
        }
        if (! $existing || array_key_exists('status', $d)) {
            $out['status_token'] = (string) ($d['status'] ?? (($out['state'] ?? 'open') === 'closed' ? 'good' : 'info'));
            if (! isset(self::STATUS_TOKENS[$out['status_token']])) {
                throw new ProjectException('Choose how it is shown from the list.');   // a name of one of the theme's status colours: never a colour itself
            }
        }
        if (array_key_exists('required_fields', $d)) {
            $allowed = array_merge(array_keys(self::REQUIRABLE), array_map(fn ($f) => 'field:' . $f['key'], $this->fields($type->industry_key, (int) $type->id)));
            $list = array_values(array_unique(array_filter((array) $d['required_fields'], 'is_string')));
            if (array_diff($list, $allowed)) {
                throw new ProjectException('A stage can only ask for a field this kind of work has.');
            }
            $out['required_fields'] = $list ? json_encode($list) : null;
        }

        return $out;
    }

    /** @param array<string, mixed> $d @return array<string, mixed> */
    private function fieldValues(array $d, ?object $existing): array
    {
        $out = [];
        if (! $existing || array_key_exists('label', $d)) {
            $out['label'] = $this->line((string) ($d['label'] ?? ''), 80);
            if ($out['label'] === '') {
                throw new ProjectException('Give the field a name.');
            }
        }
        $kind = $existing->kind ?? (string) ($d['kind'] ?? 'text');
        if (! $existing) {
            if (! isset(self::FIELD_KINDS[$kind])) {
                throw new ProjectException('Choose the kind of field from the list.');
            }
            $out['kind'] = $kind;
            $scope = (string) ($d['scope'] ?? 'industry');
            $out['industry_key'] = null;
            $out['type_id'] = null;
            if ($scope === 'industry') {
                if (! DB::table('project_industries')->where('key', (string) ($d['industry_key'] ?? ''))->exists()) {
                    throw new ProjectException('There is no such industry.', 404);
                }
                $out['industry_key'] = (string) $d['industry_key'];
            } elseif ($scope === 'type') {
                $out['type_id'] = (int) $this->type((int) ($d['type_id'] ?? 0))->id;
            } elseif ($scope !== 'all') {
                throw new ProjectException('Say where the field shows.');
            }
        }
        if (in_array($kind, ['pick_one', 'pick_many'], true) && (! $existing || array_key_exists('options', $d))) {
            $options = array_values(array_unique(array_filter(array_map(fn ($o) => $this->line((string) $o, 80), (array) ($d['options'] ?? [])))));
            if (count($options) < 2) {
                throw new ProjectException('Give at least two choices.');
            }
            $out['options'] = json_encode($options);
        }
        foreach (['required' => 'is_required', 'sensitive' => 'is_sensitive'] as $in => $col) {
            if (! $existing || array_key_exists($in, $d)) {
                $out[$col] = ! empty($d[$in]) ? 1 : 0;
            }
        }

        return $out;
    }

    private function uniqueFieldKey(string $label): string
    {
        $base = substr(trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), '_') ?: 'field', 0, 50);
        $key = $base;
        for ($i = 2; DB::table('project_fields')->where('key', $key)->exists(); $i++) {
            $key = $base . '_' . $i;
        }

        return $key;
    }

    /** @param int[] $ids */
    private function renumber(array $ids): void
    {
        foreach ($ids as $n => $id) {
            DB::table('project_stages')->where('id', $id)->update(['sort_order' => ($n + 1) * 10]);
        }
    }

    private function line(string $s, int $max): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F<>]/u', ' ', strip_tags($s)))), 0, $max);
    }
}
