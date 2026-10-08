<?php

namespace App\Services\Access;

use App\Models\Access\AccessGrant;
use App\Models\Access\AccessLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Loads the built-in catalogue into the database and gives every existing person their role, clearance and branch access.
 * Safe to run again: it only adds what is missing and never takes back a change an admin has made.
 */
class AccessSetup
{
    /** @return array<string, int> what it did */
    public static function run(): array
    {
        foreach (['clearance_levels', 'roles', 'permissions', 'role_permissions', 'role_modules', 'role_approvals', 'user_roles', 'user_access_grants', 'access_meta'] as $t) {
            if (! Schema::hasTable($t)) {
                throw new \RuntimeException("The table {$t} is missing. Run database/sql/98_access_engine.sql first.");
            }
        }
        $done = ['levels' => 0, 'permissions' => 0, 'roles' => 0, 'users' => 0, 'grants' => 0, 'unknown_roles' => 0, 'new_grants' => 0];
        $now = now();
        $stored = (int) DB::table('access_meta')->where('id', 1)->value('catalog_version');

        DB::transaction(function () use (&$done, $now, $stored) {
            foreach (Catalog::LEVELS as $level => [$name, $desc]) {
                if (! DB::table('clearance_levels')->where('level', $level)->exists()) {
                    DB::table('clearance_levels')->insert(['level' => $level, 'name' => $name, 'description' => $desc, 'created_at' => $now, 'updated_at' => $now]);
                    $done['levels']++;
                }
            }

            $sort = 0;
            foreach (Catalog::PERMISSIONS as $key => [$module, $group, $label, $write]) {
                $row = ['module_key' => $module, 'group_name' => $group, 'label' => $label, 'is_write' => $write ? 1 : 0, 'sort_order' => ++$sort, 'updated_at' => $now];
                if (DB::table('permissions')->where('key', $key)->exists()) {
                    DB::table('permissions')->where('key', $key)->update($row);
                } else {
                    DB::table('permissions')->insert(['key' => $key, 'created_at' => $now] + $row);
                    $done['permissions']++;
                }
            }

            foreach (Catalog::roles() as $key => $r) {
                $existing = DB::table('roles')->where('key', $key)->first();
                if (! $existing) {
                    $id = DB::table('roles')->insertGetId([
                        'key' => $key, 'name' => $r['name'], 'kind' => $r['kind'], 'min_clearance' => $r['min_clearance'], 'scope_type' => $r['scope_type'], 'data_scope' => $r['data_scope'],
                        'module_key' => $r['module'], 'acts_as' => json_encode($r['acts_as']), 'description' => $r['description'], 'is_system' => 1, 'is_active' => 1, 'sort_order' => $r['sort'],
                        'created_at' => $now, 'updated_at' => $now,
                    ]);
                    $perms = $r['permissions'] === '*' ? array_keys(Catalog::PERMISSIONS) : $r['permissions'];
                    foreach ($perms as $p) {
                        DB::table('role_permissions')->insert(['role_id' => $id, 'permission_key' => $p]);
                    }
                    foreach ($r['modules'] as $m) {
                        DB::table('role_modules')->insert(['role_id' => $id, 'module_key' => $m]);
                    }
                    foreach ($r['approvals'] as $a => $max) {
                        DB::table('role_approvals')->insert(['role_id' => $id, 'approval_key' => $a, 'max_amount' => $max]);
                    }
                    $done['roles']++;
                } elseif ($key === 'super_admin') {
                    // the owner always holds every permission there is
                    foreach (array_keys(Catalog::PERMISSIONS) as $p) {
                        DB::table('role_permissions')->updateOrInsert(['role_id' => $existing->id, 'permission_key' => $p], []);
                    }
                } elseif ($existing->is_system) {
                    // a permission added since the last load goes to the built-in roles that hold it by default, once; older ones are left as the admin set them
                    $perms = $r['permissions'] === '*' ? array_keys(Catalog::PERMISSIONS) : $r['permissions'];
                    foreach ($perms as $p) {
                        if (Catalog::since($p) > $stored && ! DB::table('role_permissions')->where('role_id', $existing->id)->where('permission_key', $p)->exists()) {
                            DB::table('role_permissions')->insert(['role_id' => $existing->id, 'permission_key' => $p]);
                            $done['new_grants']++;
                        }
                    }
                }
            }

            if ($stored < 3) {
                self::carryOverStockRoles($done);
            }

            DB::table('access_meta')->updateOrInsert(['id' => 1], ['catalog_version' => Catalog::VERSION, 'seeded_at' => $now]);
        });

        Authorizer::reset();
        self::people($done);
        Authorizer::reset();

        return $done;
    }

