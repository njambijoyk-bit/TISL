<?php

namespace App\Services\Hr;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Who may see and change which employee records (docs/HR_STAGE1_SPEC.md). `hr.view` sees everyone; `hr.team` sees the people below them in the
 * HR line (their reports, and their reports' reports); everyone sees their own record. Changing needs `hr.manage`, or `hr.team` for one's line.
 */
class EmployeeAccess
{
    /** @var array<int, int[]> */
    private array $lines = [];

    public function canList(User $u): bool
    {
        return $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || $u->hasPermission('hr.team');
    }

    public function canSee(User $u, Employee $e): bool
    {
        return $u->hasPermission('hr.view') || $u->hasPermission('hr.manage') || (int) $e->user_id === (int) $u->id
            || ($u->hasPermission('hr.team') && $this->isAbove($u, $e));
    }

    public function canChange(User $u, Employee $e): bool
    {
        return $u->hasPermission('hr.manage') || ($u->hasPermission('hr.team') && $this->isAbove($u, $e));
    }

    /** Only the records the person may see. */
    public function scope(Builder $q, User $u): Builder
    {
        if ($u->hasPermission('hr.view') || $u->hasPermission('hr.manage')) {
            return $q;
        }

        return $q->where(fn ($w) => $w->where('user_id', $u->id)->orWhereIn('id', $u->hasPermission('hr.team') ? ($this->lineOf($u) ?: [0]) : [0]));
    }

    /** Is this person somewhere below the user in the HR line? */
    public function isAbove(User $u, Employee $e): bool
    {
        return in_array((int) $e->id, $this->lineOf($u), true);
    }

    /** The employee ids below the user (reports, and their reports), however deep. @return int[] */
    public function lineOf(User $u): array
    {
        if (isset($this->lines[$u->id])) {
            return $this->lines[$u->id];
        }
        $me = Employee::where('user_id', $u->id)->value('id');
        $out = [];
        $frontier = $me ? [(int) $me] : [];
        while ($frontier && count($out) < 5000) {
            $next = Employee::whereIn('manager_id', $frontier)->pluck('id')->map(fn ($i) => (int) $i)->all();
            $next = array_values(array_diff($next, $out, [(int) $me]));   // a loop in the line stops here
            $out = array_merge($out, $next);
            $frontier = $next;
        }

        return $this->lines[$u->id] = $out;
    }
}
