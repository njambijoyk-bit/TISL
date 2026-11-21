<?php

namespace App\Services\Hr;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/** HR configuration (docs/HR_STAGE1_SPEC.md): kept in parts, every save a numbered version that can be brought back. Defaults until script 271 is run. */
class HrSettings
{
    public const DEFAULTS = [
        'general' => [
            'number_prefix' => 'EMP-', 'number_width' => 4,
            'required' => ['work_email' => false, 'department' => true, 'manager' => false, 'hire_date' => false, 'phone' => false],
            'own_details' => true,   // people see their own pay and identity details (masked until Show)
        ],
    ];

    public static function ready(): bool
    {
        return Schema::hasTable('hr_settings') && Schema::hasTable('hr_settings_versions');
    }

    /** @return array<string, mixed> */
    public function get(string $part = 'general'): array
    {
        $row = self::ready() ? DB::table('hr_settings')->where('part', $part)->first() : null;
        $saved = $row ? (json_decode((string) $row->value, true) ?: []) : [];

        return array_replace_recursive(self::DEFAULTS[$part], array_intersect_key($saved, self::DEFAULTS[$part]));
    }

    public function version(string $part = 'general'): int
    {
        return self::ready() ? (int) (DB::table('hr_settings')->where('part', $part)->value('version') ?? 0) : 0;
    }

    /** @return array{version: int, value: array<string, mixed>} */
    public function save(string $part, array $input, ?User $by, string $action = 'saved', ?string $note = null): array
    {
        self::ready() || throw ValidationException::withMessages(['settings' => 'Run database script 271_hr_foundation.sql first.']);
        $value = $this->clean($part, array_replace_recursive($this->get($part), array_intersect_key($input, self::DEFAULTS[$part])));
        $version = $this->version($part) + 1;
        DB::transaction(function () use ($part, $value, $version, $by, $action, $note) {
            DB::table('hr_settings')->updateOrInsert(['part' => $part], ['value' => json_encode($value), 'version' => $version, 'updated_by' => $by?->id, 'updated_at' => now()]);
            DB::table('hr_settings_versions')->insert(['part' => $part, 'version' => $version, 'value' => json_encode($value), 'action' => $action, 'note' => $note, 'by_user' => $by?->id, 'created_at' => now()]);
        });

        return ['version' => $version, 'value' => $value];
    }

    /** Bring an earlier version back, as a new version. */
    public function rollback(string $part, int $version, ?User $by): array
    {
        $row = self::ready() ? DB::table('hr_settings_versions')->where('part', $part)->where('version', $version)->first() : null;
        $row || throw ValidationException::withMessages(['version' => 'That version does not exist.']);

        return $this->save($part, json_decode((string) $row->value, true) ?: [], $by, 'rolled_back', "Brought back version {$version}");
    }

    /** @return array<int, array<string, mixed>> */
    public function versions(string $part = 'general'): array
    {
        return self::ready() ? DB::table('hr_settings_versions as v')->leftJoin('users as u', 'u.id', '=', 'v.by_user')->where('v.part', $part)->orderByDesc('v.version')->limit(30)
            ->get(['v.version', 'v.action', 'v.note', 'v.created_at', 'u.name as by'])->map(fn ($r) => (array) $r)->all() : [];
    }

    private function clean(string $part, array $v): array
    {
        $prefix = trim((string) $v['number_prefix']);
        (mb_strlen($prefix) <= 12 && preg_match('/^[A-Za-z0-9\/\-_.]*$/', $prefix)) || throw ValidationException::withMessages(['number_prefix' => 'A prefix is up to 12 letters, digits or - / _ .']);
        $width = (int) $v['number_width'];
        ($width >= 1 && $width <= 10) || throw ValidationException::withMessages(['number_width' => 'Numbers are 1 to 10 digits wide.']);

        return ['number_prefix' => $prefix, 'number_width' => $width, 'required' => array_map(fn ($x) => (bool) $x, array_intersect_key((array) $v['required'], self::DEFAULTS['general']['required'])),
            'own_details' => (bool) $v['own_details']];
    }
}