    /**
     * The stock settings used to keep two lists of role names (who may sell expired stock, who gets the expiry warnings). Those are permissions now:
     * whatever roles were listed hold them, and the built-in roles that held them by default but were taken off the list no longer do.
     */
    private static function carryOverStockRoles(array &$done): void
    {
        if (! Schema::hasTable('stock_settings') || ! Schema::hasColumn('stock_settings', 'override_roles')) {
            return;
        }
        $row = DB::table('stock_settings')->first();
        if (! $row) {
            return;
        }
        foreach (['override_roles' => 'stock.override_expiry', 'notify_roles' => 'stock.expiry_alerts'] as $column => $permission) {
            if (! property_exists($row, $column) || $row->{$column} === null) {
                continue;
            }
            $wanted = json_decode((string) $row->{$column}, true);
            if (! is_array($wanted)) {
                continue;
            }
            foreach (DB::table('roles')->where('kind', 'staff')->get(['id', 'key']) as $role) {
                $has = DB::table('role_permissions')->where('role_id', $role->id)->where('permission_key', $permission)->exists();
                $want = in_array($role->key, $wanted, true);
                if ($want && ! $has) {
                    DB::table('role_permissions')->insert(['role_id' => $role->id, 'permission_key' => $permission]);
                    $done['new_grants']++;
                } elseif (! $want && $has && $role->key !== 'super_admin') {
                    DB::table('role_permissions')->where('role_id', $role->id)->where('permission_key', $permission)->delete();
                }
            }
        }
    }

    /** Every user gets a primary role row and a clearance; each branch assignment becomes a permanent grant. */
    private static function people(array &$done): void
    {
        $roles = DB::table('roles')->get()->keyBy('key');
        $hasLocationUser = Schema::hasTable('location_user');
        $now = now();

        User::query()->orderBy('id')->chunkById(200, function ($users) use (&$done, &$roles, $hasLocationUser, $now) {
            foreach ($users as $u) {
                $role = $roles[$u->role] ?? null;
                if (! $role) {   // a role name the catalogue does not know: keep it as an empty staff role so nobody loses anything silently
                    $id = DB::table('roles')->insertGetId(['key' => $u->role, 'name' => ucwords(str_replace('_', ' ', (string) $u->role)), 'kind' => 'staff', 'min_clearance' => 1, 'scope_type' => 'assigned',
                        'data_scope' => 'all', 'description' => 'Found on existing users. It holds no permissions yet.', 'is_system' => 0, 'is_active' => 1, 'sort_order' => 500, 'created_at' => $now, 'updated_at' => $now]);
                    DB::table('role_modules')->insert(['role_id' => $id, 'module_key' => '*']);
                    $role = DB::table('roles')->find($id);
                    $roles[$u->role] = $role;
                    $done['unknown_roles']++;
                }
                if (! DB::table('user_roles')->where('user_id', $u->id)->where('role_id', $role->id)->exists()) {
                    DB::table('user_roles')->insert(['user_id' => $u->id, 'role_id' => $role->id, 'is_primary' => 1, 'created_at' => $now, 'updated_at' => $now]);
                }
                $level = $role->kind === 'staff' ? (int) $role->min_clearance : 0;
                if ((int) $u->clearance_level < $level) {
                    DB::table('users')->where('id', $u->id)->update(['clearance_level' => $level]);
                }
                $done['users']++;

                // branch assignments become permanent grants (not for global roles: nothing binds them)
                if ($hasLocationUser && $role->kind === 'staff' && $role->scope_type !== 'global') {
                    $first = null;
                    foreach (DB::table('location_user')->where('user_id', $u->id)->orderBy('location_id')->pluck('location_id') as $loc) {
                        $first ??= $loc;
                        $has = AccessGrant::where('user_id', $u->id)->where('resource_type', 'location')->where('resource_id', $loc)->exists();
                        if (! $has) {
                            AccessGrant::create(['user_id' => $u->id, 'resource_type' => 'location', 'resource_id' => $loc, 'access' => 'full', 'reason' => 'Moved from the earlier branch assignment', 'status' => 'active']);
                            $done['grants']++;
                        }
                    }
                    if ($first && ! $u->default_location_id) {
                        DB::table('users')->where('id', $u->id)->update(['default_location_id' => $first]);
                    }
                }
            }
        });
    }
}
