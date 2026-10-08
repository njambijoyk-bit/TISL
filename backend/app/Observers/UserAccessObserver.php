<?php

namespace App\Observers;

use App\Models\User;
use App\Services\Access\Authorizer;
use Illuminate\Support\Facades\DB;

/**
 * Keeps the access tables in step with the old users.role column, so users made or changed by any older screen or import still
 * get a primary role row and the clearance that role needs. (Changing a person's role also resets their clearance to that role's level.)
 */
class UserAccessObserver
{
    public function saved(User $user): void
    {
        if (! ($user->wasRecentlyCreated || $user->wasChanged('role')) || ! Authorizer::ready()) {
            return;
        }
        try {
            $role = DB::table('roles')->where('key', $user->role)->first();
            if (! $role) {
                return;   // an unknown role name: the seeder turns it into a role the next time it runs
            }
            DB::transaction(function () use ($user, $role) {
                DB::table('user_roles')->where('user_id', $user->id)->where('is_primary', 1)->where('role_id', '!=', $role->id)->delete();
                DB::table('user_roles')->updateOrInsert(['user_id' => $user->id, 'role_id' => $role->id], ['is_primary' => 1, 'updated_at' => now(), 'created_at' => now()]);
                DB::table('users')->where('id', $user->id)->update(['clearance_level' => $role->kind === 'staff' ? (int) $role->min_clearance : 0]);
            });
            app(Authorizer::class)->forget((int) $user->id);
        } catch (\Throwable) {
            // never stop a user being saved because of the access tables
        }
    }
}
