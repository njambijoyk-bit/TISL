<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;

/**
 * Employee records. Who may see, change, delete or purge them comes from the permissions hr.view, hr.manage, hr.team and hr.purge;
 * anyone may see their own record and change a few fields of it (the controller limits which).
 */
class EmployeePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('hr.view');
    }

    public function view(User $user, Employee $employee = null): bool
    {
        return $user->hasPermission('hr.view') || ($employee && $user->id === $employee->user_id);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function update(User $user, Employee $employee = null): bool
    {
        if ($user->hasPermission('hr.manage')) {
            return true;
        }

        // someone who edits their team's records: their own reports (or, with no record named, in general)
        if ($user->hasPermission('hr.team')) {
            if ($employee) {
                $mine = Employee::where('user_id', $user->id)->first();
                if ($mine) {
                    return $employee->manager_id === $mine->id;
                }
            }

            return true;
        }

        // anyone may update their own record (limited fields)
        return (bool) ($employee && $user->id === $employee->user_id);
    }

    public function delete(User $user, Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function restore(User $user, Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function forceDelete(User $user, Employee $employee = null): bool
    {
        return $user->hasPermission('hr.purge');
    }

    /** Salary, bank, ID numbers and the like. */
    public function manageSensitiveData(User $user): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function manageStatus(User $user, Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }
}
