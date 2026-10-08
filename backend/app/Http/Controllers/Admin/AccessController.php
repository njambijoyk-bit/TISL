<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Access\AccessGrant;
use App\Models\Access\AccessLog;
use App\Models\Access\ClearanceLevel;
use App\Models\Access\Role;
use App\Models\Access\UserRole;
use App\Models\Location;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Access\Catalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Identity and access: the roles and permissions that exist, and who holds what, where and until when.
 * Reading needs access.view, giving people roles, clearance and branches needs access.manage, making roles needs access.roles.
 * Nobody can give a role, level or permission they do not themselves have: only people and levels below their own clearance are theirs to manage (the owner is above it).
 */
class AccessController extends Controller
{
    public function __construct(private Authorizer $access) {}

    /** Until the access script has been run and loaded, say so plainly instead of failing on missing tables. */
    public function callAction($method, $parameters)
    {
        if (! Authorizer::ready()) {
            return response()->json(['message' => 'Access is not set up yet. Run database/sql/98_access_engine.sql, then php artisan access:seed.', 'ready' => false], 409);
        }

        return parent::callAction($method, $parameters);
    }

    private function refuse(string $message, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }

    // ---------------------------------------------------------------- read

    /** Levels, roles with what they hold, the permission catalogue, modules, and what this person may do. */
    public function overview(Request $request): JsonResponse
    {
        $me = $request->user();
        $roles = Role::with(['rolePermissions', 'modules', 'approvals'])->orderBy('sort_order')->orderBy('name')->get()->map(fn (Role $r) => $this->roleRow($r));

        return response()->json([
            'ready' => true,
            'levels' => ClearanceLevel::orderBy('level')->get(['level', 'name', 'description']),
            'roles' => $roles,
            'permissions' => DB::table('permissions')->orderBy('group_name')->orderBy('sort_order')->get(['key', 'module_key', 'group_name', 'label', 'is_write']),
            'approvals' => Catalog::APPROVALS,
            'mine' => ['clearance' => $this->access->clearance($me), 'can_roles' => $this->access->allows($me, 'access.roles'), 'can_manage' => $this->access->allows($me, 'access.manage')],
            'scope_mode' => config('access.scope_mode'),
            'locations' => Location::orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Staff accounts for the People tab: who they are, their clearance, default branch and how many extra roles and branch grants they hold. */
    public function people(Request $request): JsonResponse
    {
        $me = $request->user();
        $mine = $this->access->clearance($me);
        $q = User::query()->staffAccounts()
            ->when($request->filled('q'), fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', '%' . $request->q . '%')->orWhere('email', 'like', '%' . $request->q . '%')))
            ->when($request->filled('role'), fn ($w) => $w->holding([(string) $request->role]))
            ->orderBy('name');
        $page = $q->paginate(min((int) $request->get('per_page', 25), 100), ['id', 'name', 'email', 'role', 'status', 'clearance_level', 'default_location_id']);
        $ids = collect($page->items())->pluck('id');
        $roleNames = Role::pluck('name', 'key');
        $locNames = Location::pluck('name', 'id');
        $extra = UserRole::whereIn('user_id', $ids)->where('is_primary', 0)->get()->filter(fn (UserRole $ur) => $ur->current())->groupBy('user_id')->map->count();
        $grants = AccessGrant::whereIn('user_id', $ids)->where('status', 'active')->get()->filter(fn (AccessGrant $g) => $g->current())->groupBy('user_id')->map->count();
        $page->getCollection()->transform(fn (User $u) => [
            'id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'status' => $u->status, 'role' => $u->role, 'role_name' => $roleNames[$u->role] ?? $u->role,
            'clearance_level' => (int) $u->clearance_level, 'default_location_id' => $u->default_location_id, 'default_location' => $locNames[$u->default_location_id] ?? null,
            'extra_roles' => (int) ($extra[$u->id] ?? 0), 'grants' => (int) ($grants[$u->id] ?? 0),
            'manageable' => $mine >= 6 || ((int) $u->clearance_level < $mine && $u->id !== $me->id),
        ]);

        return response()->json($page);
    }

    public function user(Request $request, int $id): JsonResponse
    {
        return response()->json($this->userDetail(User::findOrFail($id)));
    }

    public function log(Request $request): JsonResponse
    {
        $rows = AccessLog::query()
            ->when($request->filled('user_id'), fn ($q) => $q->where('subject_user_id', (int) $request->user_id))
            ->when($request->filled('action'), fn ($q) => $q->where('action', $request->action))
            ->orderByDesc('id')->paginate(min((int) $request->get('per_page', 30), 100));
        $names = User::whereIn('id', collect($rows->items())->flatMap(fn ($l) => [$l->actor_id, $l->subject_user_id])->filter()->unique())->pluck('name', 'id');
        $rows->getCollection()->transform(fn ($l) => ['id' => $l->id, 'action' => $l->action, 'actor' => $names[$l->actor_id] ?? null, 'subject' => $names[$l->subject_user_id] ?? null,
            'subject_user_id' => $l->subject_user_id, 'details' => $l->details, 'at' => (string) $l->created_at]);

        return response()->json($rows);
    }

    // --------------------------------------------------------- people: write

    /** PUT /users/{id}/clearance {level} */
    public function setClearance(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['level' => 'required|integer|min:0|max:6']);
        $target = User::findOrFail($id);
        if ($bad = $this->cannotManage($request->user(), $target)) {
            return $bad;
        }
        if (! $this->access->canGiveClearance($request->user(), (int) $d['level'])) {
            return $this->refuse('You can only give a clearance below your own.', 403);
        }
        $primary = Role::where('key', $target->role)->first();
        $floor = $primary && $primary->kind === 'staff' ? (int) $primary->min_clearance : 0;
        if ((int) $d['level'] < $floor) {
            return $this->refuse("Their main role ({$primary->name}) needs clearance {$floor} or more. Change their main role first.");
        }
        if ($stop = $this->lastOwnerStop($target, (int) $d['level'])) {
            return $stop;
        }
        $before = (int) $target->clearance_level;
        DB::table('users')->where('id', $target->id)->update(['clearance_level' => (int) $d['level']]);
        $this->done($request, $target, 'clearance_changed', ['from' => $before, 'to' => (int) $d['level']]);

        return response()->json(['message' => 'Clearance saved.'] + $this->userDetail($target->fresh()));
    }

    /** PUT /users/{id}/default-location {location_id|null} */
    public function setDefaultLocation(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['location_id' => 'nullable|integer|exists:locations,id']);
        $target = User::findOrFail($id);
        if ($bad = $this->cannotManage($request->user(), $target)) {
            return $bad;
        }
        $before = $target->default_location_id;
        DB::table('users')->where('id', $target->id)->update(['default_location_id' => $d['location_id'] ?? null]);
        $this->done($request, $target, 'default_location_changed', ['from' => $before, 'to' => $d['location_id'] ?? null]);

        return response()->json(['message' => 'Default branch saved.'] + $this->userDetail($target->fresh()));
    }

    /** PUT /users/{id}/primary-role {role_id}: the main role (it also stays in users.role). Clearance follows the role's level. */
    public function setPrimaryRole(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['role_id' => 'required|integer|exists:roles,id']);
        $target = User::findOrFail($id);
        $role = Role::findOrFail($d['role_id']);
        if ($bad = $this->cannotManage($request->user(), $target) ?? $this->cannotAssign($request->user(), $role)) {
            return $bad;
        }
        if ($stop = $this->lastOwnerStop($target, $role->key === 'super_admin' ? 6 : 0)) {
            return $stop;
        }
        $target->role = $role->key;
        $target->save();   // the access observer makes the role row and sets the clearance to the role's level
        $this->access->forget((int) $target->id);
        $this->done($request, $target, 'primary_role_changed', ['role' => $role->key]);

        return response()->json(['message' => 'Main role saved. Their clearance now matches it.'] + $this->userDetail($target->fresh()));
    }

    /** POST /users/{id}/roles {role_id, starts_at?, expires_at?} */
    public function addRole(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['role_id' => 'required|integer|exists:roles,id', 'starts_at' => 'nullable|date', 'expires_at' => 'nullable|date|after:starts_at']);
        $target = User::findOrFail($id);
        $role = Role::findOrFail($d['role_id']);
        if ($bad = $this->cannotManage($request->user(), $target) ?? $this->cannotAssign($request->user(), $role)) {
            return $bad;
        }
        if ($role->kind !== 'staff') {
            return $this->refuse('Customers, vendors and applicants are not given extra roles.');
        }
        if ($this->access->clearance($target) < (int) $role->min_clearance) {
            return $this->refuse("{$role->name} needs clearance {$role->min_clearance} or more. Raise their clearance first.");
        }
        UserRole::updateOrCreate(['user_id' => $target->id, 'role_id' => $role->id], ['is_primary' => $role->key === $target->role, 'starts_at' => $d['starts_at'] ?? null, 'expires_at' => $d['expires_at'] ?? null, 'assigned_by' => $request->user()->id]);
        $this->access->forget((int) $target->id);
        $this->done($request, $target, 'role_assigned', ['role' => $role->key, 'starts_at' => $d['starts_at'] ?? null, 'expires_at' => $d['expires_at'] ?? null]);

        return response()->json(['message' => "{$role->name} given."] + $this->userDetail($target->fresh()));
    }

