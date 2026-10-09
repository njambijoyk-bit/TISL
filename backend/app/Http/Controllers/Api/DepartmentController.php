<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Employee;
use App\Services\Departments\DepartmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Departments per branch, the ready list of standard names, and an employee's cost centre shares. */
class DepartmentController extends Controller
{
    public function __construct(private DepartmentService $svc) {}

    public function index(Request $request): JsonResponse
    {
        if (! Department::ready()) {
            return response()->json(['ready' => false, 'data' => [], 'standard' => []]);
        }
        $rows = Department::with(['location:id,name,code', 'costCentre:id,name,code'])->withCount('employees')
            ->when($request->filled('location_id'), fn ($q) => $q->where('location_id', (int) $request->location_id))
            ->when(! $request->boolean('with_inactive'), fn ($q) => $q->where('is_active', true))
            ->orderBy('location_id')->orderBy('name')->get();

        return response()->json(['ready' => true, 'data' => $rows, 'standard' => DB::table('standard_departments')->orderBy('sort_order')->orderBy('name')->pluck('name')]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'name' => 'required|string|max:120', 'code' => 'nullable|string|max:30|regex:/^[A-Za-z0-9-]+$/', 'manager_employee_id' => 'nullable|integer|exists:employees,id']);

        return response()->json(['message' => 'Department added.', 'data' => $this->svc->create($d['location_id'], $d['name'], $d['code'] ?? null, $d['manager_employee_id'] ?? null)], 201);
    }

    /** The same department at several branches at once. */
    public function bulk(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'location_ids' => 'required|array|min:1', 'location_ids.*' => 'integer|exists:locations,id']);
        $made = $this->svc->addToLocations($d['name'], $d['location_ids']);

        return response()->json(['message' => count($made) . ' branch' . (count($made) === 1 ? '' : 'es') . ' now have ' . $d['name'] . '.', 'data' => $made], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['name' => 'sometimes|required|string|max:120', 'code' => 'nullable|string|max:30', 'manager_employee_id' => 'nullable|integer|exists:employees,id', 'is_active' => 'sometimes|boolean']);

        return response()->json(['message' => 'Saved.', 'data' => $this->svc->update(Department::findOrFail($id), $d)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->svc->delete(Department::findOrFail($id));

        return response()->json(['message' => 'Deleted.']);
    }

    public function addStandard(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:120']);
        DB::table('standard_departments')->updateOrInsert(['name' => trim($d['name'])], ['sort_order' => 100, 'updated_at' => now(), 'created_at' => now()]);

        return response()->json(['message' => 'Added to the list.']);
    }

    public function removeStandard(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:120']);
        DB::table('standard_departments')->where('name', $d['name'])->delete();

        return response()->json(['message' => 'Removed from the list.']);
    }

    // ---------------------------------------------------- employee shares

    public function shares(int $id): JsonResponse
    {
        return response()->json(['data' => $this->svc->shares(Employee::findOrFail($id))]);
    }

    public function saveShares(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'shares' => 'required|array|min:1|max:20', 'shares.*.cost_centre_id' => 'required|integer|exists:cost_centres,id',
            'shares.*.kind' => 'nullable|in:home,project,other', 'shares.*.share_percent' => 'required|numeric|min:0.01|max:100',
            'shares.*.valid_from' => 'nullable|date', 'shares.*.valid_to' => 'nullable|date',
        ]);

        return response()->json(['message' => 'Cost centre shares saved.', 'data' => $this->svc->saveShares(Employee::findOrFail($id), $d['shares'])]);
    }
}
