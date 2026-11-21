<?php

namespace App\Services\Hr;

use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Department leads (docs/HR_STAGE1B_SPEC.md): one head and any number of assistants per department, each with a sensitivity, meaning how much of
 * the department's people's records they see:
 *   work      the work tier       personal  work and personal       full  everything, pay and identity included (needs hr.sensitive)
 * An assistant's sensitivity is never above the head's. A department is never orphaned: it always keeps a lead with full sensitivity.
 */
class DepartmentLeads
{
    public const LEVELS = ['work' => 1, 'personal' => 2, 'full' => 3];

    public const TIERS = ['work' => ['work'], 'personal' => ['work', 'personal'], 'full' => ['work', 'personal', 'sensitive']];

    /** @var array<int, array<int, array{role: string, sensitivity: string}>> */
    private array $memo = [];

    public static function ready(): bool
    {
        return Schema::hasTable('department_leads') && Schema::hasTable('departments');
    }

    /** The departments this user leads: department_id => role and sensitivity. @return array<int, array{role: string, sensitivity: string}> */
    public function ledBy(User $u): array
    {
        if (! self::ready()) {
            return [];
        }
        if (isset($this->memo[$u->id])) {
            return $this->memo[$u->id];
        }
        $me = Employee::where('user_id', $u->id)->value('id');
        $rows = $me ? DB::table('department_leads')->where('employee_id', $me)->get(['department_id', 'role', 'sensitivity']) : collect();
        $out = [];
        foreach ($rows as $r) {
            $level = $r->sensitivity === 'full' && ! $u->hasPermission('hr.sensitive') ? 'personal' : $r->sensitivity;   // full only while they hold hr.sensitive (choice 1)
            $out[(int) $r->department_id] = ['role' => $r->role, 'sensitivity' => $level];
        }

        return $this->memo[$u->id] = $out;
    }

    public function forget(): void
    {
        $this->memo = [];
    }

