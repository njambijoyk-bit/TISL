<?php

namespace App\Services\Access;

use App\Models\Access\AccessGrant;
use App\Models\Access\AccessLog;
use App\Models\Location;
use App\Models\User;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The authorization engine. One question: given this person, this action, this branch, this moment, may they?
 *
 * Roles say WHAT (permissions, modules, approvals, restrictions). Clearance is a ceiling on which roles a person may hold.
 * Scope and grants say WHERE and UNTIL WHEN. Everything else (routes, screens, reports) asks here.
 *
 * Before the access script has been run and seeded, the engine answers from the built-in catalogue and the old users.role column,
 * so the code can be deployed before the database and nothing changes.
 */
class Authorizer
{
    /** The role names the users.role column held before the access engine. */
    public const LEGACY_STAFF_ROLES = ['super_admin', 'admin', 'manager', 'finance', 'logistics', 'sales_rep', 'driver'];

    private static ?bool $ready = null;
    private array $memo = [];

    public function __construct(private LicenseManager $licenses) {}

    // ---------------------------------------------------------------- state

    /** Are the access tables there and loaded? */
    public static function ready(): bool
    {
        if (self::$ready !== null) {
            return self::$ready;
        }
        try {
            return self::$ready = Schema::hasTable('roles') && Schema::hasTable('user_roles') && DB::table('roles')->exists();
        } catch (\Throwable) {
            return self::$ready = false;
        }
    }

    /** Forget what was learned (after seeding, and in tests). */
    public static function reset(): void
    {
        self::$ready = null;
        app()->forgetInstance(self::class);
    }

    public function forget(?int $userId = null): void
    {
        $userId === null ? $this->memo = [] : array_walk($this->memo, function ($v, $k) use ($userId) {
            if (str_starts_with((string) $k, $userId . ':')) {
                unset($this->memo[$k]);
            }
        });
    }

    // ---------------------------------------------------------------- roles

    /**
     * The roles a person holds right now, as plain arrays. The primary role (users.role) always counts; extra roles count while in date,
     * active, and at or below the person's clearance.
     *
     * @return array<int, array>
     */
    public function roles(User $u, ?\DateTimeInterface $at = null): array
    {
        $at ??= now();
        $memoKey = $u->getKey() . ':roles:' . $at->format('YmdHi');
        if (isset($this->memo[$memoKey])) {
            return $this->memo[$memoKey];
        }

        $defs = $this->rawRoles($u, $at);
        $clearance = $this->clearanceOf($u, $defs);
        $defs = array_values(array_filter($defs, fn ($d) => $d['primary'] || $d['min_clearance'] <= $clearance));

        return $this->memo[$memoKey] = $defs;
    }

    /** Every role row in force, before the clearance ceiling is applied (remembered for the request). */
    private function rawRoles(User $u, \DateTimeInterface $at): array
    {
        $key = $u->getKey() . ':raw:' . $at->format('YmdHi');

        return $this->memo[$key] ??= (self::ready() ? $this->rolesFromDatabase($u, $at) : $this->rolesFromCatalog($u));
    }

    private function rolesFromCatalog(User $u): array
    {
        $role = Catalog::roles()[$u->role] ?? null;
        if (! $role) {
            return [];
        }

        return [[
            'id' => null, 'key' => $u->role, 'name' => $role['name'], 'kind' => $role['kind'], 'min_clearance' => $role['min_clearance'], 'scope_type' => $role['scope_type'],
            'data_scope' => $role['data_scope'], 'module' => $role['module'], 'acts_as' => $role['acts_as'], 'restrictions' => [], 'primary' => true, 'expires_at' => null,
            'permissions' => $role['permissions'] === '*' ? '*' : $role['permissions'], 'modules' => $role['modules'], 'approvals' => $role['approvals'],
        ]];
    }

