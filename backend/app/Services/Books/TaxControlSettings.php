<?php

namespace App\Services\Books;

use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * The Tax control settings: read with their defaults, saved a section at a time, every change logged (who, which setting, old value, new value, when).
 * What each setting is lives in TaxControlDefinitions; this class keeps them, checks that what they name exists and that they agree with each other
 * and with the tax types already set up, and decides who may change which section.
 */
class TaxControlSettings
{
    /** The tables come from database/sql/229_tax_control.sql. */
    public static function ready(): bool
    {
        return Schema::hasTable('tax_control_settings') && Schema::hasTable('tax_control_log');
    }

    /** @return array<string, mixed> every setting by key: the saved value, else its default */
    public function values(): array
    {
        $saved = static::ready() ? DB::table('tax_control_settings')->pluck('value', 'setting_key')->all() : [];
        $out = [];
        foreach (TaxControlDefinitions::settings() as $key => $spec) {
            $out[$key] = array_key_exists($key, $saved) ? json_decode((string) $saved[$key], true) : $spec['default'];
        }

        return $out;
    }

    public function get(string $key): mixed
    {
        return $this->values()[$key] ?? (TaxControlDefinitions::has($key) ? null : throw new InvalidArgumentException("There is no setting called {$key}."));
    }

    /** May this person change a section? The tax control permission changes everything; the tax administrator permission only the sections it is named for. */
    public function canChange(User $user, string $section): bool
    {
        $access = app(Authorizer::class);

        return $access->allows($user, TaxControlDefinitions::CONTROL) || $access->allows($user, TaxControlDefinitions::sections()[$section]['permission']);
    }

    /** The sections for the screen: each with whether this person may change it, and its settings with their values. */
    public function sectionsFor(User $user): array
    {
        $values = $this->values();
        $out = [];
        foreach (TaxControlDefinitions::sections() as $id => $s) {
            $settings = [];
            foreach ($s['settings'] as $key => $spec) {
                $settings[] = ['key' => $key, 'value' => $values[$key]] + array_intersect_key($spec, array_flip(['type', 'label', 'hint', 'default', 'options', 'min', 'max', 'max_items']));
            }
            $out[] = ['id' => $id, 'title' => $s['title'], 'hint' => $s['hint'], 'permission' => $s['permission'], 'can_edit' => $this->canChange($user, $id), 'settings' => $settings];
        }

        return $out;
    }

