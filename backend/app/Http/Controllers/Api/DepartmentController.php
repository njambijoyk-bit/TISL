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
        $leads = app(\App\Services\Hr\DepartmentLeads::class);
        $rows = Department::with(['location:id,name,code', 'costCentre:id,name,code'])->withCount('employees')
            ->when($request->filled('location_id'), fn ($q) => $q->where('location_id', (int) $request->location_id))
            ->when(! $request->boolean('with_inactive'), fn ($q) => $q->where('is_active', true))
            ->orderBy('location_id')->orderBy('name')->get();

        $orphans = $leads->orphans();
        $rows->each(function ($d) use ($leads, $orphans) {   // HR stage 1b: its leads, and whether it lacks one who can see pay and identity details
            $d->setAttribute('leads', $leads->of($d->id));
            $d->setAttribute('needs_full_lead', in_array((int) $d->id, $orphans, true));
        });

        return response()->json(['ready' => true, 'leads_ready' => \App\Services\Hr\DepartmentLeads::ready(), 'data' => $rows, 'standard' => DB::table('standard_departments')->orderBy('sort_order')->orderBy('name')->pluck('name')]);
    }

    public function store(Request $request): JsonResponse
    {
        $ready = \App\Services\Hr\DepartmentLeads::ready();
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'name' => 'required|string|max:120', 'code' => 'nullable|string|max:30|regex:/^[A-Za-z0-9-]+$/',
            'manager_employee_id' => ($ready ? 'required' : 'nullable') . '|integer|exists:employees,id'], ['manager_employee_id.required' => 'Choose the head: a department is never without a lead who can see pay and identity details.']);

        // a department is made with its head, with full sensitivity, so it is never orphaned (HR stage 1b, choice 2)
        $dept = DB::transaction(function () use ($d, $ready, $request) {
            $dept = $this->svc->create($d['location_id'], $d['name'], $d['code'] ?? null, $d['manager_employee_id'] ?? null);
            if ($ready) {
                app(\App\Services\Hr\DepartmentLeads::class)->appoint($dept, (int) $d['manager_employee_id'], 'head', 'full', $request->user());
            }

            return $dept;
        });

        return response()->json(['message' => 'Department added.', 'data' => $dept], 201);
    }

    /** The same department at several branches at once. */
    public function bulk(Request $request): JsonResponse
    {
        $ready = \App\Services\Hr\DepartmentLeads::ready();
        $d = $request->validate(['name' => 'required|string|max:120', 'location_ids' => 'required|array|min:1', 'location_ids.*' => 'integer|exists:locations,id', 'heads' => ($ready ? 'required' : 'nullable') . '|array', 'heads.*' => 'integer|exists:employees,id'],
            ['heads.required' => 'Choose a head for each branch.']);
        foreach ($ready ? $d['location_ids'] : [] as $loc) {
            empty($d['heads'][$loc]) && throw \Illuminate\Validation\ValidationException::withMessages(['heads' => 'Choose a head for each branch.']);
        }
        $made = DB::transaction(function () use ($d, $ready, $request) {   // each branch's department is made with its own head (HR stage 1b)
            $made = $this->svc->addToLocations($d['name'], $d['location_ids']);
            foreach ($ready ? $made : [] as $dept) {
                if (! app(\App\Services\Hr\DepartmentLeads::class)->hasFull($dept->id)) {
                    app(\App\Services\Hr\DepartmentLeads::class)->appoint($dept, (int) $d['heads'][$dept->location_id], 'head', 'full', $request->user());
                }
            }

            return $made;
        });

        return response()->json(['message' => count($made) . ' branch' . (count($made) === 1 ? '' : 'es') . ' now have ' . $d['name'] . '.', 'data' => $made], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['name' => 'sometimes|required|string|max:120', 'code' => 'nullable|string|max:30', 'manager_employee_id' => 'nullable|integer|exists:employees,id', 'is_active' => 'sometimes|boolean']);

        $dept = Department::findOrFail($id);
        if (\App\Services\Hr\DepartmentLeads::ready()) {
            unset($d['manager_employee_id']);   // the head is appointed through the leads (HR stage 1b)
            if (! empty($d['is_active']) && ! $dept->is_active) {
                app(\App\Services\Hr\DepartmentLeads::class)->mustKeepFull($dept->id);   // switched back on only with a lead who can see pay and identity details
            }
        }

        return response()->json(['message' => 'Saved.', 'data' => $this->svc->update($dept, $d)]);
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

    /** Appoint or change a lead (HR stage 1b): employee_id, role head | assistant, sensitivity work | personal | full. */
    public function appointLead(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['employee_id' => 'required|integer', 'role' => 'required|string', 'sensitivity' => 'required|string']);
        $dept = Department::findOrFail($id);
        app(\App\Services\Hr\DepartmentLeads::class)->appoint($dept, (int) $d['employee_id'], $d['role'], $d['sensitivity'], $request->user());

        return response()->json(['message' => 'Saved.', 'leads' => app(\App\Services\Hr\DepartmentLeads::class)->of($dept->id)]);
    }

    public function removeLead(Request $request, int $id, int $employee): JsonResponse
    {
        $dept = Department::findOrFail($id);
        app(\App\Services\Hr\DepartmentLeads::class)->remove($dept, $employee);

        return response()->json(['message' => 'Removed.', 'leads' => app(\App\Services\Hr\DepartmentLeads::class)->of($dept->id)]);
    }

    /** The department's page (HR stage 1b, D.2): leads, people, spend (books.view), projects. HR and its leads. */
    public function page(Request $request, int $id): JsonResponse
    {
        return response()->json(app(\App\Services\Hr\DepartmentPage::class)->show(Department::findOrFail($id), $request->user()));
    }

    /** Move someone into this department, or out of it into another: employee_id, to_department_id. HR, or the heads involved. */
    public function movePerson(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['employee_id' => 'required|integer', 'to_department_id' => 'required|integer']);
        $dept = Department::findOrFail($id);
        $page = app(\App\Services\Hr\DepartmentPage::class);
        $page->move($dept, (int) $d['employee_id'], (int) $d['to_department_id'], $request->user());

        return response()->json($page->show($dept, $request->user()));
    }
}
