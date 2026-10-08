<?php

namespace App\Policies;

use App\Models\User;
use App\Services\Access\Authorizer;

/**
 * Who may manage whom comes from clearance, not from role names: a person may see and change people whose clearance is below their own (the owner:
 * everyone), if their roles hold users.manage. Roles built in the role builder fit in without any change here.
 */
class UserPolicy
{
    private function access(): Authorizer
    {
        return app(Authorizer::class);
    }

    /** Whether the actor may manage this account: they hold users.manage and the account is below their clearance. */
    private function manages(User $actor, User $target): bool
    {
        return $actor->hasPermission('users.manage') && $this->access()->canManage($actor, $target);
    }

    /** Anyone in the admin area may open the list; they only ever see people below their own clearance. */
    public function viewAny(User $user): bool
    {
        return $user->isStaff();
    }

    /** Your own record is always yours to see. */
    public function view(User $user, User $model): bool
    {
        return $user->is($model) || $this->manages($user, $model);
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('users.manage');
    }

    public function update(User $user, User $model): bool
    {
        return $this->manages($user, $model);
    }

    public function delete(User $user, User $model): bool
    {
        return $this->manages($user, $model);
    }

    public function restore(User $user, User $model): bool
    {
        return $this->manages($user, $model);
    }

    public function forceDelete(User $user, User $model): bool
    {
        return $user->hasPermission('users.purge');
    }

    public function manageAccount(User $user, User $model): bool
    {
        return $this->manages($user, $model);
    }

    /** May they give this role (by key)? Only roles below their own clearance, and only if they may manage accounts. */
    public function canAssignRole(User $user, string $role): bool
    {
        return $user->hasPermission('users.manage') && $this->access()->canAssignRoleKey($user, $role);
    }
}
