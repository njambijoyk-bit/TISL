<?php

namespace App\Services\Books;

use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * The Reports settings: read with their defaults, saved a section at a time, every change logged (who, which setting, old value, new value, when).
 * What each setting is and what a valid value looks like lives in ReportSettingDefinitions; this class only keeps them and checks that the ids they name exist.
 */
class ReportSettings
{
    /** The tables come from database/sql/228_report_settings.sql. */
    public static function ready(): bool
    {
        return Schema::hasTable('report_settings') && Schema::hasTable('report_settings_log');
    }

    /** @return array<string, mixed> every setting by key: the saved value, else its default */
    public function values(): array
    {
        $saved = static::ready() ? DB::table('report_settings')->pluck('value', 'setting_key')->all() : [];
        $out = [];
        foreach (ReportSettingDefinitions::settings() as $key => $spec) {
            $out[$key] = array_key_exists($key, $saved) ? json_decode((string) $saved[$key], true) : $spec['default'];
        }

        return $out;
    }

    public function get(string $key): mixed
    {
        return $this->values()[$key] ?? throw new InvalidArgumentException("There is no setting called {$key}.");
    }

    /** The sections for the screen: each with what the person may do on it and its settings with their values. */
    public function sectionsFor(User $user): array
    {
        $values = $this->values();
        $access = app(Authorizer::class);
        $out = [];
        foreach (ReportSettingDefinitions::sections() as $id => $s) {
            $settings = [];
            foreach ($s['settings'] as $key => $spec) {
                $settings[] = ['key' => $key, 'value' => $values[$key]] + array_intersect_key($spec, array_flip(['type', 'label', 'hint', 'default', 'options', 'min', 'max', 'max_length', 'max_items']));
            }
            $out[] = ['id' => $id, 'title' => $s['title'], 'hint' => $s['hint'], 'permission' => $s['permission'], 'can_edit' => $access->allows($user, $s['permission']), 'settings' => $settings];
        }

        return $out;
    }