    private function rolesFromDatabase(User $u, \DateTimeInterface $at): array
    {
        $rows = DB::table('user_roles as ur')->join('roles as r', 'r.id', '=', 'ur.role_id')
            ->where('ur.user_id', $u->getKey())->where('r.is_active', 1)
            ->get(['r.*', 'ur.is_primary as ur_primary', 'ur.starts_at', 'ur.expires_at'])
            ->filter(fn ($r) => (! $r->starts_at || $r->starts_at <= $at->format('Y-m-d H:i:s')) && (! $r->expires_at || $r->expires_at > $at->format('Y-m-d H:i:s')))
            ->keyBy('id');

        // the primary role is whatever users.role says, even for a person who has no row yet (created by older code)
        $primary = DB::table('roles')->where('key', $u->role)->where('is_active', 1)->first();
        if ($primary && ! $rows->has($primary->id)) {
            $primary->ur_primary = 1;
            $primary->starts_at = null;
            $primary->expires_at = null;
            $rows->put($primary->id, $primary);
        }
        if ($rows->isEmpty()) {
            return [];
        }

        $ids = $rows->keys()->all();
        $perms = DB::table('role_permissions')->whereIn('role_id', $ids)->get()->groupBy('role_id');
        $mods = DB::table('role_modules')->whereIn('role_id', $ids)->get()->groupBy('role_id');
        $apps = DB::table('role_approvals')->whereIn('role_id', $ids)->get()->groupBy('role_id');

        return $rows->map(function ($r) use ($u, $perms, $mods, $apps) {
            $primaryRow = (bool) $r->ur_primary || $r->key === $u->role;

            return [
                'id' => (int) $r->id, 'key' => $r->key, 'name' => $r->name, 'kind' => $r->kind, 'min_clearance' => (int) $r->min_clearance, 'scope_type' => $r->scope_type,
                'data_scope' => $r->data_scope, 'module' => $r->module_key, 'acts_as' => json_decode($r->acts_as ?? '[]', true) ?: [], 'restrictions' => json_decode($r->restrictions ?? '[]', true) ?: [],
                'primary' => $primaryRow, 'expires_at' => $r->expires_at,
                'permissions' => $r->key === 'super_admin' ? '*' : ($perms[$r->id] ?? collect())->pluck('permission_key')->all(),
                'modules' => ($mods[$r->id] ?? collect())->pluck('module_key')->all(),
                'approvals' => ($apps[$r->id] ?? collect())->mapWithKeys(fn ($a) => [$a->approval_key => $a->max_amount === null ? null : (float) $a->max_amount])->all(),
            ];
        })->values()->all();
    }

    /** Roles of the staff kind only: portal roles (customer, vendor, applicant) never hold permissions. */
    private function staffRoles(User $u): array
    {
        return array_values(array_filter($this->roles($u), fn ($d) => $d['kind'] === 'staff'));
    }

    /** The old role names this person satisfies: every role they hold, plus the names those roles still stand for. Used by the role: route check. */
    public function legacyKeys(User $u): array
    {
        $keys = [(string) $u->role];
        foreach ($this->roles($u) as $d) {
            $keys = array_merge($keys, [$d['key']], $d['acts_as']);
        }

        return array_values(array_unique($keys));
    }

    /** The keys of roles that still stand for any of these older role names (Senior accountant for Finance). */
    public function rolesActingAs(array $names): array
    {
        $found = [];
        if (self::ready()) {
            foreach (DB::table('roles')->whereNotNull('acts_as')->get(['key', 'acts_as']) as $r) {
                if (array_intersect(json_decode($r->acts_as, true) ?: [], $names)) {
                    $found[] = $r->key;
                }
            }

            return $found;
        }
        foreach (Catalog::roles() as $key => $r) {
            if (array_intersect($r['acts_as'], $names)) {
                $found[] = $key;
            }
        }

        return $found;
    }

    public function hasAnyRole(User $u, array $keys): bool
    {
        return (bool) array_intersect($this->legacyKeys($u), $keys);
    }

    // ------------------------------------------------------------ clearance

    /** A person's clearance level: the number on their record, or their primary role's lowest level if that is higher (so a person is never above or below their own primary role). */
    public function clearance(User $u): int
    {
        return $this->clearanceOf($u, $this->rawRoles($u, now()));
    }

    private function clearanceOf(User $u, array $defs): int
    {
        $own = (int) ($u->clearance_level ?? 0);
        $primary = collect($defs)->firstWhere('primary', true);

        return max($own, $primary ? ($primary['kind'] === 'staff' ? $primary['min_clearance'] : 0) : 0);
    }

    // ----------------------------------------------------------- permission