    /** @return array<int, array<string, mixed>> */
    public function of(int $departmentId): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('department_leads as x')->join('employees as e', 'e.id', '=', 'x.employee_id')->leftJoin('users as u', 'u.id', '=', 'e.user_id')
            ->where('x.department_id', $departmentId)->orderByRaw("CASE x.role WHEN 'head' THEN 0 ELSE 1 END")->orderBy('u.name')
            ->get(['x.id', 'x.employee_id', 'x.role', 'x.sensitivity', 'u.name', 'e.job_title', 'e.user_id'])
            ->map(fn ($r) => ['id' => (int) $r->id, 'employee_id' => (int) $r->employee_id, 'user_id' => $r->user_id ? (int) $r->user_id : null, 'name' => $r->name, 'job_title' => $r->job_title,
                'role' => $r->role, 'sensitivity' => $r->sensitivity])->all();
    }

    /** Appoint (or change) a lead. role: head | assistant; sensitivity: work | personal | full. */
    public function appoint(Department $d, int $employeeId, string $role, string $sensitivity, ?User $by): void
    {
        self::ready() || throw ValidationException::withMessages(['lead' => 'Run database script 272_departments_link.sql first.']);
        in_array($role, ['head', 'assistant'], true) || throw ValidationException::withMessages(['role' => 'A lead is the head or an assistant.']);
        isset(self::LEVELS[$sensitivity]) || throw ValidationException::withMessages(['sensitivity' => 'Choose work, personal or full.']);
        $e = Employee::with('user')->find($employeeId) ?? throw ValidationException::withMessages(['employee_id' => 'Choose someone with an employee record.']);
        in_array($e->status, ['active', 'probation', 'on_leave'], true) || throw ValidationException::withMessages(['employee_id' => 'Only someone who works here can lead a department.']);
        if ($sensitivity === 'full' && ! $e->user?->hasPermission('hr.sensitive')) {
            throw ValidationException::withMessages(['sensitivity' => "{$e->user?->name} does not hold the permission for pay, bank and identity details, so they cannot be given full sensitivity."]);
        }
        DB::transaction(function () use ($d, $e, $role, $sensitivity, $by) {
            $rows = collect($this->of($d->id))->keyBy('employee_id');
            $head = $rows->firstWhere('role', 'head');
            if ($role === 'head' && $head && $head['employee_id'] !== $e->id) {
                // the old head becomes an assistant, keeping their sensitivity if it is not above the new head's
                $keep = self::LEVELS[$head['sensitivity']] <= self::LEVELS[$sensitivity] ? $head['sensitivity'] : $sensitivity;
                DB::table('department_leads')->where('id', $head['id'])->update(['role' => 'assistant', 'sensitivity' => $keep, 'updated_at' => now()]);
            }
            $headLevel = $role === 'head' ? $sensitivity : ($head && $head['employee_id'] !== $e->id ? $head['sensitivity'] : 'full');
            if ($role === 'assistant' && self::LEVELS[$sensitivity] > self::LEVELS[$headLevel]) {
                throw ValidationException::withMessages(['sensitivity' => 'An assistant cannot see more than the head.']);
            }
            if ($role === 'assistant' && $head && $head['employee_id'] === $e->id) {
                throw ValidationException::withMessages(['role' => 'Appoint another head first; a department always has one.']);
            }
            if ($role === 'head') {   // assistants above the new head come down to the head's level
                DB::table('department_leads')->where('department_id', $d->id)->where('role', 'assistant')->whereIn('sensitivity', array_keys(array_filter(self::LEVELS, fn ($l) => $l > self::LEVELS[$sensitivity])))
                    ->update(['sensitivity' => $sensitivity, 'updated_at' => now()]);
            }
            DB::table('department_leads')->updateOrInsert(['department_id' => $d->id, 'employee_id' => $e->id], ['role' => $role, 'sensitivity' => $sensitivity, 'appointed_by' => $by?->id, 'updated_at' => now(), 'created_at' => now()]);
            $this->mustKeepFull($d->id);
            DB::table('departments')->where('id', $d->id)->update(['manager_employee_id' => $role === 'head' ? $e->id : DB::raw('manager_employee_id')]);   // the old column follows the head
        });
        $this->forget();
    }

    public function remove(Department $d, int $employeeId): void
    {
        $row = DB::table('department_leads')->where('department_id', $d->id)->where('employee_id', $employeeId)->first() ?? throw ValidationException::withMessages(['lead' => 'That person does not lead this department.']);
        $row->role === 'head' && throw ValidationException::withMessages(['lead' => 'Appoint another head first; a department always has one.']);
        DB::transaction(function () use ($d, $row) {
            DB::table('department_leads')->where('id', $row->id)->delete();
            $this->mustKeepFull($d->id);
        });
        $this->forget();
    }

    /** Refuse anything that would leave the department without a lead holding full sensitivity (and the permission behind it). */
    public function mustKeepFull(int $departmentId, array $without = []): void
    {
        if (! $this->hasFull($departmentId, $without)) {
            $name = DB::table('departments as d')->leftJoin('locations as l', 'l.id', '=', 'd.location_id')->where('d.id', $departmentId)->selectRaw("COALESCE(l.name, '') as branch, d.name")->first();
            throw ValidationException::withMessages(['lead' => 'That would leave ' . trim(($name->branch ?? '') . ' › ' . ($name->name ?? 'the department'), ' ›') . ' without a lead who can see pay and identity details. Appoint another first.']);
        }
    }

    /** @param int[] $without employee ids to leave out (someone about to go) */
    public function hasFull(int $departmentId, array $without = []): bool
    {
        foreach (DB::table('department_leads as x')->join('employees as e', 'e.id', '=', 'x.employee_id')->where('x.department_id', $departmentId)->where('x.sensitivity', 'full')
            ->whereNotIn('x.employee_id', $without ?: [0])->whereNull('e.deleted_at')->whereIn('e.status', ['active', 'probation', 'on_leave'])->get(['e.user_id']) as $r) {
            $u = $r->user_id ? User::find($r->user_id) : null;
            if ($u && $u->hasPermission('hr.sensitive')) {
                return true;
            }
        }

        return false;
    }

    /** Before a person leaves, is ended, suspended, deleted, or loses hr.sensitive: refuse if a department would be orphaned. */
    public function mayLose(int $employeeId): void
    {
        if (! self::ready()) {
            return;
        }
        foreach (DB::table('department_leads')->where('employee_id', $employeeId)->where('sensitivity', 'full')->pluck('department_id') as $dept) {
            if (DB::table('departments')->where('id', $dept)->where('is_active', 1)->exists()) {
                $this->mustKeepFull((int) $dept, [$employeeId]);
            }
        }
    }

    /** The departments of a user's account that would be orphaned without them (for an account or permission change). */
    public function mayLoseUser(User $u): void
    {
        if ($id = Employee::where('user_id', $u->id)->value('id')) {
            $this->mayLose((int) $id);
        }
    }

    /** Active departments with no lead holding full sensitivity (script 272's Part C, and the Departments page's warning). @return int[] */
    public function orphans(): array
    {
        if (! self::ready()) {
            return [];
        }

        return DB::table('departments')->where('is_active', 1)->pluck('id')->filter(fn ($id) => ! $this->hasFull((int) $id))->map(fn ($i) => (int) $i)->values()->all();
    }
}
