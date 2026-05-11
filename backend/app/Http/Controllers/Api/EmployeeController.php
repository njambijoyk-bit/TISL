<?php

namespace App\Http\Controllers\Api;

use Carbon\Carbon;
use App\Imports\EmployeesImport;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\User;
use App\Models\LeaveLog;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Validators\ValidationException;
use Illuminate\Support\Facades\Log;

class EmployeeController extends Controller
{
    /**
     * Get all employees (ADMIN)
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Employee::class);

        $query = Employee::with(['user', 'manager.user']);

        if ($request->input('trashed') === 'only') {
            $query = Employee::onlyTrashed()->with(['user', 'manager.user']);
        } else {
            $query = Employee::with(['user', 'manager.user']);
        }

        // Filter by status
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Filter by department
        if ($request->filled('department')) {
            $query->byDepartment($request->department);
        }

        // Filter by employment type
        if ($request->filled('employment_type')) {
            $query->byEmploymentType($request->employment_type);
        }

        // Filter by manager
        if ($request->filled('manager_id')) {
            $query->byManager($request->manager_id);
        }

        // Search
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('employee_number', 'like', "%{$search}%")
                  ->orWhere('employee_id', 'like', "%{$search}%")
                  ->orWhere('job_title', 'like', "%{$search}%")
                  ->orWhere('department', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        $allowed = ['employee_number', 'hire_date', 'status', 'department', 'created_at'];
        if (in_array($sortBy, $allowed)) {
            $query->orderBy($sortBy, $sortOrder);
        }

        $employees = $query->paginate($request->get('per_page', 20));

        return response()->json($employees, 200);
    }

    /**
     * Get single employee (ADMIN)
     */
    public function show($id)
    {
        $this->authorize('view', Employee::class);

        $employee = Employee::with(['user', 'manager.user', 'subordinates.user', 'assignedCustomers'])
            ->findOrFail($id);

        return response()->json([
            'employee' => $employee,
            'stats' => [
                'assigned_customers_count' => $employee->assignedCustomers()->count(),
                'subordinates_count' => $employee->subordinates()->count(),
                'tenure_years' => $employee->tenure_years,
            ]
        ], 200);
    }