    /** May this person do this? $ctx: location_id, ip, at. */
    public function can(User $u, string $permission, array $ctx = []): Decision
    {
        if ($u->status === 'suspended' || (method_exists($u, 'isLocked') && $u->isLocked())) {
            return Decision::deny('inactive');
        }
        $meta = $this->permissionMeta($permission);
        if (! $meta) {
            return Decision::deny('unknown_permission');
        }
        [$module, $isWrite] = $meta;

        $first = 'no_permission';
        foreach ($this->staffRoles($u) as $d) {
            if ($d['permissions'] !== '*' && ! in_array($permission, $d['permissions'], true)) {
                continue;
            }
            $fail = $this->roleBlocks($d, $module, $isWrite, $ctx);
            if ($fail === null) {
                return $this->withinScope($u, $permission, $isWrite, $ctx, $d['key']);
            }
            $first = $fail;
        }

        return Decision::deny($first);
    }

    public function allows(User $u, string $permission, array $ctx = []): bool
    {
        return $this->can($u, $permission, $ctx)->allowed;
    }

    /** Why a role that holds the permission still cannot use it right now, or null if nothing blocks it. */
    private function roleBlocks(array $d, ?string $module, bool $isWrite, array $ctx): ?string
    {
        if ($module && ! in_array($module, ['core'], true)) {
            if (! $this->licenses->isActive($module)) {
                return 'module_off';
            }
            if (! in_array('*', $d['modules'], true) && ! in_array($module, $d['modules'], true)) {
                return 'no_module_access';
            }
        }
        $r = $d['restrictions'] ?? [];
        if (! empty($r['read_only']) && $isWrite) {
            return 'read_only';
        }
        if (! empty($r['hours']) && ! $this->inHours($r['hours'], $ctx['at'] ?? now())) {
            return 'outside_hours';
        }
        if (! empty($r['ip_allow']) && ! $this->ipAllowed($r['ip_allow'], $ctx['ip'] ?? request()?->ip())) {
            return 'ip_blocked';
        }

        return null;
    }

    private function withinScope(User $u, string $permission, bool $isWrite, array $ctx, string $roleKey): Decision
    {
        $loc = $ctx['location_id'] ?? null;
        $mode = config('access.scope_mode', 'log');
        if ($loc && $mode !== 'off' && ! $this->canAccessLocation($u, (int) $loc, $isWrite)) {
            if ($mode === 'on') {
                return Decision::deny('outside_scope');
            }
            // once an hour per person, permission and branch, so the log shows what would change without filling up
            if (\Illuminate\Support\Facades\Cache::add("access:would_deny:{$u->getKey()}:{$permission}:{$loc}", 1, 3600)) {
                AccessLog::record(null, $u->getKey(), 'would_deny', ['permission' => $permission, 'location_id' => (int) $loc, 'reason' => 'outside_scope']);
            }
        }

        return Decision::allow($roleKey);
    }

    private function permissionMeta(string $key): ?array
    {
        if (self::ready()) {
            $row = $this->memo['perm:' . $key] ??= (DB::table('permissions')->where('key', $key)->first(['module_key', 'is_write']) ?: false);

            return $row ? [$row->module_key, (bool) $row->is_write] : null;
        }
        $c = Catalog::PERMISSIONS[$key] ?? null;

        return $c ? [$c[0], $c[3]] : null;
    }

    private function inHours(array $h, $at): bool
    {
        $at = \Illuminate\Support\Carbon::instance($at instanceof \DateTimeInterface ? $at : now());
        if (! empty($h['days']) && ! in_array($at->dayOfWeekIso, array_map('intval', $h['days']), true)) {
            return false;
        }
        $from = $h['from'] ?? '00:00';
        $to = $h['to'] ?? '23:59';
        $now = $at->format('H:i');

        return $from <= $to ? ($now >= $from && $now <= $to) : ($now >= $from || $now <= $to);   // a shift that runs past midnight
    }

    private function ipAllowed(array $allow, ?string $ip): bool
    {
        if (! $ip) {
            return false;
        }
        foreach ($allow as $rule) {
            if (str_contains($rule, '/')) {
                [$net, $bits] = explode('/', $rule) + [1 => '32'];
                $mask = ~((1 << (32 - (int) $bits)) - 1) & 0xFFFFFFFF;
                if ((ip2long($ip) & $mask) === (ip2long($net) & $mask)) {
                    return true;
                }
            } elseif ($rule === $ip) {
                return true;
            }
        }

        return false;
    }

