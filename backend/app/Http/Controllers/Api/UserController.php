<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Vendor;                       
use App\Services\Access\Authorizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    private function access(): Authorizer
    {
        return app(Authorizer::class);
    }

    /** The roles this screen may name when it makes or edits an account: the staff roles in the roles table, and the portal accounts it can build a profile for (customers and vendors; job applicants register themselves). */
    private function giveableRoleKeys(): array
    {
        $az = $this->access();

        return array_merge($az->staffRoleKeys(), $az->portalRoleKeys('customer'), $az->portalRoleKeys('vendor'));
    }

    /** `$current` is the role the account already has: sending it back unchanged is always fine. */
    private function roleRule(?string $current = null): array
    {
        return ['sometimes', Rule::in(array_filter(array_merge($this->giveableRoleKeys(), [$current])))];
    }

    /** Role keys of the staff accounts that have an employee record: every staff role, drivers included, but not the owner level. */
    private function employeeRoleKeys(): array
    {
        return array_values(array_diff($this->access()->staffRoleKeys(), $this->access()->roleKeysAtOrAbove(6)));
    }

    /** Role keys of the staff who are not drivers (the Staff tab). */
    private function officeRoleKeys(): array
    {
        return array_values(array_diff($this->access()->staffRoleKeys(), $this->access()->driverRoleKeys()));
    }

    /** What an account needs besides the login: a customer, a vendor or an employee record; drivers and other portal accounts need none. */
    private function profileOf(User $u): string
    {
        return match (true) {
            $u->isCustomer() => 'customer',
            $u->isVendor() => 'vendor',
            $u->isPortal() => 'none',
            $u->isDriver() => 'driver',
            default => 'employee',
        };
    }

    /** What the Users screen needs besides the record: the role's name, whether it is a staff or portal role, the clearance, and whether the viewer may manage the person. */
    private function decorate(User $u, User $actor, array $info, int $mine, bool $mayManage): User
    {
        $r = $info[$u->role] ?? null;
        $level = max((int) $u->clearance_level, $r && $r['kind'] === 'staff' ? $r['min_clearance'] : 0);
        $u->setAttribute('role_name', $r['name'] ?? $u->role);
        $u->setAttribute('role_kind', $r['kind'] ?? 'staff');
        $u->setAttribute('clearance', $level);
        // the same rule as canManage(), worked out from the numbers already at hand so a long list costs no extra queries
        $u->setAttribute('manageable', $mayManage && ($mine >= 6 || ($level < $mine && $u->getKey() !== $actor->getKey())));

        return $u;
    }

    /** A user as the screens want it (see decorate()), for responses that return one record. */
    private function present(User $u, Request $request): User
    {
        $actor = $request->user();

        return $this->decorate($u, $actor, $this->access()->roleInfo(), $this->access()->clearance($actor), $actor->hasPermission('users.manage'));
    }

    /** The roles the Users screens offer: every staff role (for the filter), and the ones the viewer may give when making or editing someone. */
    public function roles(Request $request)
    {
        $this->authorize('viewAny', User::class);
        $az = $this->access();
        $actor = $request->user();
        $info = $az->roleInfo();
        $row = fn ($k) => ['key' => $k, 'name' => $info[$k]['name'] ?? $k, 'kind' => $info[$k]['kind'] ?? 'staff', 'min_clearance' => $info[$k]['min_clearance'] ?? 0];
        $mayGive = $actor->hasPermission('users.manage');

        return response()->json([
            'staff' => array_map($row, $az->staffRoleKeys()),
            'assignable' => $mayGive ? array_values(array_filter(array_map($row, $this->giveableRoleKeys()), fn ($r) => $az->canAssignRoleKey($actor, $r['key']))) : [],
            'levels' => collect(range(0, 6))->mapWithKeys(fn ($l) => [$l => $az->levelName($l)]),
        ]);
    }

    public function index(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $actor  = $request->user();
        $trashed = $request->boolean('trashed');

        $query = User::withTrashed()->when(!$trashed, fn($q) => $q->whereNull('deleted_at'));
        // only people below the viewer's clearance (the owner sees everyone)
        $this->access()->manageableUsers($query, $actor);

        // ── Tab filtering ─────────────────────────────────────────────────────
        $tab = $request->input('tab', 'staff');
        if ($tab === 'staff') {
            $query->whereIn('role', $this->officeRoleKeys());
        } elseif ($tab === 'drivers') {
            $query->whereIn('role', $this->access()->driverRoleKeys());
        } elseif ($tab === 'customers') {
            $query->whereIn('role', $this->access()->portalRoleKeys('customer'));
        } elseif ($tab === 'vendors') {
            $query->whereIn('role', $this->access()->portalRoleKeys('vendor'));
        }

        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->where(function ($q) use ($s) {
                $q->where('name',         'like', "%{$s}%")
                  ->orWhere('email',       'like', "%{$s}%")
                  ->orWhere('phone',       'like', "%{$s}%")
                  ->orWhere('employee_id', 'like', "%{$s}%")
                  ->orWhere('company_name','like', "%{$s}%");
            });
        }

        if ($request->filled('role'))       $query->where('role', $request->input('role'));
        if ($request->filled('status'))     $query->where('status', $request->input('status'));
        if ($request->filled('department')) $query->where('department', $request->input('department'));
        if ($request->boolean('locked'))    $query->whereNotNull('locked_until')->where('locked_until', '>', now());
        if ($request->boolean('unverified'))$query->whereNull('email_verified_at');
        if ($request->boolean('trashed'))   $query->onlyTrashed();
        if ($request->boolean('missing_employee')) $query->missingEmployee();

        $sortBy    = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $allowed   = ['name', 'email', 'role', 'status', 'created_at', 'last_login_at'];
        if (in_array($sortBy, $allowed)) $query->orderBy($sortBy, $sortOrder);

        $perPage = (int) $request->input('per_page', 20);
        $users   = $query->paginate($perPage);
        $users->load(['employee.manager.user', 'vendor', 'customer']);             // ← added vendor eager load
        $info = $this->access()->roleInfo();
        $may  = $actor->hasPermission('users.manage');
        $mine = $this->access()->clearance($actor);
        $users->getCollection()->transform(fn (User $u) => $this->decorate($u, $actor, $info, $mine, $may));

        return response()->json($users);
    }

    public function statistics(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $az   = $this->access();
        $base = $az->manageableUsers(User::query(), $request->user());
        $staff = $this->employeeRoleKeys();

        return response()->json([
            'total'                => (clone $base)->count(),
            'staff'                => (clone $base)->whereIn('role', $this->officeRoleKeys())->count(),
            'drivers'              => (clone $base)->whereIn('role', $az->driverRoleKeys())->count(),
            'customers'            => (clone $base)->whereIn('role', $az->portalRoleKeys('customer'))->count(),
            'vendors'              => (clone $base)->whereIn('role', $az->portalRoleKeys('vendor'))->count(),
            'active'               => (clone $base)->where('status', 'active')->count(),
            'suspended'            => (clone $base)->where('status', 'suspended')->count(),
            'pending_verification' => (clone $base)->where('status', 'pending_verification')->count(),
            'locked'               => (clone $base)->whereNotNull('locked_until')->where('locked_until', '>', now())->count(),
            'unverified'           => (clone $base)->whereNull('email_verified_at')->count(),
            'by_role'              => (clone $base)->selectRaw('role, COUNT(*) as count')->groupBy('role')->pluck('count', 'role'),
            'by_department'        => (clone $base)->whereIn('role', $staff)
                                        ->whereNotNull('department')
                                        ->selectRaw('department, COUNT(*) as count')
                                        ->groupBy('department')->pluck('count', 'department'),
            'staff_without_employee_record' => (clone $base)->whereIn('role', $staff)
                                        ->whereDoesntHave('employee')->count(),
        ]);
    }

    public function show(Request $request, $id)
    {
        $user = User::withTrashed()
            ->with(['customer', 'employee.manager.user', 'vendor'])   // ← added vendor
            ->findOrFail($id);

        $this->authorize('view', $user);

        return response()->json(['data' => $this->present($user, $request)]);
    }

    public function store(Request $request)
    {
        $this->authorize('create', User::class);

        $actor = $request->user();

        $validator = Validator::make($request->all(), [
            'name'         => 'required|string|max:255',
            'email'        => 'required|email|unique:users,email',
            'password'     => 'required|string|min:8',
            'role'         => $this->roleRule(),
            'phone'        => 'nullable|string|unique:users,phone',
            'company_name' => 'nullable|string|max:255',
            'employee_id'  => 'nullable|string|unique:users,employee_id',
            'department'   => 'nullable|string|max:255',
            'hired_at'     => 'nullable|date',
            'status'       => 'nullable|in:active,inactive,suspended,pending_verification',
            'permissions'  => 'nullable|array',
            // Staff-specific
            'job_title'                      => 'nullable|string|max:255',
            'employment_type'                => 'nullable|in:full_time,part_time,contract,intern',
            'work_location'                  => 'nullable|string|max:255',
            'manager_id'                     => 'nullable|exists:employees,id',
            'emergency_contact_name'         => 'nullable|string|max:255',
            'emergency_contact_phone'        => 'nullable|string|max:50',
            'emergency_contact_relationship' => 'nullable|string|max:100',
            // Vendor-specific                                                         // ← NEW block
            'contact_name'        => 'nullable|string|max:255',
            'tax_id'              => 'nullable|string|max:50',
            'address'             => 'nullable|string',
            'payment_terms_days'  => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if (!$request->filled('role') || !$this->access()->canAssignRoleKey($actor, $request->role)) {
            return response()->json(['message' => 'You cannot create a user with this role.'], 403);
        }

        DB::beginTransaction();
        try {
            $user = User::create([
                'name'                  => $request->name,
                'email'                 => $request->email,
                'password'              => Hash::make($request->password),
                'role'                  => $request->role,
                'phone'                 => $request->phone,
                'company_name'          => $request->company_name,
                'employee_id'           => $request->employee_id,
                'department'            => $request->department,
                'hired_at'              => $request->hired_at,
                'status'                => $request->input('status', 'active'),
                'permissions'           => $request->permissions ?? [],
                'oauth_provider'        => 'email',
                'force_password_change' => $request->boolean('force_password_change', true),
                'password_changed_at'   => now(),
            ]);

            $profile = $this->profileOf($user);
            if ($profile === 'customer') {
                $nameParts = explode(' ', $user->name, 2);
                Customer::create([
                    'user_id'         => $user->id,
                    'customer_number' => 'CUST-' . date('Y') . '-' . str_pad((Customer::withTrashed()->max('id') ?? 0) + 1, 4, '0', STR_PAD_LEFT),
                    'first_name'      => $nameParts[0],
                    'last_name'       => $nameParts[1] ?? '',
                    'email'           => $user->email,
                    'phone'           => $user->phone ?? '',
                    'company_name'    => $user->company_name ?? '',
                ]);

            } elseif ($profile === 'vendor') {
                $vendor = Vendor::create([
                    'user_id'            => $user->id,
                    'vendor_number'      => Vendor::generateVendorNumber(),
                    'company_name'       => $request->company_name ?? $user->name,
                    'contact_name'       => $request->contact_name ?? $user->name,
                    'email'              => $user->email,
                    'phone'              => $user->phone ?? '',
                    'tax_id'             => $request->tax_id,
                    'address'            => $request->address,
                    'payment_terms_days' => $request->input('payment_terms_days', 30),
                    'status'             => 'pending_approval',
                    'created_by'         => $actor->id,
                ]);
                app(\App\Services\Books\LedgerService::class)->vendorLedger($vendor);   // every vendor is a Sundry Creditors ledger

            } elseif ($profile === 'driver' || $profile === 'none') {
            // Drivers and other portal accounts have no profile record: the login alone is enough.

            } else {
                Employee::create([
                    'user_id'                        => $user->id,
                    'employee_id'                    => $request->employee_id,
                    'job_title'                      => $request->job_title ?? ucfirst($user->role),
                    'department'                     => $request->department ?? 'General',
                    'employment_type'                => $request->employment_type ?? 'full_time',
                    'hire_date'                      => $request->hired_at ?? now(),
                    'manager_id'                     => $request->manager_id,
                    'work_location'                  => $request->work_location,
                    'work_phone'                     => $request->phone,
                    'work_email'                     => $request->email,
                    'emergency_contact_name'         => $request->emergency_contact_name,
                    'emergency_contact_phone'        => $request->emergency_contact_phone,
                    'emergency_contact_relationship' => $request->emergency_contact_relationship,
                    'status'                         => 'active',
                    'created_by'                     => $actor->id,
                ]);
            }

            DB::commit();
            return response()->json([
                'message' => 'User created successfully.',
                'data'    => $this->present($user->load(['customer', 'employee.manager.user', 'vendor']), $request),
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('User creation failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to create user.'], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $user  = User::findOrFail($id);
        $this->authorize('update', $user);

        $actor = $request->user();

        $validator = Validator::make($request->all(), [
            'name'                => 'sometimes|string|max:255',
            'email'               => 'sometimes|email|unique:users,email,' . $id,
            'phone'               => 'nullable|string|unique:users,phone,' . $id,
            'company_name'        => 'nullable|string|max:255',
            'role'                => $this->roleRule($user->role),
            'employee_id'         => 'nullable|string|unique:users,employee_id,' . $id,
            'department'          => 'nullable|string|max:255',
            'hired_at'            => 'nullable|date',
            'bio'                 => 'nullable|string',
            'permissions'         => 'nullable|array',
            'email_notifications' => 'boolean',
            'sms_notifications'   => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // changing someone's main role: only to a role below the actor's own clearance
        if ($request->filled('role') && $request->role !== $user->role && !$this->access()->canAssignRoleKey($actor, $request->role)) {
            return response()->json(['message' => 'You cannot assign this role.'], 403);
        }

        DB::beginTransaction();
        try {
            $oldRole = $user->role;
            $was     = $this->profileOf($user);

            $user->update($request->only([
                'name', 'email', 'phone', 'company_name', 'role',
                'employee_id', 'department', 'hired_at', 'bio',
                'permissions', 'email_notifications', 'sms_notifications',
            ]));

            // ── Role transition handling ───────────────────────────────────────
            if ($request->filled('role') && $request->role !== $oldRole) {
                $this->access()->forget((int) $user->id);
                $this->handleRoleTransition($user, $was, $actor, $request);
            }

            // ── Sync employee record fields on update ─────────────────────────
            if ($user->employee && in_array($this->profileOf($user), ['employee', 'driver'], true)) {
                $employeeData = [];
                if ($request->filled('employee_id')) $employeeData['employee_id'] = $request->employee_id;
                if ($request->filled('department'))  $employeeData['department']  = $request->department;
                if ($request->filled('hired_at'))    $employeeData['hire_date']   = $request->hired_at;
                if (!empty($employeeData)) $user->employee->update($employeeData);
            }

            DB::commit();
            return response()->json([
                'message' => 'User updated successfully.',
                'data'    => $this->present($user->fresh(['customer', 'employee.manager.user', 'vendor']), $request),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('User update failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to update user.'], 500);
        }
    }

    /**
     * Central role-transition logic extracted from update() to keep it readable: the profile the account had ($was) is torn down and the one its new
     * main role needs is built. Profiles are decided by the kind of account, never by role name.
     */
    private function handleRoleTransition(User $user, string $was, User $actor, Request $request): void
    {
        $is = $this->profileOf($user);
        $staffProfile = ['employee', 'driver'];
        $wasStaff    = in_array($was, $staffProfile, true);
        $isStaff     = in_array($is, $staffProfile, true);
        $wasCustomer = $was === 'customer';
        $isCustomer  = $is === 'customer';
        $wasVendor   = $was === 'vendor';
        $isVendor    = $is === 'vendor';

        // ── Tear down the old profile ─────────────────────────────────────────
        if ($wasStaff    && $user->employee) { $user->employee->delete(); }
        if ($wasCustomer && $user->customer) { $user->customer->delete(); }
        if ($wasVendor   && $user->vendor)   { $user->vendor->delete(); }

        // ── Build the new profile ─────────────────────────────────────────────
        if ($isCustomer && !$user->customer()->withTrashed()->exists()) {
            $nameParts = explode(' ', $user->name, 2);
            Customer::create([
                'user_id'         => $user->id,
                'customer_number' => 'CUST-' . date('Y') . '-' . str_pad((Customer::withTrashed()->max('id') ?? 0) + 1, 4, '0', STR_PAD_LEFT),
                'first_name'      => $nameParts[0],
                'last_name'       => $nameParts[1] ?? '',
                'email'           => $user->email,
                'phone'           => $user->phone ?? '',
                'company_name'    => $user->company_name ?? '',
            ]);
        }

        if ($isStaff && !$user->employee()->exists()) {
            Employee::create([
                'user_id'         => $user->id,
                'employee_id'     => $request->employee_id,
                'job_title'       => ucfirst(str_replace('_', ' ', (string) $user->role)),
                'department'      => $request->department ?? 'General',
                'employment_type' => 'full_time',
                'hire_date'       => now(),
                'work_phone'      => $user->phone,
                'work_email'      => $user->email,
                'status'          => 'active',
                'created_by'      => $actor->id,
            ]);
        }

        if ($isVendor && !$user->vendor()->withTrashed()->exists()) {    // ← NEW
            Vendor::create([
                'user_id'       => $user->id,
                'vendor_number' => Vendor::generateVendorNumber(),
                'company_name'  => $user->company_name ?? $user->name,
                'contact_name'  => $user->name,
                'email'         => $user->email,
                'phone'         => $user->phone ?? '',
                'status'        => 'pending_approval',
                'created_by'    => $actor->id,
            ]);
        }
    }

    public function destroy(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('delete', $user);

        DB::beginTransaction();
        try {
            $user->tokens()->delete();
            if ($user->employee) { $user->employee->delete(); }
            if ($user->customer) { $user->customer->delete(); }
            if ($user->vendor)   { $user->vendor->delete(); }          // ← NEW

            $user->delete();
            DB::commit();
            return response()->json(['message' => 'User deleted.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to delete user.'], 500);
        }
    }

    public function restore(Request $request, $id)
    {
        $user = User::withTrashed()->findOrFail($id);
        $this->authorize('restore', $user);

        DB::beginTransaction();
        try {
            $user->restore();
            if ($user->customer()->withTrashed()->exists()) $user->customer()->withTrashed()->restore();
            if ($user->employee()->withTrashed()->exists()) $user->employee()->withTrashed()->restore();
            if ($user->vendor()->withTrashed()->exists())   $user->vendor()->withTrashed()->restore();   // ← NEW

            DB::commit();
            return response()->json(['message' => 'User restored.', 'data' => $user]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to restore user.'], 500);
        }
    }

    public function forceDelete(Request $request, $id)
    {
        $user = User::withTrashed()->findOrFail($id);
        $this->authorize('forceDelete', $user);

        DB::beginTransaction();
        try {
            $user->tokens()->delete();

            if ($user->customer()->withTrashed()->exists()) {
                $user->customer()->withTrashed()->first()->forceFill(['user_id' => null])->save();
            }
            if ($user->employee()->withTrashed()->exists()) {
                $user->employee()->withTrashed()->forceDelete();
            }
            if ($user->vendor()->withTrashed()->exists()) {             // ← NEW
                $user->vendor()->withTrashed()->first()->forceFill(['user_id' => null])->save();
            }

            $user->forceDelete();
            DB::commit();
            return response()->json(['message' => 'User permanently deleted.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to permanently delete user.'], 500);
        }
    }

    // ── The following methods are unchanged from the original ─────────────────

    public function forcePasswordReset(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);
        $user->forceFill(['force_password_change' => true])->save();
        $ended = app(\App\Services\Security\Sessions::class)->revokeAll($user, null, 'admin');   // "must change it" means now, not whenever the old session happens to end
        \App\Services\Security\SecurityLog::record('password_reset_forced', $user, $request, ['by' => $request->user()?->id, 'sessions_ended' => $ended], \App\Services\Security\SecurityLog::WARNING);
        return response()->json(['message' => 'User will be required to reset their password on next login.']);
    }

    public function updateStatus(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:active,inactive,suspended,pending_verification',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $user->forceFill(['status' => $request->status])->save();

            if ($request->status === 'suspended') {
                $user->tokens()->delete();
                if ($user->employee) { $user->employee->update(['status' => 'suspended']); }
                if ($user->vendor)   { $user->vendor->update(['status' => 'suspended']); }   // ← NEW
            } elseif ($request->status === 'active') {
                if ($user->employee && in_array($user->employee->status, ['suspended'])) {
                    $user->employee->update(['status' => 'active']);
                }
                if ($user->vendor && $user->vendor->status === 'suspended') {               // ← NEW
                    $user->vendor->update(['status' => 'active']);
                }
            }

            DB::commit();
            return response()->json([
                'message' => 'Status updated.',
                'data'    => $user->fresh(['employee', 'vendor']),                          // ← added vendor
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update status.'], 500);
        }
    }

    public function unlockAccount(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);
        $user->forceFill(['locked_until' => null, 'failed_login_attempts' => 0])->save();
        return response()->json(['message' => 'Account unlocked.', 'data' => $user]);
    }

    public function resetPassword(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $validator = Validator::make($request->all(), [
            'password' => 'required|string|min:8',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user->forceFill([
            'password'              => Hash::make($request->password),
            'password_changed_at'   => now(),
            'force_password_change' => true,
        ])->save();

        $ended = app(\App\Services\Security\Sessions::class)->revokeAll($user, null, 'admin');
        \App\Services\Security\SecurityLog::record('password_reset_by_admin', $user, $request, ['by' => $request->user()?->id, 'sessions_ended' => $ended], \App\Services\Security\SecurityLog::WARNING);

        return response()->json(['message' => 'Password reset. User will be required to change it on next login.']);
    }

    public function bulkDestroy(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $validator = Validator::make($request->all(), [
            'ids'   => 'required|array',
            'ids.*' => 'integer|exists:users,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $actor   = $request->user();
        $users   = User::whereIn('id', $request->ids)->get();
        $deleted = 0;

        foreach ($users as $user) {
            if ($actor->can('delete', $user)) {
                $user->tokens()->delete();
                if ($user->employee) { $user->employee->delete(); }
                if ($user->customer) { $user->customer->delete(); }
                if ($user->vendor)   { $user->vendor->delete(); }     // ← NEW
                $user->delete();
                $deleted++;
            }
        }

        return response()->json(['message' => "{$deleted} users deleted."]);
    }

    public function bulkRestore(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $validator = Validator::make($request->all(), [
            'ids'   => 'required|array',
            'ids.*' => 'integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $actor = $request->user();
        $users = User::withTrashed()->whereIn('id', $request->ids)->get();
        $count = 0;

        foreach ($users as $user) {
            if ($actor->can('restore', $user)) {
                $user->restore();
                if ($user->employee()->withTrashed()->exists()) $user->employee()->withTrashed()->restore();
                if ($user->customer()->withTrashed()->exists()) $user->customer()->withTrashed()->restore();
                if ($user->vendor()->withTrashed()->exists())   $user->vendor()->withTrashed()->restore();  // ← NEW
                $count++;
            }
        }

        return response()->json(['message' => "{$count} users restored."]);
    }

    public function verifyEmail(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        $user->forceFill([
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        return response()->json(['message' => 'Email verified.', 'data' => $user]);
    }

    public function verifyPhone(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $this->authorize('manageAccount', $user);

        if (!$user->phone) {
            return response()->json(['message' => 'User has no phone number.'], 422);
        }

        $user->forceFill([
            'phone_verified_at' => $user->phone_verified_at ?? now(),
        ])->save();

        return response()->json(['message' => 'Phone verified.', 'data' => $user]);
    }

    public function departments(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $departments = User::whereIn('role', $this->employeeRoleKeys())
            ->whereNotNull('department')
            ->distinct()
            ->pluck('department');

        return response()->json(['data' => $departments]);
    }

    public function staffWithoutEmployee(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $users = User::whereIn('role', $this->employeeRoleKeys())
            ->whereDoesntHave('employee')
            ->get(['id', 'name', 'email', 'role', 'department', 'employee_id']);

        return response()->json(['data' => $users]);
    }
}