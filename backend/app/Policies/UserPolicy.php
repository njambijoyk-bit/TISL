<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    /**
     * Hierarchy: lower number = higher authority.
     * vendor sits below customer — they have portal access but zero admin authority.
     */
    private static array $hierarchy = [
        'super_admin' => 1,
        'admin'       => 2,
        'manager'     => 3,
        'sales_rep'   => 4,
        'customer'    => 5,
        'vendor'      => 6,  // ← added
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
        return $this->outranks($user, $model);
    }

    public function create(User $user): bool
    {
        return in_array($user->role, ['super_admin', 'admin', 'manager']);
    }

    public function update(User $user, User $model): bool
    {
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
        return self::level($user->role) < self::level($role);
    }
}