    // ---------------------------------------------------------------- scope

    /**
     * The branches a person may use now. `global` is true for anyone holding a global-scope role (never bound by branches).
     * Otherwise: their default branch plus every grant that is in force, with the level of access for each.
     *
     * @return array{global: bool, open: bool, locations: array<int, string>, default: ?int}
     */
    public function scope(User $u, ?\DateTimeInterface $at = null): array
    {
        $at ??= now();
        $memoKey = $u->getKey() . ':scope:' . $at->format('YmdHi');
        if (isset($this->memo[$memoKey])) {
            return $this->memo[$memoKey];
        }

        $staff = $this->staffRoles($u);
        if (collect($staff)->contains(fn ($d) => $d['scope_type'] === 'global')) {
            return $this->memo[$memoKey] = ['global' => true, 'open' => false, 'locations' => [], 'default' => $u->default_location_id ? (int) $u->default_location_id : null];
        }

        $locs = [];
        if ($u->default_location_id) {
            $locs[(int) $u->default_location_id] = 'full';
        }
        if (! self::ready() && Schema::hasTable('location_user')) {
            // not seeded yet: the branches already assigned (location_user) are still the person's branches
            foreach (DB::table('location_user')->where('user_id', $u->getKey())->pluck('location_id') as $id) {
                $locs[(int) $id] = 'full';
            }
        }
        if (self::ready() && Schema::hasTable('user_access_grants')) {
            foreach (AccessGrant::where('user_id', $u->getKey())->where('resource_type', 'location')->active()->get() as $g) {
                if ($g->current($at)) {
                    $locs[$g->resource_id] = ($locs[$g->resource_id] ?? null) === 'full' || $g->access === 'full' ? 'full' : 'view';
                }
            }
        }
        $open = ! $locs && (bool) config('access.unassigned_sees_all', true) && ! empty($staff);

        return $this->memo[$memoKey] = ['global' => false, 'open' => $open, 'locations' => $locs, 'default' => $u->default_location_id ? (int) $u->default_location_id : null];
    }

    /** Branch ids a person may use, or null for every branch. */
    public function locationIds(User $u): ?array
    {
        $s = $this->scope($u);

        return $s['global'] || $s['open'] ? null : array_keys($s['locations']);
    }

    /** May they use this branch? Writing needs "full" access; looking at it only needs any. */
    public function canAccessLocation(User $u, int $locationId, bool $forWriting = false): bool
    {
        $s = $this->scope($u);
        if ($s['global'] || $s['open']) {
            return true;
        }
        $level = $s['locations'][$locationId] ?? null;

        return $level !== null && (! $forWriting || $level === 'full');
    }

    // ------------------------------------------------- data scope, approvals

    /** Which records inside a branch: the widest of their roles. all > assigned > own. */
    public function dataScope(User $u): string
    {
        $order = ['own' => 0, 'assigned' => 1, 'all' => 2];
        $best = 'own';
        foreach ($this->staffRoles($u) as $d) {
            if (($order[$d['data_scope']] ?? 0) > $order[$best]) {
                $best = $d['data_scope'];
            }
        }

        return $best;
    }

    /** What they may approve and up to how much: false = not at all, null = no limit, a number = up to that amount (base currency). */
    public function approvalLimit(User $u, string $approval): bool|float|null
    {
        $found = false;
        foreach ($this->staffRoles($u) as $d) {
            if (array_key_exists($approval, $d['approvals'])) {
                $max = $d['approvals'][$approval];
                if ($max === null) {
                    return null;
                }
                $found = $found === false ? $max : max($found, $max);
            }
        }

        return $found;
    }

    public function mayApprove(User $u, string $approval, float $amount): bool
    {
        $limit = $this->approvalLimit($u, $approval);

        return $limit === null || ($limit !== false && $amount <= $limit + 0.00001);
    }

