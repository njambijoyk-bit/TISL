<?php

namespace App\Services\Hr;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every change to an employee record (docs/HR_STAGE1_SPEC.md, build 1.3): who, when, which field, from what to what, and why. Pay and identity
 * values are kept encrypted and shown only to those who may see them (choice 4). It cannot be edited or deleted.
 */
class EmployeeHistory
{
    public static function ready(): bool
    {
        return Schema::hasTable('employee_changes');
    }

    public function record(Employee $e, ?string $field, string $action, $old = null, $new = null, ?User $by = null, ?string $reason = null): void
    {
        if (! self::ready()) {
            return;
        }
        $tier = $field ? (EmployeeAccess::tierOf($field) ?? 'work') : 'work';
        $keep = fn ($v) => $v === null || $v === '' ? null : ($tier === 'sensitive' ? Crypt::encryptString(self::text($v)) : mb_substr(self::text($v), 0, 2000));
        DB::table('employee_changes')->insert(['employee_id' => $e->id, 'employee_name' => mb_substr((string) ($e->user?->name ?? $e->employee_number), 0, 160), 'field' => $field, 'tier' => $tier,
            'old_value' => $keep($old), 'new_value' => $keep($new), 'action' => $action, 'reason' => $reason ? mb_substr($reason, 0, 255) : null, 'by_user' => $by?->id, 'created_at' => now()]);
    }

    /** Record each field that changed between two snapshots of the record. @param array<string, mixed> $before @param array<string, mixed> $after */
    public function changes(Employee $e, array $before, array $after, string $action, ?User $by, ?string $reason = null): int
    {
        $n = 0;
        foreach (array_merge(...array_values(EmployeeAccess::TIERS)) as $field) {
            if (! array_key_exists($field, $after)) {
                continue;
            }
            $a = self::text($before[$field] ?? null);
            $b = self::text($after[$field]);
            if ($a !== $b && ! (is_numeric($a) && is_numeric($b) && (float) $a === (float) $b)) {
                $this->record($e, $field, $action, $before[$field] ?? null, $after[$field], $by, $reason);
                $n++;
            }
        }

        return $n;
    }

    /** The whole of a record's fields, plain, for comparing. @return array<string, mixed> */
    public static function snapshot(Employee $e): array
    {
        $out = [];
        foreach (array_merge(...array_values(EmployeeAccess::TIERS)) as $field) {
            $out[$field] = $e->getAttribute($field);
        }

        return $out;
    }

    public static function text($v): string
    {
        if ($v instanceof \DateTimeInterface) {
            return $v->format('Y-m-d');
        }
        if (is_array($v)) {
            return json_encode($v);
        }
        if (is_bool($v)) {
            return $v ? '1' : '0';
        }

        return trim((string) $v);
    }
}