    /**
     * Save some settings of one section. Nothing is written unless every value is valid; a value that has not changed is not written or logged.
     *
     * @param  array<string, mixed>  $input  key => value
     * @return string[] the keys that changed
     *
     * @throws ValidationException
     */
    public function save(string $section, array $input, User $user): array
    {
        $sections = ReportSettingDefinitions::sections();
        abort_unless(isset($sections[$section]), 404, 'There is no such section.');
        abort_unless(static::ready(), 409, 'Run database script 228_report_settings.sql first.');
        $allowed = array_keys($sections[$section]['settings']);

        $clean = [];
        $errors = [];
        foreach ($input as $key => $value) {
            if (! in_array($key, $allowed, true)) {
                $errors["values.{$key}"] = "{$key} is not a setting on this section.";
                continue;
            }
            try {
                $clean[$key] = ReportSettingDefinitions::normalise($key, $value);
                $this->assertExist($key, $clean[$key]);
            } catch (InvalidArgumentException $e) {
                $errors["values.{$key}"] = $e->getMessage();
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $current = $this->values();
        $changed = [];
        $by = trim((string) ($user->name ?? '')) ?: (string) ($user->email ?? '');
        DB::transaction(function () use ($clean, $current, $user, $by, &$changed) {
            $now = now();
            foreach ($clean as $key => $new) {
                if ($this->canon($current[$key]) === $this->canon($new)) {
                    continue;
                }
                $json = json_encode($new, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $exists = DB::table('report_settings')->where('setting_key', $key)->exists();
                if ($exists) {
                    DB::table('report_settings')->where('setting_key', $key)->update(['value' => $json, 'updated_by' => $user->id, 'updated_at' => $now]);
                } else {
                    DB::table('report_settings')->insert(['setting_key' => $key, 'value' => $json, 'updated_by' => $user->id, 'created_at' => $now, 'updated_at' => $now]);
                }
                DB::table('report_settings_log')->insert([
                    'setting_key' => $key, 'old_value' => json_encode($current[$key], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'new_value' => $json,
                    'changed_by' => $user->id, 'changed_by_name' => mb_substr($by, 0, 120), 'created_at' => $now,
                ]);
                $changed[] = $key;
            }
        });

        return $changed;
    }

    /** The change log, newest first. */
    public function log(int $limit = 100, ?string $key = null): array
    {
        if (! static::ready()) {
            return [];
        }
        $settings = ReportSettingDefinitions::settings();

        return DB::table('report_settings_log')->when($key, fn ($q) => $q->where('setting_key', $key))->orderByDesc('id')->limit(max(1, min($limit, 500)))->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id, 'key' => $r->setting_key, 'label' => $settings[$r->setting_key]['label'] ?? $r->setting_key,
                'old' => $r->old_value === null ? null : json_decode((string) $r->old_value, true), 'new' => json_decode((string) $r->new_value, true),
                'by' => $r->changed_by_name, 'at' => (string) $r->created_at,
            ])->all();
    }

    /** What the screen needs to offer choices: every group, and the statement lines and headings a ratio figure can add up. */
    public function lookups(): array
    {
        $groups = DB::table('ledger_groups')->orderBy('sort_order')->orderBy('name')->get(['id', 'parent_id', 'name', 'nature']);
        $byId = $groups->keyBy('id');
        $path = function ($g) use ($byId) {
            $names = [$g->name];
            $guard = 0;
            while ($g->parent_id && isset($byId[$g->parent_id]) && $guard++ < 12) {
                $g = $byId[$g->parent_id];
                array_unshift($names, $g->name);
            }

            return implode(' › ', $names);
        };

        return [
            'groups' => $groups->map(fn ($g) => ['id' => (int) $g->id, 'name' => $g->name, 'path' => $path($g), 'nature' => $g->nature])->sortBy('path', SORT_NATURAL | SORT_FLAG_CASE)->values()->all(),
            'statements' => Schema::hasTable('statements')
                ? DB::table('statements')->where('is_active', 1)->orderBy('code')->get(['code', 'name', 'kind', 'nature'])->map(fn ($s) => (array) $s)->all()
                : [],
            'ratio_inputs' => ReportSettingDefinitions::RATIO_INPUTS,
            'ledger_kinds' => ReportSettingDefinitions::LEDGER_KINDS,
        ];
    }

    /**
     * Every ledger that can be reconciled: those in a reconcilable group (or a group under one). For each, whether it is switched off, the kind
     * confirmed for it (null until someone confirms), and the kind we would guess.
     */
    public function reconcilableLedgers(): array
    {
        $v = $this->values();
        $groupIds = [];
        foreach ($v['reconcilable_groups'] as $gid) {
            $groupIds = array_merge($groupIds, $this->withDescendants((int) $gid));
        }
        $groupIds = array_values(array_unique($groupIds));
        if (! $groupIds) {
            return [];
        }
        $rows = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->whereIn('l.group_id', $groupIds)->where('l.is_active', 1)
            ->orderBy('g.name')->orderBy('l.name')
            ->get(['l.id', 'l.name', 'l.group_id', 'g.name as group_name', 'g.behaviour', 'l.bank_name', 'l.account_number', 'l.mobile_kind', 'l.cash_kind']);
        $methods = DB::table('payment_methods')->whereIn('ledger_id', $rows->pluck('id')->all() ?: [0])->where('is_active', 1)->orderBy('id')->pluck('kind', 'ledger_id')->all();
        $disabled = array_flip(array_map('intval', $v['reconcile_disabled_ledgers']));

        return $rows->map(fn ($r) => [
            'id' => (int) $r->id, 'name' => $r->name, 'group_id' => (int) $r->group_id, 'group' => $r->group_name,
            'disabled' => isset($disabled[(int) $r->id]),
            'kind' => $v['reconcile_ledger_kinds'][(string) $r->id] ?? null,
            'suggested_kind' => self::suggestKind($r, $methods[$r->id] ?? null),
        ])->all();
    }

    /**
     * The kind of account a ledger looks like, in this order: the payment method that posts to it, then the ledger's own bank / mobile / cash fields,
     * then its group (a bank-behaviour group is a bank, a party group is a counter-party). The kind someone has confirmed overrides all of this.
     */
    public static function suggestKind(object $ledger, ?string $paymentMethodKind): string
    {
        $fromMethod = match ($paymentMethodKind) {
            'mobile_money' => 'mobile_money', 'cash' => 'cash', 'bank', 'card' => 'bank', default => null,
        };
        if ($fromMethod) {
            return $fromMethod;
        }
        if (! empty($ledger->mobile_kind)) {
            return 'mobile_money';
        }
        if (! empty($ledger->cash_kind)) {
            return 'cash';
        }
        if (! empty($ledger->bank_name) || ! empty($ledger->account_number)) {
            return 'bank';
        }

        return match ($ledger->behaviour ?? null) {
            'bank' => 'bank', 'party' => 'counterparty', default => 'other',
        };
    }

    /**
     * The ledgers one ratio input names (Reports settings, Ratio analysis inputs): every ledger in the chosen groups and the groups under them, and every
     * ledger on the chosen statement lines (or on a line under a chosen heading), counting a ledger's own line before its group's. Null when nothing has
     * been chosen for it, so a report can say it is not set up instead of guessing from a name.
     *
     * @return int[]|null
     */
    public function ratioLedgerIds(string $input): ?array
    {
        $choice = $this->values()['ratio_inputs'][$input] ?? null;
        $groups = array_map('intval', $choice['groups'] ?? []);
        $codes = array_map('strval', $choice['statements'] ?? []);
        if (! $groups && ! $codes) {
            return null;
        }
        $groupIds = [];
        foreach ($groups as $g) {
            $groupIds = array_merge($groupIds, $this->withDescendants($g));
        }
        $lineIds = [];
        if ($codes && Schema::hasTable('statements')) {
            $frontier = DB::table('statements')->whereIn('code', $codes)->pluck('id')->map(fn ($i) => (int) $i)->all();
            $lineIds = $frontier;
            for ($guard = 0; $frontier && $guard < 8; $guard++) {
                $frontier = DB::table('statements')->whereIn('parent_id', $frontier)->pluck('id')->map(fn ($i) => (int) $i)->all();
                $lineIds = array_merge($lineIds, $frontier);
            }
        }
        $ids = [];
        foreach (app(Engine\LedgerBalances::class)->ledgers() as $l) {
            if (in_array((int) $l->group_id, $groupIds, true) || ($l->statement_id && in_array((int) $l->statement_id, $lineIds, true))) {
                $ids[] = (int) $l->id;
            }
        }

        return $ids;
    }

    /** A group's id plus every group under it. */
    private function withDescendants(int $groupId): array
    {
        $ids = [$groupId];
        $frontier = [$groupId];
        $guard = 0;
        while ($frontier && $guard++ < 12) {
            $frontier = DB::table('ledger_groups')->whereIn('parent_id', $frontier)->pluck('id')->map(fn ($i) => (int) $i)->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }

    /** The groups, ledgers and statement lines a value names must exist. */
    private function assertExist(string $key, mixed $value): void
    {
        $type = ReportSettingDefinitions::settings()[$key]['type'];
        $label = ReportSettingDefinitions::settings()[$key]['label'];
        $missing = function (string $table, array $ids, string $what) use ($label) {
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if ($ids && DB::table($table)->whereIn('id', $ids)->count() !== count($ids)) {
                throw new InvalidArgumentException("{$label}: one of the {$what} chosen no longer exists.");
            }
        };
        if ($type === 'group_list') {
            $missing('ledger_groups', $value, 'groups');
        } elseif ($type === 'ledger_list') {
            $missing('ledgers', $value, 'ledgers');
        } elseif ($type === 'ledger_kinds') {
            $missing('ledgers', array_keys($value), 'ledgers');
        } elseif ($type === 'ratio_inputs') {
            $groups = [];
            $codes = [];
            foreach ($value as $choice) {
                $groups = array_merge($groups, $choice['groups']);
                $codes = array_merge($codes, $choice['statements']);
            }
            $missing('ledger_groups', $groups, 'groups');
            $codes = array_values(array_unique($codes));
            if ($codes && (! Schema::hasTable('statements') || DB::table('statements')->whereIn('code', $codes)->count() !== count($codes))) {
                throw new InvalidArgumentException("{$label}: one of the statement lines chosen does not exist (has script 227 been run?).");
            }
        }
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
