<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;

class EmployeePolicy
{
    /**
     * Determine whether the user can view any employees.
     */
    public function viewAny(User $user): bool
    {
        // Only admin, manager, and super_admin can view employees
        return in_array($user->role, ['super_admin', 'admin', 'manager']);
    }

    /**
     * Determine whether the user can view the employee.
     */
    public function view(User $user, Employee $employee = null): bool
    {
        // Admin, manager, and super_admin can view
        if (in_array($user->role, ['super_admin', 'admin', 'manager'])) {
            return true;
        }

        // Users can view their own employee record
        if ($employee && $user->id === $employee->user_id) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can create employees.
     */
    public function create(User $user): bool
    {
        // Only admin and super_admin can create employee records
        return in_array($user->role, ['super_admin', 'admin']);
    }

    /**
     * Determine whether the user can update the employee.
     */
    public function update(User $user, Employee $employee = null): bool
    {
        // Super admin can update any
        if ($user->isSuperAdmin()) {
            return true;
        }

        // Admin can update
        if ($user->role === 'admin') {
            return true;
        }

        // Managers can update their subordinates
        if ($user->role === 'manager') {
            // If we have an employee, check if it's their subordinate
            if ($employee) {
                $managerEmployee = Employee::where('user_id', $user->id)->first();
                if ($managerEmployee) {
                    return $employee->manager_id === $managerEmployee->id;
                }
            }
            return true; // Allow manager to update in general
        }

        // Users can update their own record (limited fields)
        if ($employee && $user->id === $employee->user_id) {
            return true;
        }

        return false;
    }

    /**
     * Determine whether the user can delete the employee.
     */
    public function delete(User $user, Employee $employee = null): bool
    {
        // Only admin and super_admin can delete
        return in_array($user->role, ['super_admin', 'admin']);
    }

    /**
     * Determine whether the user can restore the employee.
     */
    public function restore(User $user, Employee $employee = null): bool
    {
        // Only admin and super_admin can restore
        return in_array($user->role, ['super_admin', 'admin']);
    }

    /**
     * Determine whether the user can permanently delete the employee.
     */
    public function forceDelete(User $user, Employee $employee = null): bool
    {
        // Only super_admin can force delete
        return $user->isSuperAdmin();
    }

    /**
     * Determine whether the user can manage sensitive employee data
     * (salary, bank details, etc.)
     */
    public function manageSensitiveData(User $user): bool
    {
        // Only super_admin and admin can manage sensitive data
        return in_array($user->role, ['super_admin', 'admin']);
    }

    /**
     * Determine whether the user can manage employee status
     * (terminate, suspend, etc.)
     */
    public function manageStatus(User $user, Employee $employee = null): bool
    {
        // Super admin can manage any
        if ($user->isSuperAdmin()) {
            return true;
        }

        // Admin can manage
        if ($user->role === 'admin') {
            return true;
        }

        return false;
    }
}