    /** A restriction value set on any of their roles (for example max_discount_percent): the loosest one wins. */
    public function restriction(User $u, string $key): mixed
    {
        $vals = [];
        foreach ($this->staffRoles($u) as $d) {
            if (isset($d['restrictions'][$key])) {
                $vals[] = $d['restrictions'][$key];
            }
        }

        return $vals ? (is_numeric($vals[0]) ? max($vals) : $vals[0]) : null;
    }

    // ------------------------------------------------------ who may manage whom

    /** May this person assign this role? Only roles strictly below their own clearance, except the owner, who may assign any. */
    public function canAssignRole(User $actor, int $roleMinClearance): bool
    {
        $mine = $this->clearance($actor);

        return $mine >= 6 || $roleMinClearance < $mine;
    }

    /** May they set or change this person (or give this clearance)? Only people and levels below their own, except the owner. */
    public function canManage(User $actor, User $target): bool
    {
        $mine = $this->clearance($actor);

        return $mine >= 6 || ($this->clearance($target) < $mine && $actor->getKey() !== $target->getKey());
    }

    /** The lowest clearance a role needs, by its key (null when there is no such role). */
    public function roleMinClearance(string $key): ?int
    {
        if (self::ready()) {
            $v = DB::table('roles')->where('key', $key)->value('min_clearance');

            return $v === null ? null : (int) $v;
        }
        $r = Catalog::roles()[$key] ?? null;

        return $r ? $r['min_clearance'] : null;
    }

    /** May they give the role with this key? A role that does not exist cannot be given. */
    public function canAssignRoleKey(User $actor, string $key): bool
    {
        $min = $this->roleMinClearance($key);

        return $min !== null && $this->canAssignRole($actor, $min);
    }

    /**
     * The staff roles a screen may offer when it makes or edits a person. Before the access script has been run the users.role column
     * still only holds the original values, so only those are offered.
     *
     * @return string[]
     */
    public function staffRoleKeys(): array
    {
        if (self::ready()) {
            return DB::table('roles')->where('kind', 'staff')->where('is_active', 1)->orderBy('sort_order')->pluck('key')->all();
        }

        return self::LEGACY_STAFF_ROLES;
    }

    public function canGiveClearance(User $actor, int $level): bool
    {
        $mine = $this->clearance($actor);

        return $mine >= 6 || $level < $mine;
    }

    // -------------------------------------------------------------- summary

    /** Everything about a person's access, for /me, the Users screen and support: what they can do, where, until when. */
    public function summary(User $u): array
    {
        $roles = $this->roles($u);
        $perms = [];
        foreach ($this->staffRoles($u) as $d) {
            $keys = $d['permissions'] === '*' ? array_keys($this->allPermissionMeta()) : $d['permissions'];
            foreach ($keys as $k) {
                $meta = $this->permissionMeta($k);
                if ($meta && $this->roleBlocks($d, $meta[0], $meta[1], []) === null) {
                    $perms[$k] = true;
                }
            }
        }
        $scope = $this->scope($u);
        $level = $this->clearance($u);

        return [
            'ready' => self::ready(),
            'clearance' => $level,
            'clearance_name' => $this->levelName($level),
            'roles' => array_map(fn ($d) => ['key' => $d['key'], 'name' => $d['name'], 'kind' => $d['kind'], 'primary' => $d['primary'], 'expires_at' => $d['expires_at']], $roles),
            'role_keys' => $this->legacyKeys($u),
            'permissions' => array_keys($perms),
            'data_scope' => $this->dataScope($u),
            'scope' => ['global' => $scope['global'], 'open' => $scope['open'], 'default_location_id' => $scope['default'], 'locations' => $scope['locations']],
        ];
    }

    private function allPermissionMeta(): array
    {
        if (self::ready()) {
            return $this->memo['allperms'] ??= DB::table('permissions')->get(['key', 'module_key', 'is_write'])->mapWithKeys(fn ($p) => [$p->key => [$p->module_key, (bool) $p->is_write]])->all();
        }

        return collect(Catalog::PERMISSIONS)->map(fn ($c) => [$c[0], $c[3]])->all();
    }

    public function levelName(int $level): string
    {
        if (self::ready() && Schema::hasTable('clearance_levels')) {
            $n = DB::table('clearance_levels')->where('level', $level)->value('name');
            if ($n) {
                return $n;
            }
        }

        return Catalog::LEVELS[$level][0] ?? "Level {$level}";
    }
}
