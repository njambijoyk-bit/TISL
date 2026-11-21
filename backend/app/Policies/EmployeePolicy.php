<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;
use App\Services\Hr\EmployeeAccess;

/**
 * Employee records (docs/HR_STAGE1_SPEC.md). Seeing: `hr.view` everyone, `hr.team` the people below them in the HR line, anyone their own record.
 * Changing: `hr.manage`, or `hr.team` for their line. Deleting and restoring: `hr.manage`; deleting for good: `hr.purge`. A person does not change
 * their own record here (My HR, HR stage 8).
 */
class EmployeePolicy
{
    public function viewAny(User $user): bool
    {
        return app(EmployeeAccess::class)->canList($user);
    }

    public function view(User $user, ?Employee $employee = null): bool
    {
        return $employee ? app(EmployeeAccess::class)->canSee($user, $employee) : app(EmployeeAccess::class)->canList($user);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function update(User $user, ?Employee $employee = null): bool
    {
        return $employee ? app(EmployeeAccess::class)->canChange($user, $employee) : ($user->hasPermission('hr.manage') || $user->hasPermission('hr.team'));
    }

    public function delete(User $user, ?Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function restore(User $user, ?Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }

    public function forceDelete(User $user, ?Employee $employee = null): bool
    {
        return $user->hasPermission('hr.purge');
    }

    /** Pay, bank and identity details (HR stage 1): see and change them. */
    public function manageSensitiveData(User $user): bool
    {
        return $user->hasPermission('hr.sensitive') && $user->hasPermission('hr.manage');
    }

    public function manageStatus(User $user, ?Employee $employee = null): bool
    {
        return $user->hasPermission('hr.manage');
    }
}