    /**
     * Create a new employee record
     */
    public function store(Request $request)
    {
        $this->authorize('create', Employee::class);

        $validator = Validator::make($request->all(), [
            // User fields (optional if user_id provided)
            'name' => 'required_without:user_id|string|max:255',
            'email' => 'required_without:user_id|email|max:255|unique:users,email',
            'phone' => 'nullable|string|max:50',
            'password' => 'nullable|string|min:8',
            'role' => 'nullable|in:admin,manager,sales_rep',
            
            // Either user_id or name/email must be provided
            'user_id' => 'nullable|exists:users,id',
            
            // Employee fields
            'employee_id' => 'nullable|string|unique:employees,employee_id',
            'job_title' => 'required|string|max:255',
            'department' => 'required|string|max:255',
            'employment_type' => 'required|in:full_time,part_time,contract,intern',
            'hire_date' => 'nullable|date',
            'manager_id' => 'nullable|exists:employees,id',
            'work_location' => 'nullable|string|max:255',
            'work_phone' => 'nullable|string|max:50',
            'work_email' => 'nullable|email|max:255',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_phone' => 'nullable|string|max:50',
            'emergency_contact_relationship' => 'nullable|string|max:100',
            'salary_grade' => 'nullable|string|max:50',
            'base_salary' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:10',
            'annual_leave_days' => 'nullable|integer|min:0',
            'id_number' => 'nullable|string|max:50',
            'kra_pin' => 'nullable|string|max:50',
            'nssf_number' => 'nullable|string|max:50',
            'nhif_number' => 'nullable|string|max:50',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|in:male,female,other,prefer_not_to_say',
            'marital_status' => 'nullable|in:single,married,divorced,widowed',
            'education_level' => 'nullable|string|max:255',
            'skills' => 'nullable|array',
            'certifications' => 'nullable|array',
            'notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Create or find user
            if ($request->filled('user_id')) {
                $user = User::findOrFail($request->user_id);
                
                // Check if user already has an employee record
                $existingEmployee = Employee::where('user_id', $request->user_id)->first();
                if ($existingEmployee) {
                    return response()->json([
                        'message' => 'User already has an employee record',
                        'employee' => $existingEmployee
                    ], 422);
                }
            } else {
                // Create new user
                $user = User::create([
                    'name' => $request->name,
                    'email' => $request->email,
                    'phone' => $request->phone,
                    'password' => bcrypt($request->password ?? 'password123'), // default password
                    'role'  => $request->input('role', 'sales_rep'),
                    'status' => 'active',
                ]);
            }

            $employee = Employee::create([
                'user_id' => $user->id,
                'employee_id' => $request->employee_id,
                'job_title' => $request->job_title,
                'department' => $request->department,
                'employment_type' => $request->employment_type,
                'hire_date' => $request->hire_date,
                'manager_id' => $request->manager_id,
                'work_location' => $request->work_location,
                'work_phone' => $request->work_phone ?? $user->phone,
                'work_email' => $request->work_email ?? $user->email,
                'emergency_contact_name' => $request->emergency_contact_name,
                'emergency_contact_phone' => $request->emergency_contact_phone,
                'emergency_contact_relationship' => $request->emergency_contact_relationship,
                'salary_grade' => $request->salary_grade,
                'base_salary' => $request->base_salary,
                'currency' => $request->currency ?? 'KES',
                'annual_leave_days' => $request->annual_leave_days ?? 21,
                'leave_balance' => $request->annual_leave_days ?? 21,
                'id_number' => $request->id_number,
                'kra_pin' => $request->kra_pin,
                'nssf_number' => $request->nssf_number,
                'nhif_number' => $request->nhif_number,
                'date_of_birth' => $request->date_of_birth,
                'gender' => $request->gender,
                'marital_status' => $request->marital_status,
                'education_level' => $request->education_level,
                'skills' => $request->skills ?? [],
                'certifications' => $request->certifications ?? [],
                'status' => 'active',
                'notes' => $request->notes,
                'created_by' => $request->user()->id,
            ]);

            // Update user with employee_id and department
            $user->update([
                'employee_id' => $request->employee_id ?? $employee->employee_number,
                'department' => $request->department,
            ]);

            DB::commit();

            return response()->json([
                'message' => 'Employee record created successfully',
                'employee' => $employee->load('user', 'manager.user')
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Employee creation failed', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Failed to create employee record',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update employee details (ADMIN)
     */
    public function update(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $employee = Employee::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'employee_id' => 'nullable|string|unique:employees,employee_id,' . $id,
            'job_title' => 'string|max:255',
            'department' => 'string|max:255',
            'employment_type' => 'in:full_time,part_time,contract,intern',
            'hire_date' => 'nullable|date',
            'termination_date' => 'nullable|date',
            'manager_id' => 'nullable|exists:employees,id',
            'work_location' => 'nullable|string|max:255',
            'work_phone' => 'nullable|string|max:50',
            'work_email' => 'nullable|email|max:255',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_phone' => 'nullable|string|max:50',
            'emergency_contact_relationship' => 'nullable|string|max:100',
            'bank_name' => 'nullable|string|max:255',
            'bank_account_number' => 'nullable|string|max:255',
            'bank_account_name' => 'nullable|string|max:255',
            'salary_grade' => 'nullable|string|max:50',
            'base_salary' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:10',
            'annual_leave_days' => 'integer|min:0',
            'leave_balance' => 'numeric|min:0',
            'id_number' => 'nullable|string|max:50',
            'kra_pin' => 'nullable|string|max:50',
            'nssf_number' => 'nullable|string|max:50',
            'nhif_number' => 'nullable|string|max:50',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|in:male,female,other,prefer_not_to_say',
            'marital_status' => 'nullable|in:single,married,divorced,widowed',
            'education_level' => 'nullable|string|max:255',
            'skills' => 'nullable|array',
            'certifications' => 'nullable|array',
            'status' => 'in:active,on_leave,suspended,terminated,probation',
            'notes' => 'nullable|string',
            'role' => 'nullable|in:admin,manager,sales_rep',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $employee->update($request->only([
                'employee_id', 'job_title', 'department', 'employment_type',
                'hire_date', 'termination_date', 'manager_id', 'work_location',
                'work_phone', 'work_email', 'emergency_contact_name',
                'emergency_contact_phone', 'emergency_contact_relationship',
                'bank_name', 'bank_account_number', 'bank_account_name',
                'salary_grade', 'base_salary', 'currency', 'annual_leave_days',
                'leave_balance', 'id_number', 'kra_pin', 'nssf_number',
                'nhif_number', 'date_of_birth', 'gender', 'marital_status',
                'education_level', 'skills', 'certifications', 'status', 'notes',
            ]));

            // Update user record to keep in sync
            if ($request->filled('employee_id') || $request->filled('department') || $request->filled('role')) {
                $updateData = [
                    'employee_id' => $request->employee_id ?? $employee->employee_id,
                    'department'  => $request->department  ?? $employee->department,
                ];

                if ($request->filled('role')) {
                    $updateData['role'] = $request->role;
                }

                $employee->user->update($updateData);
            }

            // Handle status changes
            if ($request->filled('status')) {
                switch ($request->status) {
                    case 'terminated':
                        $employee->user->update(['status' => 'inactive']);
                        $employee->user->tokens()->delete();
                        break;
                    case 'suspended':
                        $employee->user->update(['status' => 'suspended']);
                        $employee->user->tokens()->delete();
                        break;
                    case 'active':
                        if (in_array($employee->user->status, ['inactive', 'suspended'])) {
                            $employee->user->update(['status' => 'active']);
                        }
                        break;
                }
            }

            DB::commit();

            return response()->json([
                'message' => 'Employee updated successfully',
                'employee' => $employee->fresh(['user', 'manager.user'])
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Employee update failed', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Failed to update employee',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete employee (soft delete)
     */
    public function destroy($id)
    {
        $this->authorize('delete', Employee::class);

        $employee = Employee::findOrFail($id);

        DB::beginTransaction();
        try {
            $employee->delete();

            // Optionally deactivate the user
            // $employee->user->update(['status' => 'inactive']);

            DB::commit();

            return response()->json(['message' => 'Employee record deleted'], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to delete employee',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Permanently delete a soft-deleted employee (force delete)
     */
    public function forceDelete($id)
    {
        $this->authorize('forceDelete', Employee::class);
 
        $employee = Employee::withTrashed()->findOrFail($id);
 
        if (!$employee->trashed()) {
            return response()->json([
                'message' => 'Employee must be soft-deleted before it can be permanently deleted'
            ], 422);
        }
 
        DB::beginTransaction();
        try {
            // Permanently delete the associated user account as well
            if ($employee->user) {
                $employee->user->tokens()->delete();
                $employee->user->forceDelete();
            }
 
            $employee->forceDelete();
 
            DB::commit();
 
            return response()->json(['message' => 'Employee permanently deleted'], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Employee force delete failed', ['error' => $e->getMessage()]);
            return response()->json([
                'message' => 'Failed to permanently delete employee',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Restore soft-deleted employee
     */
    public function restore($id)
    {
        $this->authorize('restore', Employee::class);

        $employee = Employee::withTrashed()->findOrFail($id);

        try {
            $employee->restore();
            return response()->json([
                'message' => 'Employee restored',
                'employee' => $employee->load('user')
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to restore employee',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get employee statistics
     */
    public function statistics()
    {
        $this->authorize('viewAny', Employee::class);

        $stats = [
            'total_employees' => Employee::count(),
            'active' => Employee::active()->count(),
            'on_leave' => Employee::onLeave()->count(),
            'probation' => Employee::probation()->count(),
            'terminated' => Employee::terminated()->count(),
            'by_department' => Employee::selectRaw('department, COUNT(*) as count')
                ->whereNotNull('department')
                ->groupBy('department')
                ->pluck('count', 'department'),
            'by_employment_type' => Employee::selectRaw('employment_type, COUNT(*) as count')
                ->groupBy('employment_type')
                ->pluck('count', 'employment_type'),
            'by_status' => Employee::selectRaw('status, COUNT(*) as count')
                ->groupBy('status')
                ->pluck('count', 'status'),
        ];

        return response()->json($stats, 200);
    }

    /**
     * Get all departments
     */
    public function departments()
    {
        $this->authorize('viewAny', Employee::class);

        $departments = Employee::whereNotNull('department')
            ->distinct()
            ->pluck('department');

        return response()->json(['data' => $departments], 200);
    }

    /**
     * Get all job titles
     */
    public function jobTitles()
    {
        $this->authorize('viewAny', Employee::class);

        $jobTitles = Employee::whereNotNull('job_title')
            ->distinct()
            ->pluck('job_title');

        return response()->json(['data' => $jobTitles], 200);
    }

    /**
     * Get the authenticated user's own employee record
     */
    public function myRecord(Request $request)
    {
        $employee = Employee::with(['manager.user', 'subordinates.user'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$employee) {
            return response()->json([
                'message' => 'No employee record found for your account',
                'employee' => null,
            ], 200);
        }

        // No authorize() needed — the query already scopes to their own record

        return response()->json([
            'employee' => $employee,
        ], 200);
    }

    /**
     * Get potential managers (for dropdown)
     */
    public function potentialManagers()
    {
        $this->authorize('viewAny', Employee::class);

        $managers = Employee::with('user')
            ->whereIn('status', ['active', 'on_leave'])
            ->get()
            ->map(function ($employee) {
                return [
                    'id' => $employee->id,
                    'user_id' => $employee->user_id,
                    'name' => $employee->full_name,
                    'role' => $employee->user?->role,
                    'job_title' => $employee->job_title,
                    'department' => $employee->department,
                ];
            });

        return response()->json(['data' => $managers], 200);
    }

    public function downloadTemplate()
    {
        $columns = [
            'name', 'email', 'phone', 'employee_number', 'job_title', 'department',
            'employment_type', 'hire_date', 'manager_id', 'work_location', 'base_salary',
            'currency', 'annual_leave_days', 'id_number', 'kra_pin', 'nssf_number',
            'nhif_number', 'date_of_birth', 'gender', 'marital_status', 'skills',
            'certifications', 'status', 'notes', 'emergency_contact_name',
            'emergency_contact_phone', 'emergency_contact_relationship', 'bank_name',
            'bank_account_number', 'bank_account_name',
        ];

        // Build CSV in memory (no php://output issues)
        $csv = collect([$columns])
            ->map(fn($row) => implode(',', array_map(fn($cell) => '"' . str_replace('"', '""', $cell) . '"', $row)))
            ->implode("\n");

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="employees_template.csv"',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
        ]);
    }

    public function bulkImport(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:5120',
        ]);

        try {
            Excel::import(new EmployeesImport(), $request->file('file'));
            return response()->json(['message' => 'Employees imported successfully.']);

        } catch (ValidationException $e) {
            $failures = collect($e->failures())->take(5)->map(fn($f) => [
                'row'    => $f->row(),
                'errors' => $f->errors(),
            ]);
            return response()->json([
                'message' => 'Validation failed on some rows.',
                'errors'  => $failures->toArray(),
            ], 422);

        } catch (\Illuminate\Database\QueryException $e) {
            if ($e->getCode() == 23000 || str_contains($e->getMessage(), 'Duplicate entry')) {
                preg_match("/Duplicate entry '([^']+)' for key '([^']+)'/", $e->getMessage(), $matches);
                return response()->json([
                    'message' => "Import failed: Duplicate value '{$matches[1]}' on constraint '{$matches[2]}'.",
                    'hint'    => 'Check that all values in your CSV are unique and not already registered.',
                ], 422);
            }
            return response()->json(['message' => 'Import failed: ' . $e->getMessage()], 500);

        } catch (\Exception $e) {
            return response()->json(['message' => 'Import failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Add skill to employee
     */
    public function addSkill(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'skill' => 'required|string|max:100'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);
        $employee->addSkill($request->skill);

        return response()->json([
            'message' => 'Skill added successfully',
            'employee' => $employee->fresh()
        ], 200);
    }

    /**
     * Remove skill from employee
     */
    public function removeSkill(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'skill' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);
        $employee->removeSkill($request->skill);

        return response()->json([
            'message' => 'Skill removed successfully',
            'employee' => $employee->fresh()
        ], 200);
    }

    /**
     * Add certification to employee
     */
    public function addCertification(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'name'   => 'required|string|max:255',
            'issuer' => 'nullable|string|max:255',
            'date'   => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);

        $certifications = $employee->certifications ?? [];
        $certifications[] = array_filter([
            'name'   => $request->name,
            'issuer' => $request->issuer,
            'date'   => $request->date,
        ]);

        $employee->update(['certifications' => $certifications]);

        return response()->json([
            'message'  => 'Certification added successfully',
            'employee' => $employee->fresh(),
        ], 200);
    }

    /**
     * Remove certification from employee by index
     */
    public function removeCertification(Request $request, $id, $index)
    {
        $this->authorize('update', Employee::class);

        $employee = Employee::findOrFail($id);

        $certifications = $employee->certifications ?? [];

        if (!isset($certifications[$index])) {
            return response()->json(['message' => 'Certification not found'], 404);
        }

        array_splice($certifications, $index, 1);
        $employee->update(['certifications' => array_values($certifications)]);

        return response()->json([
            'message'  => 'Certification removed successfully',
            'employee' => $employee->fresh(),
        ], 200);
    }

    /**
     * Add leave days to employee
     */
    public function addLeaveDays(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'days'   => 'required|numeric|min:0',
            'reason' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);
        $balanceBefore = $employee->leave_balance;

        $employee->addLeaveDays($request->days);

        LeaveLog::create([
            'employee_id'    => $employee->id,
            'action'         => 'add',
            'days'           => $request->days,
            'reason'         => $request->reason,
            'balance_before' => $balanceBefore,
            'balance_after'  => $employee->fresh()->leave_balance,
            'actioned_by'    => $request->user()->id,
        ]);

        return response()->json([
            'message'     => 'Leave days added successfully',
            'employee'    => $employee->fresh(),
            'new_balance' => $employee->fresh()->leave_balance,
        ], 200);
    }

    /**
     * Use leave days
     */
    public function useLeaveDays(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'days'   => 'required|numeric|min:0',
            'reason' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);
        $balanceBefore = $employee->leave_balance;

        if (!$employee->useLeaveDays($request->days)) {
            return response()->json([
                'message'         => 'Insufficient leave balance',
                'current_balance' => $employee->leave_balance,
            ], 422);
        }

        LeaveLog::create([
            'employee_id'    => $employee->id,
            'action'         => 'use',
            'days'           => $request->days,
            'reason'         => $request->reason,
            'balance_before' => $balanceBefore,
            'balance_after'  => $employee->fresh()->leave_balance,
            'actioned_by'    => $request->user()->id,
        ]);

        return response()->json([
            'message'     => 'Leave days used successfully',
            'employee'    => $employee->fresh(),
            'new_balance' => $employee->fresh()->leave_balance,
        ], 200);
    }

    /**
     * Get leave log history for an employee
     */
    public function leaveLogs($id)
    {
        $this->authorize('viewAny', Employee::class);

        $logs = LeaveLog::where('employee_id', $id)
            ->with('actionedBy:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $logs], 200);
    }

    /**
     * All leave logs across all employees (global view)
     */
    public function allLeaveLogs(Request $request)
    {
        $this->authorize('viewAny', Employee::class);

        $query = LeaveLog::with([
            'employee:id,employee_number,user_id',   // ← user_id required for nested load
            'employee.user:id,name',
            'actionedBy:id,name',
        ])->orderBy('created_at', 'desc');

        // Optional filters
        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        $logs = $query->paginate($request->get('per_page', 50));

        return response()->json($logs, 200);
    }

    /**
     * Update employee status
     */
    public function updateStatus(Request $request, $id)
    {
        $this->authorize('update', Employee::class);

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:active,on_leave,suspended,terminated,probation'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $employee = Employee::findOrFail($id);
        $oldStatus = $employee->status;
        $newStatus = $request->status;

        DB::beginTransaction();
        try {
            switch ($newStatus) {
                case 'terminated':
                    $employee->terminate();
                    break;
                case 'suspended':
                    $employee->suspend();
                    break;
                case 'active':
                    $employee->activate();
                    if (in_array($employee->user->status, ['inactive', 'suspended'])) {
                        $employee->user->update(['status' => 'active']);
                    }
                    break;
                case 'on_leave':
                    $employee->putOnLeave();
                    break;
                default:
                    $employee->update(['status' => $newStatus]);
            }

            DB::commit();

            return response()->json([
                'message' => "Employee status changed from {$oldStatus} to {$newStatus}",
                'employee' => $employee->fresh(['user'])
            ], 200);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to update status',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get employees with upcoming birthdays
     */
    public function upcomingBirthdays(Request $request)
    {
        $this->authorize('viewAny', Employee::class);

        $days = (int) $request->get('days', 30);
        $today = now();
        $endDate = $today->copy()->addDays($days);

        $employees = Employee::with('user')
            ->whereNotNull('date_of_birth')
            ->where(function ($query) use ($today, $endDate) {
                // Handle year wrap-around
                $startMonth = $today->month;
                $startDay = $today->day;
                $endMonth = $endDate->month;
                $endDay = $endDate->day;

                if ($startMonth <= $endMonth) {
                    $query->whereRaw('MONTH(date_of_birth) BETWEEN ? AND ?', [$startMonth, $endMonth])
                          ->where(function ($q) use ($startMonth, $startDay, $endMonth, $endDay) {
                              $q->whereRaw('(MONTH(date_of_birth) > ? OR (MONTH(date_of_birth) = ? AND DAY(date_of_birth) >= ?))', 
                                  [$startMonth, $startMonth, $startDay])
                                ->whereRaw('(MONTH(date_of_birth) < ? OR (MONTH(date_of_birth) = ? AND DAY(date_of_birth) <= ?))',
                                  [$endMonth, $endMonth, $endDay]);
                          });
                } else {
                    // Year wrap-around (e.g., December to January)
                    $query->where(function ($q) use ($startMonth, $startDay) {
                        $q->whereRaw('MONTH(date_of_birth) > ?', [$startMonth])
                          ->orWhereRaw('(MONTH(date_of_birth) = ? AND DAY(date_of_birth) >= ?)', 
                              [$startMonth, $startDay]);
                    })->orWhere(function ($q) use ($endMonth, $endDay) {
                        $q->whereRaw('MONTH(date_of_birth) < ?', [$endMonth])
                          ->orWhereRaw('(MONTH(date_of_birth) = ? AND DAY(date_of_birth) <= ?)',
                              [$endMonth, $endDay]);
                    });
                }
            })
            ->whereIn('status', ['active', 'on_leave', 'probation'])
            ->get();

        return response()->json([
            'data' => $employees->map(function ($emp) {
                return [
                    'id' => $emp->id,
                    'name' => $emp->full_name,
                    'date_of_birth' => $emp->date_of_birth,
                    'age' => $emp->age,
                    'days_until_birthday' => $this->daysUntilBirthday($emp->date_of_birth),
                ];
            })->sortBy('days_until_birthday')->values()
        ], 200);
    }

    /**
     * Calculate days until birthday
     */
    private function daysUntilBirthday($birthDate): int
    {
        if (!$birthDate) return 999;

        $today = now()->startOfDay();
        $year  = $today->year;

        // Handle Feb 29 born employees in non-leap years
        try {
            $nextBirthday = Carbon::createFromDate($year, $birthDate->month, $birthDate->day)->startOfDay();
        } catch (\Exception $e) {
            // Feb 29 on a non-leap year → use Mar 1
            $nextBirthday = Carbon::createFromDate($year, 3, 1)->startOfDay();
        }

        if ($nextBirthday->lt($today)) {
            try {
                $nextBirthday = Carbon::createFromDate($year + 1, $birthDate->month, $birthDate->day)->startOfDay();
            } catch (\Exception $e) {
                $nextBirthday = Carbon::createFromDate($year + 1, 3, 1)->startOfDay();
            }
        }

        return (int) $today->diffInDays($nextBirthday);
    }
}