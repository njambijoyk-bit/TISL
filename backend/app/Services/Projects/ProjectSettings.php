<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The settings of Projects, kept in parts. Every save is a new numbered version of that part, so any earlier state can be brought back
 * (a roll back is itself a new version, never a rewrite of history), and a line in the settings log says who did it and when.
 */
class ProjectSettings
{
    /** part => the values it holds when nothing is saved */
    public const DEFAULTS = [
        'general' => ['default_industry' => 'general', 'project_may_use_other_industry' => true, 'trash_days' => 30],
        // the company's shortcut keys (ProjectKeys says what each is for)
        'shortcuts' => ['go_list' => 'P', 'go_new' => 'N', 'go_log' => 'L', 'go_trash' => 'T', 'go_config' => 'C', 'act_edit' => 'E', 'act_hold' => 'H', 'act_next' => 'F', 'act_delete' => 'D',
            'tab_overview' => 'O', 'tab_phases' => 'P', 'tab_people' => 'I', 'tab_links' => 'K', 'tab_activity' => 'Y'],
        // stage 2, the control room: how long before an end date the lead is told
        // and the hours a new project starts with (a list of {day, opens, closes}; empty = any time), whether reading is allowed outside them, and short passes
        'access' => ['warn_days' => 7, 'default_hours' => [], 'read_outside_hours' => false, 'passes' => true, 'pass_minutes' => 60],
    ];

    /** @var array<string, array<string, mixed>> */
    private array $cache = [];

    /** @return array<string, mixed> */
    public function get(string $part): array
    {
        $this->assertPart($part);
        if (! isset($this->cache[$part])) {
            $saved = ProjectsSetup::ready() ? DB::table('project_settings')->where('part', $part)->value('value') : null;
            $saved = is_string($saved) ? json_decode($saved, true) : null;
            $value = array_merge(self::DEFAULTS[$part], is_array($saved) ? array_intersect_key($saved, self::DEFAULTS[$part]) : []);
            foreach (self::DEFAULTS[$part] as $k => $default) {
                settype($value[$k], gettype($default));   // a stored 1 is the same answer as true: each value reads back as the kind its default is
            }
            $this->cache[$part] = $value;
        }

        return $this->cache[$part];
    }

    public function defaultIndustry(): string
    {
        return (string) $this->get('general')['default_industry'];
    }

    /**
     * Save a part. Only the keys the part knows are kept; what is not given stays as it is.
     *
     * @param array<string, mixed> $input
     * @return array{version: int, value: array<string, mixed>, changed: string[]}
     */
    public function save(string $part, array $input, ?User $by, string $action = 'saved', ?string $note = null): array
    {
        $this->assertPart($part);
        if (! ProjectsSetup::ready()) {
            throw new ProjectException('Projects is not set up yet: run database script 257 first.', 409);
        }
        $old = $this->get($part);
        $new = $this->clean($part, array_merge($old, array_intersect_key($input, self::DEFAULTS[$part])));
        $changed = array_keys(array_filter($new, fn ($v, $k) => $v !== $old[$k], ARRAY_FILTER_USE_BOTH));
        if (! $changed && $action === 'saved') {
            return ['version' => $this->version($part), 'value' => $old, 'changed' => []];
        }

        $version = DB::transaction(function () use ($part, $new, $by, $action, $note) {
            $version = ((int) DB::table('project_setting_versions')->where('part', $part)->max('version')) + 1;
            $json = json_encode($new);
            DB::table('project_settings')->updateOrInsert(['part' => $part], ['value' => $json, 'version' => $version, 'updated_by' => $by?->id, 'updated_at' => now()]);
            DB::table('project_setting_versions')->insert(['part' => $part, 'version' => $version, 'value' => $json, 'note' => $note, 'saved_by' => $by?->id, 'saved_at' => now()]);
            DB::table('project_setting_logs')->insert(['part' => $part, 'action' => $action, 'version' => $version, 'user_id' => $by?->id, 'created_at' => now()]);

            return $version;
        });
        $this->cache[$part] = $new;
        ProjectLog::record(null, $by, 'settings.' . $action, 'settings', null, array_intersect_key($old, array_flip($changed)), array_intersect_key($new, array_flip($changed)));

        return ['version' => $version, 'value' => $new, 'changed' => $changed];
    }

