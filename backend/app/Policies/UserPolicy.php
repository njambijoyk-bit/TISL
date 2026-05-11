<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    /**
     * Hierarchy: lower number = higher authority.
     *
     * finance   — operational, payment/reporting authority, no user management
     * logistics — operational, delivery authority, no user management
     * driver    — like vendor, portal access only, zero admin authority
     */
    private static array $hierarchy = [
        'super_admin' => 1,
        'admin'       => 2,
        'manager'     => 3,
        'finance'     => 4,
        'logistics'   => 5,
        'sales_rep'   => 6,
        'customer'    => 7,
        'vendor'      => 8,
        'driver'      => 9,
    ];

    public static function level(string $role): int
    {
        return self::$hierarchy[$role] ?? 99;
    }

    private function outranks(User $actor, User $target): bool
    {
        return self::level($actor->role) < self::level($target->role);
    }

    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, User $model): bool
    {
        // finance and logistics can view their own profile only
        // not other users — they have no user management authority
        if (in_array($user->role, ['finance', 'logistics'])) {
            return $user->id === $model->id;
        }

        return $this->outranks($user, $model);
    }

    public function create(User $user): bool
    {
        // finance and logistics cannot create users
        return in_array($user->role, ['super_admin', 'admin', 'manager']);
    }

    public function update(User $user, User $model): bool
    {
        // finance and logistics can only update themselves
        if (in_array($user->role, ['finance', 'logistics'])) {
            return $user->id === $model->id;
        }

        return $this->outranks($user, $model);
    }

    public function delete(User $user, User $model): bool
    {
        return $this->outranks($user, $model);
    }

    public function restore(User $user, User $model): bool
    {
        return $this->outranks($user, $model);
    }

    public function forceDelete(User $user, User $model): bool
    {
        return $user->isSuperAdmin();
    }

    public function manageAccount(User $user, User $model): bool
    {
        return $this->outranks($user, $model);
    }

    public function canAssignRole(User $user, string $role): bool
    {
        // finance, logistics, driver cannot assign any roles
        if (in_array($user->role, ['finance', 'logistics', 'driver'])) {
            return false;
        }

        return self::level($user->role) < self::level($role);
    }
}