    /** DELETE /users/{id}/roles/{roleId} */
    public function removeRole(Request $request, int $id, int $roleId): JsonResponse
    {
        $target = User::findOrFail($id);
        $role = Role::findOrFail($roleId);
        if ($bad = $this->cannotManage($request->user(), $target) ?? $this->cannotAssign($request->user(), $role)) {
            return $bad;
        }
        if ($role->key === $target->role) {
            return $this->refuse('That is their main role. Give them a different main role instead.');
        }
        UserRole::where('user_id', $target->id)->where('role_id', $role->id)->delete();
        $this->access->forget((int) $target->id);
        $this->done($request, $target, 'role_removed', ['role' => $role->key]);

        return response()->json(['message' => "{$role->name} taken away."] + $this->userDetail($target->fresh()));
    }

    /** POST /users/{id}/grants {resource_type, resource_id, access?, starts_at?, expires_at?, reason?} */
    public function addGrant(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'resource_type' => ['required', Rule::in(AccessGrant::TYPES)], 'resource_id' => 'required|integer', 'access' => ['nullable', Rule::in(['full', 'view'])],
            'starts_at' => 'nullable|date', 'expires_at' => 'nullable|date|after:starts_at', 'reason' => 'nullable|string|max:255',
        ]);
        $target = User::findOrFail($id);
        if ($bad = $this->cannotManage($request->user(), $target)) {
            return $bad;
        }
        if ($d['resource_type'] === 'location' && ! Location::whereKey($d['resource_id'])->exists()) {
            return $this->refuse('That branch does not exist.');
        }
        $g = AccessGrant::create(['user_id' => $target->id, 'resource_type' => $d['resource_type'], 'resource_id' => $d['resource_id'], 'access' => $d['access'] ?? 'full',
            'starts_at' => $d['starts_at'] ?? null, 'expires_at' => $d['expires_at'] ?? null, 'granted_by' => $request->user()->id, 'reason' => $d['reason'] ?? null, 'status' => 'active']);
        $this->access->forget((int) $target->id);
        $this->done($request, $target, 'grant_added', ['grant_id' => $g->id, 'resource' => $d['resource_type'] . ':' . $d['resource_id'], 'expires_at' => $d['expires_at'] ?? null, 'reason' => $d['reason'] ?? null]);

        return response()->json(['message' => 'Access given.'] + $this->userDetail($target->fresh()), 201);
    }

    /** DELETE /users/{id}/grants/{grantId} */
    public function revokeGrant(Request $request, int $id, int $grantId): JsonResponse
    {
        $target = User::findOrFail($id);
        if ($bad = $this->cannotManage($request->user(), $target)) {
            return $bad;
        }
        $g = AccessGrant::where('user_id', $target->id)->findOrFail($grantId);
        $g->update(['status' => 'revoked', 'revoked_by' => $request->user()->id, 'revoked_at' => now()]);
        $this->access->forget((int) $target->id);
        $this->done($request, $target, 'grant_revoked', ['grant_id' => $g->id, 'resource' => $g->resource_type . ':' . $g->resource_id]);

        return response()->json(['message' => 'Access taken away.'] + $this->userDetail($target->fresh()));
    }

    // -------------------------------------------------------------- roles

    /** POST /roles */
    public function createRole(Request $request): JsonResponse
    {
        $d = $this->validateRole($request);
        if ($bad = $this->roleLimits($request->user(), $d)) {
            return $bad;
        }
        $key = $this->freeKey($d['key'] ?? Str::slug($d['name'], '_'));
        $role = DB::transaction(function () use ($d, $key) {
            $role = Role::create(['key' => $key, 'name' => $d['name'], 'kind' => 'staff', 'min_clearance' => $d['min_clearance'], 'scope_type' => $d['scope_type'], 'data_scope' => $d['data_scope'],
                'module_key' => $d['module_key'] ?? null, 'restrictions' => $d['restrictions'] ?? null, 'description' => $d['description'] ?? null, 'is_system' => false, 'is_active' => true, 'sort_order' => 600]);
            $this->saveParts($role, $d);

            return $role;
        });
        AccessLog::record($request->user()->id, null, 'role_saved', ['role' => $role->key, 'created' => true]);

        return response()->json(['message' => 'Role made.', 'role' => $this->roleRow($role->fresh(['rolePermissions', 'modules', 'approvals']))], 201);
    }

    /** PUT /roles/{id}: a built-in role keeps its key and its place; the owner role cannot be changed. */
    public function updateRole(Request $request, int $id): JsonResponse
    {
        $role = Role::findOrFail($id);
        if ($role->holdsEverything()) {
            return $this->refuse('The owner role holds everything and cannot be changed.', 403);
        }
        if ($role->kind !== 'staff') {
            return $this->refuse('Customer, vendor and applicant roles are fixed. They only ever see their own things.', 403);
        }
        $d = $this->validateRole($request, $role);
        if ($bad = $this->roleLimits($request->user(), $d, $role)) {
            return $bad;
        }
        DB::transaction(function () use ($role, $d) {
            $role->update(['name' => $d['name'], 'min_clearance' => $d['min_clearance'], 'scope_type' => $d['scope_type'], 'data_scope' => $d['data_scope'], 'module_key' => $d['module_key'] ?? null,
                'restrictions' => $d['restrictions'] ?? null, 'description' => $d['description'] ?? null, 'is_active' => $d['is_active'] ?? $role->is_active]);
            $this->saveParts($role, $d);
        });
        $this->access->forget();
        AccessLog::record($request->user()->id, null, 'role_saved', ['role' => $role->key]);

        return response()->json(['message' => 'Role saved.', 'role' => $this->roleRow($role->fresh(['rolePermissions', 'modules', 'approvals']))]);
    }

    public function deleteRole(Request $request, int $id): JsonResponse
    {
        $role = Role::findOrFail($id);
        if ($role->is_system) {
            return $this->refuse('A built-in role cannot be deleted. Switch it off instead.', 403);
        }
        if ($role->min_clearance >= $this->access->clearance($request->user()) && $this->access->clearance($request->user()) < 6) {
            return $this->refuse('That role is above your clearance.', 403);
        }
        $n = UserRole::where('role_id', $role->id)->pluck('user_id')->merge(User::where('role', $role->key)->pluck('id'))->unique()->count();
        if ($n > 0) {
            return $this->refuse("{$n} " . ($n === 1 ? 'person holds' : 'people hold') . ' this role. Take it from them first.');
        }
        $role->delete();
        AccessLog::record($request->user()->id, null, 'role_deleted', ['role' => $role->key]);

        return response()->json(['message' => 'Role deleted.']);
    }

    /** PUT /levels/{level} {name, description?}: rename a clearance level. */
    public function renameLevel(Request $request, int $level): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:60', 'description' => 'nullable|string|max:255']);
        $row = ClearanceLevel::where('level', $level)->firstOrFail();
        $row->update($d);
        AccessLog::record($request->user()->id, null, 'level_renamed', ['level' => $level, 'name' => $d['name']]);

        return response()->json(['message' => 'Saved.', 'level' => $row]);
    }

    // ------------------------------------------------------------- helpers

    private function validateRole(Request $request, ?Role $role = null): array
    {
        $d = $request->validate([
            'name' => 'required|string|max:100', 'key' => 'nullable|string|max:60|regex:/^[a-z0-9_]+$/', 'min_clearance' => 'required|integer|min:1|max:6',
            'scope_type' => ['required', Rule::in(['global', 'assigned'])], 'data_scope' => ['required', Rule::in(Role::DATA_SCOPES)], 'module_key' => 'nullable|string|max:40', 'description' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
            'permissions' => 'array', 'permissions.*' => 'string|exists:permissions,key',
            'modules' => 'array', 'modules.*' => 'string|max:40',
            'approvals' => 'array', 'approvals.*.key' => ['required', Rule::in(array_keys(Catalog::APPROVALS))], 'approvals.*.max_amount' => 'nullable|numeric|min:0',
            'restrictions' => 'nullable|array', 'restrictions.read_only' => 'nullable|boolean', 'restrictions.max_discount_percent' => 'nullable|numeric|min:0|max:100',
            'restrictions.hours' => 'nullable|array', 'restrictions.hours.from' => 'nullable|date_format:H:i', 'restrictions.hours.to' => 'nullable|date_format:H:i',
            'restrictions.hours.days' => 'nullable|array', 'restrictions.hours.days.*' => 'integer|between:1,7',
            'restrictions.ip_allow' => 'nullable|array', 'restrictions.ip_allow.*' => ['string', 'regex:/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/'],
        ]);
        $d['restrictions'] = array_filter($d['restrictions'] ?? [], fn ($v) => $v !== null && $v !== [] && $v !== false) ?: null;

        return $d;
    }

    /** A role maker can only make roles below their own clearance, with permissions they hold themselves. */
    private function roleLimits(User $me, array $d, ?Role $existing = null): ?JsonResponse
    {
        $mine = $this->access->clearance($me);
        if ($mine < 6) {
            if ((int) $d['min_clearance'] >= $mine || ($existing && (int) $existing->min_clearance >= $mine)) {
                return $this->refuse('You can only make or change roles below your own clearance.', 403);
            }
            foreach ($d['permissions'] ?? [] as $p) {
                if (! $this->access->allows($me, $p)) {
                    return $this->refuse("You cannot give a permission you do not hold yourself ({$p}).", 403);
                }
            }
        }

        return null;
    }

    private function saveParts(Role $role, array $d): void
    {
        DB::table('role_permissions')->where('role_id', $role->id)->delete();
        foreach (array_unique($d['permissions'] ?? []) as $p) {
            DB::table('role_permissions')->insert(['role_id' => $role->id, 'permission_key' => $p]);
        }
        DB::table('role_modules')->where('role_id', $role->id)->delete();
        foreach (array_unique($d['modules'] ?? []) as $m) {
            DB::table('role_modules')->insert(['role_id' => $role->id, 'module_key' => $m]);
        }
        DB::table('role_approvals')->where('role_id', $role->id)->delete();
        foreach ($d['approvals'] ?? [] as $a) {
            DB::table('role_approvals')->updateOrInsert(['role_id' => $role->id, 'approval_key' => $a['key']], ['max_amount' => $a['max_amount'] ?? null]);
        }
    }

    private function freeKey(string $base): string
    {
        $base = $base !== '' ? $base : 'role';
        $key = $base;
        for ($n = 2; Role::where('key', $key)->exists(); $n++) {
            $key = "{$base}_{$n}";
        }

        return $key;
    }

    private function roleRow(Role $r): array
    {
        return ['id' => $r->id, 'key' => $r->key, 'name' => $r->name, 'kind' => $r->kind, 'min_clearance' => (int) $r->min_clearance, 'scope_type' => $r->scope_type, 'data_scope' => $r->data_scope,
            'module_key' => $r->module_key, 'acts_as' => $r->acts_as ?? [], 'restrictions' => $r->restrictions ?? (object) [], 'description' => $r->description, 'is_system' => (bool) $r->is_system, 'is_active' => (bool) $r->is_active,
            'permissions' => $r->holdsEverything() ? DB::table('permissions')->pluck('key')->all() : $r->rolePermissions->pluck('permission_key')->values()->all(),
            'modules' => $r->modules->pluck('module_key')->values()->all(),
            'approvals' => $r->approvals->map(fn ($a) => ['key' => $a->approval_key, 'max_amount' => $a->max_amount])->values()->all(),
            'people' => UserRole::where('role_id', $r->id)->count()];
    }

    private function userDetail(User $u): array
    {
        $this->access->forget((int) $u->id);
        $roles = UserRole::with('role:id,key,name,min_clearance,kind')->where('user_id', $u->id)->get()->map(fn (UserRole $ur) => ['role_id' => $ur->role_id, 'key' => $ur->role?->key, 'name' => $ur->role?->name,
            'primary' => (bool) $ur->is_primary || $ur->role?->key === $u->role, 'starts_at' => $ur->starts_at?->toIso8601String(), 'expires_at' => $ur->expires_at?->toIso8601String(), 'in_force' => $ur->current()])->values();
        $names = Location::pluck('name', 'id');
        $grants = AccessGrant::where('user_id', $u->id)->orderByDesc('id')->get()->map(fn (AccessGrant $g) => ['id' => $g->id, 'resource_type' => $g->resource_type, 'resource_id' => $g->resource_id,
            'name' => $names[$g->resource_id] ?? null, 'access' => $g->access, 'starts_at' => $g->starts_at?->toIso8601String(), 'expires_at' => $g->expires_at?->toIso8601String(), 'reason' => $g->reason,
            'status' => $g->status, 'in_force' => $g->current()])->values();

        return ['user' => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role, 'clearance_level' => (int) $u->clearance_level, 'default_location_id' => $u->default_location_id],
            'roles' => $roles, 'grants' => $grants, 'effective' => $this->access->summary($u),
            'manageable' => ($actor = request()->user()) ? $this->access->canManage($actor, $u) : false];
    }

    private function cannotManage(User $actor, User $target): ?JsonResponse
    {
        return $this->access->canManage($actor, $target) ? null : $this->refuse('You can only manage people with a lower clearance than yours.', 403);
    }

    private function cannotAssign(User $actor, Role $role): ?JsonResponse
    {
        return $this->access->canAssignRole($actor, (int) $role->min_clearance) ? null : $this->refuse("You can only give or take roles below your own clearance ({$role->name} is not).", 403);
    }

    /** The system must always keep an owner: the last person at clearance 6 cannot be lowered or have the owner role taken away. */
    private function lastOwnerStop(User $target, int $newLevel): ?JsonResponse
    {
        if ($this->access->clearance($target) >= 6 && $newLevel < 6 && User::where('clearance_level', '>=', 6)->where('id', '!=', $target->id)->doesntExist()) {
            return $this->refuse('This is the only owner. Make someone else an owner first.');
        }

        return null;
    }

    private function done(Request $request, User $target, string $action, array $details): void
    {
        $this->access->forget((int) $target->id);
        AccessLog::record($request->user()->id, (int) $target->id, $action, $details);
    }
}