    public function version(string $part): int
    {
        return ProjectsSetup::ready() ? (int) DB::table('project_settings')->where('part', $part)->value('version') : 0;
    }

    /** @return array<int, array<string, mixed>> newest first */
    public function versions(string $part): array
    {
        $this->assertPart($part);
        if (! ProjectsSetup::ready()) {
            return [];
        }
        $current = $this->version($part);

        return DB::table('project_setting_versions as v')->leftJoin('users as u', 'u.id', '=', 'v.saved_by')->where('v.part', $part)->orderByDesc('v.version')->limit(100)
            ->get(['v.version', 'v.value', 'v.note', 'v.saved_at', 'u.name as saved_by'])
            ->map(fn ($r) => ['version' => (int) $r->version, 'value' => json_decode((string) $r->value, true) ?: [], 'note' => $r->note, 'saved_at' => $r->saved_at, 'saved_by' => $r->saved_by, 'is_current' => (int) $r->version === $current])
            ->all();
    }

    /** What an earlier version held, or null when there is no such version. @return array<string, mixed>|null */
    public function versionValue(string $part, int $version): ?array
    {
        $this->assertPart($part);
        $value = ProjectsSetup::ready() ? DB::table('project_setting_versions')->where('part', $part)->where('version', $version)->value('value') : null;
        $value = is_string($value) ? json_decode($value, true) : null;

        return is_array($value) ? array_merge(self::DEFAULTS[$part], array_intersect_key($value, self::DEFAULTS[$part])) : null;
    }

    /** Bring an earlier version back, as a new version. @return array{version: int, value: array<string, mixed>, changed: string[]} */
    public function rollback(string $part, int $version, ?User $by): array
    {
        $value = $this->versionValue($part, $version);
        if ($value === null) {
            throw new ProjectException('That version does not exist.', 404);
        }

        return $this->save($part, $value, $by, 'rolled_back', "Brought back version {$version}");
    }

    /** @param array<string, mixed> $v */
    private function clean(string $part, array $v): array
    {
        if ($part === 'general') {
            $industry = (string) $v['default_industry'];
            if (! DB::table('project_industries')->where('key', $industry)->where('is_active', 1)->exists()) {
                throw new ProjectException('Choose an industry that is switched on.');
            }
            $days = (int) $v['trash_days'];
            if ($days < 1 || $days > 3650) {
                throw new ProjectException('Things can stay in the trash from 1 day to 10 years.');
            }

            return ['default_industry' => $industry, 'project_may_use_other_industry' => (bool) $v['project_may_use_other_industry'], 'trash_days' => $days];
        }

        if ($part === 'access') {
            $days = (int) $v['warn_days'];
            if ($days < 0 || $days > 90) {
                throw new ProjectException('Warn from 0 (never) to 90 days before an end date.');
            }

            $minutes = (int) $v['pass_minutes'];
            if ($minutes < 5 || $minutes > 1440) {
                throw new ProjectException('A pass lasts from 5 minutes to 24 hours.');
            }
            $hours = [];
            foreach (ProjectHours::tidy($v['default_hours']) as $day => $h) {
                $hours[] = ['day' => $day] + $h;
            }

            return ['warn_days' => $days, 'default_hours' => $hours, 'read_outside_hours' => (bool) $v['read_outside_hours'], 'passes' => (bool) $v['passes'], 'pass_minutes' => $minutes];
        }

        if ($part === 'shortcuts') {
            $keys = ProjectKeys::tidy($v);
            if ($why = ProjectKeys::problem($keys)) {
                throw new ProjectException($why);
            }

            return $keys;
        }

        return $v;
    }

    private function assertPart(string $part): void
    {
        if (! isset(self::DEFAULTS[$part])) {
            throw new ProjectException('There is no such part of the settings.', 404);
        }
    }
}
