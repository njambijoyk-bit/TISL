<?php

namespace App\Services\Notify;

use App\Models\User;
use Illuminate\Support\Collection;

/** The staff who hold a permission, for messages meant for "whoever does this job" (never a role name). */
class Staff
{
    /** @return Collection<int, User> */
    public function holding(string $permission): Collection
    {
        return User::withPermission($permission)->get();
    }
}