    /**
     * Save some settings of one section. Nothing is written unless every value is valid and the settings agree with each other; a value that has not
     * changed is not written or logged.
     *
     * @param  array<string, mixed>  $input  key => value
     * @return string[] the keys that changed
     *
     * @throws ValidationException
     */
    public function save(string $section, array $input, User $user): array
    {
        $sections = TaxControlDefinitions::sections();
        abort_unless(isset($sections[$section]), 404, 'There is no such section.');
        abort_unless(static::ready(), 409, 'Run database script 229_tax_control.sql first.');
        abort_unless($this->canChange($user, $section), 403, 'You do not have the permission to change these settings.');
        $allowed = array_keys($sections[$section]['settings']);

        $clean = [];
        $errors = [];
        foreach ($input as $key => $value) {
            if (! in_array($key, $allowed, true)) {
                $errors["values.{$key}"] = "{$key} is not a setting on this section.";
                continue;
            }
            try {
                $clean[$key] = TaxControlDefinitions::normalise($key, $value);
                $this->assertExist($key, $clean[$key]);
            } catch (InvalidArgumentException $e) {
                $errors["values.{$key}"] = $e->getMessage();
            }
        }
        $current = $this->values();
        if (! $errors) {
            foreach ($this->consistency($clean + $current) as $key => $message) {
                if (array_key_exists($key, $clean)) {
                    $errors["values.{$key}"] = $message;
                }
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $changed = [];
        $by = trim((string) ($user->name ?? '')) ?: (string) ($user->email ?? '');
        DB::transaction(function () use ($clean, $current, $user, $by, &$changed) {
            $now = now();
            foreach ($clean as $key => $new) {
                if ($this->canon($current[$key]) === $this->canon($new)) {
                    continue;
                }
                $json = json_encode($new, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if (DB::table('tax_control_settings')->where('setting_key', $key)->exists()) {
                    DB::table('tax_control_settings')->where('setting_key', $key)->update(['value' => $json, 'updated_by' => $user->id, 'updated_at' => $now]);
                } else {
                    DB::table('tax_control_settings')->insert(['setting_key' => $key, 'value' => $json, 'updated_by' => $user->id, 'created_at' => $now, 'updated_at' => $now]);
                }
                DB::table('tax_control_log')->insert([
                    'setting_key' => $key, 'old_value' => json_encode($current[$key], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'new_value' => $json,
                    'changed_by' => $user->id, 'changed_by_name' => mb_substr($by, 0, 120), 'created_at' => $now,
                ]);
                $changed[] = $key;
            }
        });

        $this->copyToCompany($changed, $clean);

        return $changed;
    }

    /**
     * The company's country of registration and tax registrations are kept on the company details too (script 234), so documents and the storefront read the
     * company and never Tax control. Saving either here updates the company's columns.
     */
    private function copyToCompany(array $changed, array $clean): void
    {
        $columns = array_filter([
            'tax_country' => in_array('tax_country', $changed, true) ? (strtoupper((string) $clean['tax_country']) ?: null) : false,
            'tax_registrations' => in_array('tax_registrations', $changed, true) ? ($clean['tax_registrations'] ?: null) : false,
        ], fn ($v) => $v !== false);
        if (! $columns || ! Schema::hasColumn('company_profile', 'tax_country')) {
            return;
        }
        $company = \App\Models\CompanyProfile::first();
        if ($company) {
            $company->fill($columns)->save();
        }
    }

    /** The change log, newest first. */
    public function log(int $limit = 100, ?string $key = null): array
    {
        if (! static::ready()) {
            return [];
        }
        $settings = TaxControlDefinitions::settings();

        return DB::table('tax_control_log')->when($key, fn ($q) => $q->where('setting_key', $key))->orderByDesc('id')->limit(max(1, min($limit, 500)))->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id, 'key' => $r->setting_key, 'label' => $settings[$r->setting_key]['label'] ?? $r->setting_key,
                'old' => $r->old_value === null ? null : json_decode((string) $r->old_value, true), 'new' => json_decode((string) $r->new_value, true),
                'by' => $r->changed_by_name, 'at' => (string) $r->created_at,
            ])->all();
    }

    /** What the screen needs to offer choices. */
    public function lookups(): array
    {
        $types = DB::table('ledger_groups')->where('behaviour', 'tax')->whereNotNull('application_mode')->orderBy('name')
            ->get(array_merge(['id', 'name'], Schema::hasColumn('ledger_groups', 'tax_category') ? ['tax_category', 'application_method'] : []))
            ->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'category' => $t->tax_category ?? null, 'method' => $t->application_method ?? null])->all();
        $ledgers = DB::table('ledgers as l')->leftJoin('ledger_groups as g', 'g.id', '=', 'l.group_id')->orderBy('g.name')->orderBy('l.name')->get(['l.id', 'l.name', 'g.name as group'])
            ->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group])->all();

        return [
            'groups' => app(ReportSettings::class)->lookups()['groups'], 'tax_types' => $types, 'ledgers' => $ledgers,
            'categories' => TaxControlDefinitions::CATEGORIES, 'methods' => TaxControlDefinitions::METHODS, 'exemptions' => TaxControlDefinitions::EXEMPTIONS, 'documents' => TaxControlDefinitions::DOCUMENTS,
        ];
    }

    /** The groups and ledgers a value names must exist, and a tax named must really be a tax type. */
    private function assertExist(string $key, mixed $value): void
    {
        $type = TaxControlDefinitions::settings()[$key]['type'];
        $label = TaxControlDefinitions::settings()[$key]['label'];
        if ($type === 'group_id' && $value !== null && ! DB::table('ledger_groups')->where('id', $value)->exists()) {
            throw new InvalidArgumentException("{$label}: that group no longer exists.");
        }
        if ($type === 'category_ledgers') {
            $ids = array_values(array_unique(array_filter(array_merge(...array_map('array_values', array_values($value ?: [[]]))))));
            if ($ids && DB::table('ledgers')->whereIn('id', $ids)->count() !== count($ids)) {
                throw new InvalidArgumentException("{$label}: one of the ledgers chosen no longer exists.");
            }
        }
        if ($type === 'apply_regardless') {
            $ids = array_column($value, 'tax_type_id');
            if ($ids && DB::table('ledger_groups')->where('behaviour', 'tax')->whereIn('id', $ids)->count() !== count($ids)) {
                throw new InvalidArgumentException("{$label}: a tax chosen is not a tax type.");
            }
        }
    }

    /**
     * The settings as they would stand, checked against each other and against the tax types already set up. Returns key => message for what is wrong.
     *
     * @param  array<string, mixed>  $v
     * @return array<string, string>
     */
    private function consistency(array $v): array
    {
        $errors = [];
        $enabled = $v['enabled_categories'];
        $methods = $v['category_methods'];
        foreach ($enabled as $c) {
            if (empty($methods[$c])) {
                $errors['category_methods'] = TaxControlDefinitions::CATEGORIES[$c] . ' is in use but has no way of being applied: allow at least one, or switch the category off.';
                break;
            }
        }
        // what an existing tax type uses cannot be taken away
        if (Schema::hasColumn('ledger_groups', 'tax_category')) {
            $used = DB::table('ledger_groups')->where('behaviour', 'tax')->whereNotNull('tax_category')->get(['name', 'tax_category', 'application_method']);
            foreach ($used as $t) {
                if (! in_array($t->tax_category, $enabled, true)) {
                    $errors['enabled_categories'] = (TaxControlDefinitions::CATEGORIES[$t->tax_category] ?? $t->tax_category) . " is used by the tax type \"{$t->name}\", so it cannot be switched off.";
                    break;
                }
                if ($t->application_method && ! in_array($t->application_method, $methods[$t->tax_category] ?? [], true)) {
                    $errors['category_methods'] = (TaxControlDefinitions::METHODS[$t->application_method] ?? $t->application_method) . " is used by the tax type \"{$t->name}\", so " . (TaxControlDefinitions::CATEGORIES[$t->tax_category] ?? $t->tax_category) . ' must still allow it.';
                    break;
                }
            }
        }

        return $errors;
    }

    /** A value in one fixed form, so 0 and 0.0, or two maps with their keys in another order, count as the same. */
    private function canon(mixed $v): string
    {
        $fix = function ($x) use (&$fix) {
            if (is_array($x)) {
                $x = array_map($fix, $x);
                if (! array_is_list($x)) {
                    ksort($x);
                }

                return $x;
            }

            return is_float($x) && floor($x) === $x ? (int) $x : $x;
        };

        return json_encode($fix($v));
    }
}
