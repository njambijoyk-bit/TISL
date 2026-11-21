<?php

namespace App\Services\Hr;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** The company's employment types (HR stage 1), replacing the free text. Before script 271 the four the form always offered. */
class EmploymentTypes
{
    public const FALLBACK = ['full_time' => 'Full time', 'part_time' => 'Part time', 'contract' => 'Contract', 'intern' => 'Intern'];

    public static function ready(): bool
    {
        return Schema::hasTable('hr_employment_types');
    }

    /** @return array<int, array<string, mixed>> */
    public function all(bool $activeOnly = false): array
    {
        if (! self::ready()) {
            return collect(self::FALLBACK)->map(fn ($n, $k) => ['id' => null, 'key' => $k, 'name' => $n, 'paid_by_payroll' => true, 'is_active' => true, 'people' => 0])->values()->all();
        }
        $counts = DB::table('employees')->whereNull('deleted_at')->groupBy('employment_type')->pluck(DB::raw('COUNT(*)'), 'employment_type');

        return DB::table('hr_employment_types')->when($activeOnly, fn ($q) => $q->where('is_active', 1))->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn ($t) => ['id' => (int) $t->id, 'key' => $t->key, 'name' => $t->name, 'paid_by_payroll' => (bool) $t->paid_by_payroll, 'is_active' => (bool) $t->is_active, 'people' => (int) ($counts[$t->key] ?? 0)])->all();
    }

    /** @return string[] */
    public function keys(): array
    {
        return array_column($this->all(true), 'key');
    }

    public function idOf(?string $key): ?int
    {
        return self::ready() && $key ? (DB::table('hr_employment_types')->where('key', $key)->value('id') ?: null) : null;
    }

    /** @param array<string, mixed> $d name, paid_by_payroll, is_active */
    public function save(?int $id, array $d): int
    {
        self::ready() || throw ValidationException::withMessages(['types' => 'Run database script 271_hr_foundation.sql first.']);
        $name = trim((string) ($d['name'] ?? ''));
        if (! $id || array_key_exists('name', $d)) {
            ($name !== '' && mb_strlen($name) <= 80) || throw ValidationException::withMessages(['name' => 'Give the type a name of up to 80 characters.']);
        }
        $row = array_filter(['name' => $name ?: null, 'paid_by_payroll' => array_key_exists('paid_by_payroll', $d) ? (int) (bool) $d['paid_by_payroll'] : null,
            'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : null], fn ($v) => $v !== null) + ['updated_at' => now()];
        if ($id) {
            DB::table('hr_employment_types')->where('id', $id)->exists() || throw ValidationException::withMessages(['type' => 'That type is not there.']);
            DB::table('hr_employment_types')->where('id', $id)->update($row);

            return $id;
        }
        $key = Str::slug($name, '_');
        DB::table('hr_employment_types')->where('key', $key)->exists() && throw ValidationException::withMessages(['name' => 'There is already a type with that name.']);

        return DB::table('hr_employment_types')->insertGetId($row + ['key' => $key, 'paid_by_payroll' => $row['paid_by_payroll'] ?? 1, 'is_active' => 1,
            'sort_order' => (int) DB::table('hr_employment_types')->max('sort_order') + 10, 'created_at' => now()]);
    }
}
