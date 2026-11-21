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
    /** What the saves being made now are: set around an import or a bulk edit; otherwise "changed" by whoever is signed in. @var array{action: ?string, by: ?User, reason: ?string}|null */
    private static ?array $context = null;

    /** Run $fn with its record saves marked as this action, by this person, for this reason. */
    public static function as(string $action, ?User $by, ?string $reason, callable $fn)
    {
        $was = self::$context;
        self::$context = ['action' => $action, 'by' => $by, 'reason' => $reason];
        try {
            return $fn();
        } finally {
            self::$context = $was;
        }
    }

    /** The model's own events (Employee::booted) land here, so every save is kept, whatever code makes it. */
    public function saved(Employee $e, string $event): void
    {
        if (! self::ready()) {
            return;
        }
        $by = self::$context['by'] ?? (auth()->user() instanceof User ? auth()->user() : null);
        $reason = self::$context['reason'] ?? (request()->route() && is_string(request()->input('reason')) ? request()->input('reason') : null);   // a web request's reason, if it gave one
        $action = self::$context['action'] ?? null;
        if ($event === 'updated') {
            $fields = array_merge(...array_values(EmployeeAccess::TIERS));
            foreach (array_keys($e->getChanges()) as $field) {
                if (in_array($field, $fields, true)) {
                    $this->record($e, $field, $action ?? ($field === 'status' ? 'status' : 'changed'), $e->getOriginal($field), $e->getAttribute($field), $by, $reason);
                }
            }

            return;
        }
        $this->record($e, null, $action && $event === 'created' ? $action : ['created' => 'created', 'deleted' => 'deleted', 'restored' => 'restored', 'forceDeleted' => 'purged'][$event], null, null, $by, $reason);
    }

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
                $this->record($e, $field, $field === 'status' && $action === 'changed' ? 'status' : $action, $before[$field] ?? null, $after[$field], $by, $reason);
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

    /** The history of one record as this viewer may read it: the tiers they may see; sensitive values only with that tier. @return array<int, array<string, mixed>> */
    public function read(Employee $e, User $viewer, ?string $tier = null, int $limit = 200): array
    {
        if (! self::ready()) {
            return [];
        }
        $access = app(EmployeeAccess::class);
        $seen = $access->seen($viewer, $e);
        $own = (int) $e->user_id === (int) $viewer->id;
        if (! $own && ! $viewer->hasPermission('hr.view') && ! $viewer->hasPermission('hr.manage')) {
            $seen = array_values(array_intersect($seen, array_merge(['work'], $access->leadTiers($viewer, $e))));   // a manager reads the work history of their line; a lead up to their sensitivity
        }
        $q = DB::table('employee_changes as c')->leftJoin('users as u', 'u.id', '=', 'c.by_user')->where('c.employee_id', $e->id)
            ->where(fn ($w) => $w->whereIn('c.tier', $seen ?: ['none'])->orWhereNull('c.field'))->orderByDesc('c.id')->limit($limit);
        if ($tier) {
            $q->where('c.tier', $tier);
        }
        $open = fn ($v, $t) => $v === null ? null : ($t === 'sensitive' ? self::decrypt($v) : $v);

        return $q->get(['c.*', 'u.name as by_name'])->map(fn ($r) => ['id' => (int) $r->id, 'field' => $r->field, 'tier' => $r->tier, 'action' => $r->action,
            'old' => $open($r->old_value, $r->tier), 'new' => $open($r->new_value, $r->tier), 'reason' => $r->reason, 'by' => $r->by_name, 'at' => $r->created_at])->all();
    }

    private static function decrypt(string $v): ?string
    {
        try {
            return Crypt::decryptString($v);
        } catch (\Throwable) {
            return null;
        }
    }
}
