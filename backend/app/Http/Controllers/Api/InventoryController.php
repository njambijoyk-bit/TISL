<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Controller;

use App\Services\Inventory\InventoryTransactionService;
use App\Services\Inventory\InventoryOperationsService;
use App\Services\Inventory\InventoryStockService;

use App\Models\Inventory\{
    InventoryCategory,
    InventoryLocation,
    InventoryItem,
    InventoryInstance,
    InventoryAssignment,
    InventoryRepair,
    InventoryDispute,
    InventoryReturnAudit,
    InventoryReturnAuditItem,
    InventoryLifecycleMovement,
    InventoryLocationMovement,
    InventoryGroup,
    InventoryGroupMember,
    InventoryExportLog,
    InventoryExportPreset,
};

class InventoryController extends Controller
{
    public function __construct(
        private InventoryTransactionService $transactions,
        private InventoryOperationsService  $operations,
    ) {}

    // =========================================================================
    // CATEGORIES
    // =========================================================================

    public function categoriesIndex(Request $request): JsonResponse
    {
        $categories = InventoryCategory::with('children')
            ->when($request->boolean('active_only', true), fn($q) => $q->active())
            ->when($request->boolean('top_level'), fn($q) => $q->topLevel())
            ->orderBy('sort_order')
            ->get();

        return response()->json($categories);
    }

    public function categoriesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:150',
            'parent_id'   => 'nullable|exists:inventory_categories,id',
            'description' => 'nullable|string',
            'icon'        => 'nullable|string|max:100',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'boolean',
        ]);

        $data['slug']       = \Illuminate\Support\Str::slug($data['name']);
        $data['created_by'] = Auth::id();

        $category = InventoryCategory::create($data);

        return response()->json($category, 201);
    }

    public function categoriesUpdate(Request $request, int $id): JsonResponse
    {
        $category = InventoryCategory::findOrFail($id);

        $data = $request->validate([
            'name'        => 'sometimes|string|max:150',
            'parent_id'   => 'nullable|exists:inventory_categories,id',
            'description' => 'nullable|string',
            'icon'        => 'nullable|string|max:100',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'boolean',
        ]);

        if (isset($data['name'])) {
            $data['slug'] = \Illuminate\Support\Str::slug($data['name']);
        }

        $category->update($data);

        return response()->json($category);
    }

    public function categoriesDestroy(int $id): JsonResponse
    {
        $category = InventoryCategory::findOrFail($id);
        $category->delete();

        return response()->json(['message' => 'Category deleted.']);
    }

    // =========================================================================
    // LOCATIONS
    // =========================================================================

    public function locationsIndex(Request $request): JsonResponse
    {
        $locations = InventoryLocation::with('children')
            ->when($request->boolean('active_only', true), fn($q) => $q->active())
            ->when($request->filled('type'), fn($q) => $q->ofType($request->type))
            ->whereNull('parent_id') // top-level with children nested
            ->get();

        return response()->json($locations);
    }

    public function locationsStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'      => 'required|string|max:150',
            'code'      => 'required|string|max:50|unique:inventory_locations,code',
            'type'      => 'required|in:warehouse,office,site,vehicle,external,virtual',
            'parent_id' => 'nullable|exists:inventory_locations,id',
            'address'   => 'nullable|string',
            'notes'     => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $data['created_by'] = Auth::id();

        return response()->json(InventoryLocation::create($data), 201);
    }

    public function locationsUpdate(Request $request, int $id): JsonResponse
    {
        $location = InventoryLocation::findOrFail($id);

        $data = $request->validate([
            'name'      => 'sometimes|string|max:150',
            'code'      => "sometimes|string|max:50|unique:inventory_locations,code,{$id}",
            'type'      => 'sometimes|in:warehouse,office,site,vehicle,external,virtual',
            'parent_id' => 'nullable|exists:inventory_locations,id',
            'address'   => 'nullable|string',
            'notes'     => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $location->update($data);

        return response()->json($location);
    }

    public function locationsDestroy(int $id): JsonResponse
    {
        InventoryLocation::findOrFail($id)->delete();
        return response()->json(['message' => 'Location deleted.']);
    }

    // =========================================================================
    // ITEMS (catalogue)
    // =========================================================================

    public function itemsIndex(Request $request): JsonResponse
    {
        $items = InventoryItem::with(['category', 'defaultLocation'])
            ->when($request->boolean('active_only', true), fn($q) => $q->active())
            ->when($request->filled('type'),        fn($q) => $q->ofType($request->type))
            ->when($request->filled('category_id'), fn($q) => $q->where('category_id', $request->category_id))
            ->when($request->boolean('serialized'),     fn($q) => $q->serialized())
            ->when($request->boolean('non_serialized'), fn($q) => $q->nonSerialized())
            ->when($request->boolean('low_stock'),      fn($q) => $q->lowStock())
            ->when($request->filled('search'), fn($q) =>
                $q->where(fn($s) => $s
                    ->where('name', 'like', "%{$request->search}%")
                    ->orWhere('brand', 'like', "%{$request->search}%")
                    ->orWhere('model', 'like', "%{$request->search}%")
                )
            )
            ->paginate($request->integer('per_page', 25));

        return response()->json($items);
    }

    public function itemsShow(int $id): JsonResponse
    {
        $item = InventoryItem::with(['category', 'defaultLocation', 'instances'])
            ->findOrFail($id);

        return response()->json($item);
    }

    public function itemsStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                => 'required|string|max:255',
            'category_id'         => 'nullable|exists:inventory_categories,id',
            'product_id'          => 'nullable|exists:products,id',
            'description'         => 'nullable|string',
            'brand'               => 'nullable|string|max:150',
            'model'               => 'nullable|string|max:150',
            'type'                => 'required|in:asset,stock,consumable,loanable',
            'is_serialized'       => 'boolean',
            'unit_of_measure'     => 'nullable|string|max:50',
            'default_location_id' => 'nullable|exists:inventory_locations,id',
            'purchase_cost'       => 'nullable|numeric|min:0',
            'replacement_cost'    => 'nullable|numeric|min:0',
            'is_loanable'         => 'boolean',
            'max_loan_days'       => 'nullable|integer|min:1',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'notes'               => 'nullable|string',
        ]);

        $data['created_by'] = Auth::id();
        $data['updated_by'] = Auth::id();

        return response()->json(InventoryItem::create($data), 201);
    }

    public function itemsUpdate(Request $request, int $id): JsonResponse
    {
        $item = InventoryItem::findOrFail($id);

        $data = $request->validate([
            'name'                => 'sometimes|string|max:255',
            'category_id'         => 'nullable|exists:inventory_categories,id',
            'description'         => 'nullable|string',
            'brand'               => 'nullable|string|max:150',
            'model'               => 'nullable|string|max:150',
            'type'                => 'sometimes|in:asset,stock,consumable,loanable',
            'default_location_id' => 'nullable|exists:inventory_locations,id',
            'purchase_cost'       => 'nullable|numeric|min:0',
            'replacement_cost'    => 'nullable|numeric|min:0',
            'is_loanable'         => 'boolean',
            'max_loan_days'       => 'nullable|integer|min:1',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'is_active'           => 'boolean',
            'notes'               => 'nullable|string',
        ]);

        $data['updated_by'] = Auth::id();
        $item->update($data);

        return response()->json($item->fresh(['category', 'defaultLocation']));
    }

    public function itemsSyncProducts(Request $request): JsonResponse
    {
        $request->validate([
            'offset' => 'nullable|integer|min:0',
            'limit'  => 'nullable|integer|min:1|max:50',
        ]);

        $offset = (int) ($request->offset ?? 0);
        $limit  = (int) ($request->limit  ?? 50);

        $result = app(InventoryStockService::class)->syncFromProductsBatch(
            offset:      $offset,
            limit:       $limit,
            performedBy: Auth::id(),
        );

        return response()->json($result, 200);
    }

    public function itemsDestroy(int $id): JsonResponse
    {
        InventoryItem::findOrFail($id)->delete();
        return response()->json(['message' => 'Item deleted.']);
    }

    // =========================================================================
    // INSTANCES
    // =========================================================================

    public function instancesIndex(Request $request): JsonResponse
    {
        $instances = InventoryInstance::with(['item', 'currentLocation'])
            ->when($request->filled('item_id'),     fn($q) => $q->where('item_id', $request->item_id))
            ->when($request->filled('status'),      fn($q) => $q->where('status', $request->status))
            ->when($request->filled('location_id'), fn($q) => $q->where('current_location_id', $request->location_id))
            ->when($request->filled('search'), fn($q) =>
                $q->where(fn($s) => $s
                    ->where('serial_number', 'like', "%{$request->search}%")
                    ->orWhere('asset_tag', 'like', "%{$request->search}%")
                    ->orWhere('barcode', 'like', "%{$request->search}%")
                )
            )
            ->when($request->boolean('active_only'), fn($q) => $q->active())
            ->paginate($request->integer('per_page', 25));

        return response()->json($instances);
    }

    public function instancesShow(int $id): JsonResponse
    {
        $instance = InventoryInstance::with([
            'item', 'currentLocation', 'currentAssignment',
            'repairs', 'disputes', 'lifecycleMovements', 'locationMovements',
        ])->findOrFail($id);

        return response()->json($instance);
    }

    public function instancesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id'            => 'required|exists:inventory_items,id',
            'serial_number'      => 'nullable|string|max:255|unique:inventory_instances,serial_number',
            'barcode'            => 'nullable|string|max:255|unique:inventory_instances,barcode',
            'condition'          => 'sometimes|in:new,excellent,good,fair,poor,damaged,unusable',
            'current_location_id'=> 'nullable|exists:inventory_locations,id',
            'purchase_date'      => 'nullable|date',
            'purchase_cost'      => 'nullable|numeric|min:0',
            'warranty_expiry'    => 'nullable|date',
            'useful_life_years'  => 'nullable|integer|min:1',
            'notes'              => 'nullable|string',
        ]);

        $data['created_by'] = Auth::id();
        $data['updated_by'] = Auth::id();

        // Auto-generate asset tag: TISL-IT-{padded id} handled after creation
        $instance = InventoryInstance::create($data);

        if (! $instance->asset_tag) {
            $instance->update([
                'asset_tag' => 'TISL-IT-' . str_pad($instance->id, 4, '0', STR_PAD_LEFT),
            ]);
        }

        // Log procured movement
        $instance->logMovement(
            type:          'procured',
            conditionAfter: $instance->condition,
            statusAfter:   'available',
            scoreAfter:    $instance->condition_score,
            performedBy:   Auth::id(),
        );

        $this->transactions->syncItemQty($instance->item_id);

        return response()->json($instance->fresh(), 201);
    }

    public function instancesUpdate(Request $request, int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);

        $data = $request->validate([
            'current_location_id'       => 'nullable|exists:inventory_locations,id',
            'condition'                  => 'sometimes|in:new,excellent,good,fair,poor,damaged,unusable',
            'condition_score_override'   => 'nullable|numeric|min:0|max:100',
            'purchase_date'              => 'nullable|date',
            'purchase_cost'              => 'nullable|numeric|min:0',
            'warranty_expiry'            => 'nullable|date',
            'useful_life_years'          => 'nullable|integer|min:1',
            'notes'                      => 'nullable|string',
        ]);

        $data['updated_by'] = Auth::id();
        $instance->update($data);

        return response()->json($instance->fresh());
    }

    public function instancesDestroy(int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);
        $instance->delete();
        $this->transactions->syncItemQty($instance->item_id);

        return response()->json(['message' => 'Instance deleted.']);
    }

    public function instancesLedger(int $id): JsonResponse
    {
        $movements = InventoryLifecycleMovement::where('instance_id', $id)
            ->with('performedBy')
            ->orderByDesc('performed_at')
            ->get();

        return response()->json($movements);
    }

    public function instancesLocationHistory(int $id): JsonResponse
    {
        $movements = InventoryLocationMovement::where('instance_id', $id)
            ->with(['fromLocation', 'toLocation', 'movedBy'])
            ->orderByDesc('moved_at')
            ->get();

        return response()->json($movements);
    }

    public function instancesDeclareObsolete(Request $request, int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);

        $data = $request->validate([
            'reason' => 'required|string',
        ]);

        $data['declared_by'] = Auth::id();

        return response()->json($this->operations->declareObsolete($instance, $data));
    }

    public function instancesWriteOff(Request $request, int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);

        $data = $request->validate(['reason' => 'nullable|string']);
        $data['performed_by'] = Auth::id();

        return response()->json($this->operations->writeOff($instance, $data));
    }

    public function instancesDispose(Request $request, int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);

        $data = $request->validate(['reason' => 'nullable|string']);
        $data['performed_by'] = Auth::id();

        return response()->json($this->operations->dispose($instance, $data));
    }

    public function instancesMove(Request $request, int $id): JsonResponse
    {
        $instance = InventoryInstance::findOrFail($id);

        $data = $request->validate([
            'to_location_id' => 'required|exists:inventory_locations,id',
            'reason'         => 'nullable|string',
            'notes'          => 'nullable|string',
        ]);

        $data['moved_by'] = Auth::id();

        return response()->json($this->transactions->moveInstance($instance, $data));
    }

    // =========================================================================
    // ASSIGNMENTS
    // =========================================================================

    public function assignmentsIndex(Request $request): JsonResponse
    {
        $assignments = InventoryAssignment::with(['item', 'instance', 'issuedBy'])
            ->when($request->filled('status'),        fn($q) => $q->where('status', $request->status))
            ->when($request->filled('assignee_type'), fn($q) => $q->where('assignee_type', $request->assignee_type))
            ->when($request->filled('assignee_id'),   fn($q) => $q->where('assignee_id', $request->assignee_id))
            ->when($request->filled('item_id'),       fn($q) => $q->where('item_id', $request->item_id))
            ->when($request->boolean('overdue_only'), fn($q) => $q->overdue())
            ->orderByDesc('issued_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($assignments);
    }

    public function assignmentsShow(int $id): JsonResponse
    {
        $assignment = InventoryAssignment::with([
            'item', 'instance', 'issuedBy', 'receivedBy', 'disputes', 'auditItems',
        ])->findOrFail($id);

        return response()->json($assignment);
    }

    public function assignmentsIssue(Request $request): JsonResponse
    {
        $data = $request->validate([
            'instance_id'          => 'nullable|exists:inventory_instances,id',
            'item_id'              => 'required_without:instance_id|exists:inventory_items,id',
            'quantity'             => 'required_without:instance_id|numeric|min:0.01',
            'assignee_type'        => 'required|in:employee,customer,department,group',
            'assignee_id'          => 'nullable|integer',
            'assignee_label'       => 'required|string|max:255',
            'expected_return_date' => 'nullable|date',
            'issue_condition'      => 'nullable|in:new,excellent,good,fair,poor,damaged,unusable',
            'issue_notes'          => 'nullable|string',
            'location_id'          => 'nullable|exists:inventory_locations,id',
        ]);

        $data['issued_by'] = Auth::id();

        if (! empty($data['instance_id'])) {
            $instance   = InventoryInstance::findOrFail($data['instance_id']);
            $assignment = $this->transactions->issueInstance($instance, $data);
        } else {
            $assignment = $this->transactions->issueBulk($data);
        }

        return response()->json($assignment, 201);
    }

    public function assignmentsLoan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'instance_id'          => 'required|exists:inventory_instances,id',
            'assignee_type'        => 'required|in:employee,customer,department,group',
            'assignee_id'          => 'nullable|integer',
            'assignee_label'       => 'required|string|max:255',
            'expected_return_date' => 'required|date|after:today',
            'issue_condition'      => 'nullable|in:new,excellent,good,fair,poor,damaged,unusable',
            'issue_notes'          => 'nullable|string',
        ]);

        $data['issued_by'] = Auth::id();
        $instance          = InventoryInstance::findOrFail($data['instance_id']);

        return response()->json($this->transactions->loanInstance($instance, $data), 201);
    }

    public function assignmentsDepartment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject_type'  => 'required|in:instance,item',
            'subject_id'    => 'required|integer',
            'department'    => 'required|string|max:255',
            'quantity'      => 'nullable|numeric|min:0.01',
        ]);

        $data['issued_by'] = Auth::id();

        $subject = $data['subject_type'] === 'instance'
            ? InventoryInstance::findOrFail($data['subject_id'])
            : InventoryItem::findOrFail($data['subject_id']);

        return response()->json($this->transactions->allocateToDepartment($subject, $data), 201);
    }

    public function assignmentsGroup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject_type' => 'required|in:instance,item',
            'subject_id'   => 'required|integer',
            'group_id'     => 'required|exists:inventory_groups,id',
            'quantity'     => 'nullable|numeric|min:0.01',
        ]);

        $data['issued_by'] = Auth::id();

        $subject = $data['subject_type'] === 'instance'
            ? InventoryInstance::findOrFail($data['subject_id'])
            : InventoryItem::findOrFail($data['subject_id']);

        return response()->json($this->transactions->allocateToGroup($subject, $data), 201);
    }

    public function assignmentsReturn(Request $request, int $id): JsonResponse
    {
        $assignment = InventoryAssignment::findOrFail($id);

        $data = $request->validate([
            'return_condition'      => 'nullable|in:new,excellent,good,fair,poor,damaged,unusable',
            'return_score_override' => 'nullable|numeric|min:0|max:100',
            'return_notes'          => 'nullable|string',
            'return_discrepancy_notes' => 'nullable|string',
            'location_id'           => 'nullable|exists:inventory_locations,id',
        ]);

        $data['received_by'] = Auth::id();

        return response()->json($this->transactions->returnAssignment($assignment, $data));
    }

    public function assignmentsMarkOverdue(): JsonResponse
    {
        $count = $this->transactions->markOverdueAssignments();
        return response()->json(['marked_overdue' => $count]);
    }

    // =========================================================================
    // GROUPS
    // =========================================================================

    public function groupsIndex(Request $request): JsonResponse
    {
        $groups = InventoryGroup::with('members.member')
            ->when($request->boolean('active_only', true), fn($q) => $q->active())
            ->get();

        return response()->json($groups);
    }

    public function groupsStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:150',
            'description' => 'nullable|string',
            'is_active'   => 'boolean',
        ]);

        $data['created_by'] = Auth::id();

        return response()->json(InventoryGroup::create($data), 201);
    }

    public function groupsUpdate(Request $request, int $id): JsonResponse
    {
        $group = InventoryGroup::findOrFail($id);

        $data = $request->validate([
            'name'        => 'sometimes|string|max:150',
            'description' => 'nullable|string',
            'is_active'   => 'boolean',
        ]);

        $group->update($data);

        return response()->json($group->fresh('members'));
    }

    public function groupsDestroy(int $id): JsonResponse
    {
        InventoryGroup::findOrFail($id)->delete();
        return response()->json(['message' => 'Group deleted.']);
    }

    public function groupsAddMember(Request $request, int $id): JsonResponse
    {
        $group = InventoryGroup::findOrFail($id);

        $data = $request->validate([
            'member_type' => 'required|in:employee,customer',
            'member_id'   => 'required|integer',
            'role_note'   => 'nullable|string|max:255',
        ]);

        $member = InventoryGroupMember::create([
            'group_id'    => $group->id,
            'member_type' => $data['member_type'],
            'member_id'   => $data['member_id'],
            'role_note'   => $data['role_note'] ?? null,
            'added_by'    => Auth::id(),
        ]);

        return response()->json($member->load('member'), 201);
    }

    public function groupsRemoveMember(int $groupId, int $memberId): JsonResponse
    {
        InventoryGroupMember::where('group_id', $groupId)
            ->where('id', $memberId)
            ->firstOrFail()
            ->delete();

        return response()->json(['message' => 'Member removed.']);
    }

    // =========================================================================
    // REPAIRS
    // =========================================================================

    public function repairsIndex(Request $request): JsonResponse
    {
        $repairs = InventoryRepair::with(['instance', 'item'])
            ->when($request->filled('status'),      fn($q) => $q->where('status', $request->status))
            ->when($request->filled('instance_id'), fn($q) => $q->where('instance_id', $request->instance_id))
            ->when($request->boolean('active_only'), fn($q) => $q->active())
            ->when($request->boolean('overdue'),     fn($q) => $q->overdue())
            ->orderByDesc('reported_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($repairs);
    }

    public function repairsShow(int $id): JsonResponse
    {
        return response()->json(
            InventoryRepair::with(['instance', 'item', 'reportedBy', 'disputes'])->findOrFail($id)
        );
    }

    public function repairsReport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'instance_id'       => 'required|exists:inventory_instances,id',
            'fault_category'    => 'required|in:electrical,mechanical,physical,software,wear,unknown',
            'issue_description' => 'required|string',
            'vendor_name'       => 'nullable|string|max:255',
            'estimated_cost'    => 'nullable|numeric|min:0',
            'notes'             => 'nullable|string',
        ]);

        $data['reported_by'] = Auth::id();

        return response()->json($this->operations->reportRepair($data), 201);
    }

    public function repairsSend(Request $request, int $id): JsonResponse
    {
        $repair = InventoryRepair::findOrFail($id);

        $data = $request->validate([
            'vendor_name'          => 'nullable|string|max:255',
            'technician_name'      => 'nullable|string|max:255',
            'repair_location'      => 'nullable|string|max:255',
            'expected_return_date' => 'nullable|date|after:today',
        ]);

        $data['sent_by'] = Auth::id();

        return response()->json($this->operations->sendRepair($repair, $data));
    }

    public function repairsComplete(Request $request, int $id): JsonResponse
    {
        $repair = InventoryRepair::findOrFail($id);

        $data = $request->validate([
            'condition_after'  => 'required|in:new,excellent,good,fair,poor,damaged,unusable',
            'actual_cost'      => 'nullable|numeric|min:0',
            'resolution_notes' => 'nullable|string',
            'location_id'      => 'nullable|exists:inventory_locations,id',
        ]);

        $data['completed_by'] = Auth::id();

        return response()->json($this->operations->completeRepair($repair, $data));
    }

    public function repairsUnrepairable(Request $request, int $id): JsonResponse
    {
        $repair = InventoryRepair::findOrFail($id);

        $data = $request->validate([
            'resolution_notes' => 'nullable|string',
            'actual_cost'      => 'nullable|numeric|min:0',
        ]);

        $data['declared_by'] = Auth::id();

        return response()->json($this->operations->markUnrepairable($repair, $data));
    }

    // =========================================================================
    // DISPUTES
    // =========================================================================

    public function disputesIndex(Request $request): JsonResponse
    {
        $disputes = InventoryDispute::with(['assignment', 'instance', 'item', 'raisedBy'])
            ->when($request->filled('status'),  fn($q) => $q->where('status', $request->status))
            ->when($request->filled('ruling'),  fn($q) => $q->where('ruling', $request->ruling))
            ->when($request->filled('item_id'), fn($q) => $q->where('item_id', $request->item_id))
            ->orderByDesc('raised_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($disputes);
    }

    public function disputesShow(int $id): JsonResponse
    {
        return response()->json(
            InventoryDispute::with(['assignment', 'instance', 'item', 'raisedBy', 'rulingBy', 'repair'])->findOrFail($id)
        );
    }

    public function disputesOpen(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assignment_id'          => 'required|exists:inventory_assignments,id',
            'instance_id'            => 'nullable|exists:inventory_instances,id',
            'item_id'                => 'required|exists:inventory_items,id',
            'dispute_type'           => 'required|in:damage,loss,missing,condition_disagreement,wrong_item,theft',
            'description'            => 'required|string',
            'evidence_notes'         => 'nullable|string',
            'against_assignee_type'  => 'nullable|in:employee,customer,department,group',
            'against_assignee_id'    => 'nullable|integer',
            'against_assignee_label' => 'nullable|string|max:255',
        ]);

        $data['raised_by'] = Auth::id();

        return response()->json($this->operations->openDispute($data), 201);
    }

    public function disputesRule(Request $request, int $id): JsonResponse
    {
        $dispute = InventoryDispute::findOrFail($id);

        $data = $request->validate([
            'ruling'                  => 'required|in:assignee_liable,company_liable,shared,unresolved,dismissed',
            'ruling_notes'            => 'nullable|string',
            'replacement_required'    => 'boolean',
            'replacement_instance_id' => 'nullable|exists:inventory_instances,id',
            'repair_required'         => 'boolean',
            'financial_liability'     => 'nullable|numeric|min:0',
        ]);

        $data['ruling_by'] = Auth::id();

        return response()->json($this->operations->ruleDispute($dispute, $data));
    }

    // =========================================================================
    // RETURN AUDITS
    // =========================================================================

    public function auditsIndex(Request $request): JsonResponse
    {
        $audits = InventoryReturnAudit::with('conductedBy')
            ->when($request->filled('status'),       fn($q) => $q->where('status', $request->status))
            ->when($request->filled('trigger_type'), fn($q) => $q->where('trigger_type', $request->trigger_type))
            ->when($request->filled('assignee_type'), fn($q) =>
                $q->where('assignee_type', $request->assignee_type)
                  ->where('assignee_id', $request->assignee_id)
            )
            ->orderByDesc('audit_date')
            ->paginate($request->integer('per_page', 25));

        return response()->json($audits);
    }

    public function auditsShow(int $id): JsonResponse
    {
        return response()->json(
            InventoryReturnAudit::with(['auditItems.instance', 'auditItems.item', 'conductedBy'])->findOrFail($id)
        );
    }

    public function auditsCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'trigger_type'   => 'required|in:offboarding,scheduled,ad_hoc,dispute',
            'assignee_type'  => 'required|in:employee,customer,department,group',
            'assignee_id'    => 'nullable|integer',
            'assignee_label' => 'required|string|max:255',
            'audit_date'     => 'nullable|date',
            'notes'          => 'nullable|string',
        ]);

        $data['conducted_by'] = Auth::id();

        return response()->json($this->operations->createAudit($data), 201);
    }

    public function auditsRecordItem(Request $request, int $auditId, int $itemId): JsonResponse
    {
        $auditItem = InventoryReturnAuditItem::where('audit_id', $auditId)
            ->where('id', $itemId)
            ->firstOrFail();

        $data = $request->validate([
            'is_returned'       => 'required|boolean',
            'actual_condition'  => 'nullable|in:new,excellent,good,fair,poor,damaged,unusable',
            'score_override'    => 'nullable|numeric|min:0|max:100',
            'discrepancy_notes' => 'nullable|string',
            'disposition'       => 'required|in:accepted,damaged_accepted,missing,replacement_required,written_off,disputed,pending',
        ]);

        return response()->json($this->operations->recordAuditItem($auditItem, $data));
    }

    public function auditsFinalise(Request $request, int $id): JsonResponse
    {
        $audit = InventoryReturnAudit::findOrFail($id);

        $data = $request->validate([
            'score_override'       => 'nullable|numeric|min:0|max:100',
            'auto_process_returns' => 'boolean',
        ]);

        $data['finalised_by'] = Auth::id();

        return response()->json($this->operations->finaliseAudit($audit, $data));
    }

    // =========================================================================
    // LIFECYCLE LEDGER (item-level)
    // =========================================================================

    public function ledgerIndex(Request $request): JsonResponse
    {
        $movements = InventoryLifecycleMovement::with(['item', 'instance', 'performedBy'])
            ->when($request->filled('item_id'),       fn($q) => $q->where('item_id', $request->item_id))
            ->when($request->filled('instance_id'),   fn($q) => $q->where('instance_id', $request->instance_id))
            ->when($request->filled('movement_type'), fn($q) => $q->ofType($request->movement_type))
            ->when($request->filled('from_date'), fn($q) => $q->whereDate('performed_at', '>=', $request->from_date))
            ->when($request->filled('to_date'),   fn($q) => $q->whereDate('performed_at', '<=', $request->to_date))
            ->orderByDesc('performed_at')
            ->paginate($request->integer('per_page', 50));

        return response()->json($movements);
    }

    // =========================================================================
    // EXPORT
    // =========================================================================

    public function exportRun(Request $request): JsonResponse
    {
        $data = $request->validate([
            'export_type'      => 'required|in:items,instances,assignments,lifecycle_movements,location_movements,repairs,audits,disputes,full',
            'columns_included' => 'required|array|min:1',
            'columns_included.*' => 'string',
            'columns_excluded' => 'nullable|array',
            'filters'          => 'nullable|array',
        ]);

        $data['exported_by'] = Auth::id();

        $log = $this->operations->runExport($data);

        return response()->json($log, 201);
    }

    public function exportPresetsIndex(Request $request): JsonResponse
    {
        $presets = InventoryExportPreset::where('user_id', Auth::id())
            ->when($request->filled('export_type'), fn($q) => $q->ofType($request->export_type))
            ->get();

        return response()->json($presets);
    }

    public function exportPresetsSave(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:150',
            'export_type'   => 'required|in:items,instances,assignments,lifecycle_movements,location_movements,repairs,audits,disputes,full',
            'column_config' => 'required|array',
            'filter_config' => 'nullable|array',
            'is_default'    => 'boolean',
        ]);

        $data['user_id'] = Auth::id();

        return response()->json($this->operations->savePreset($data));
    }

    public function exportPresetsDestroy(int $id): JsonResponse
    {
        InventoryExportPreset::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail()
            ->delete();

        return response()->json(['message' => 'Preset deleted.']);
    }

    public function exportLogs(Request $request): JsonResponse
    {
        $logs = InventoryExportLog::with('exportedBy')
            ->when($request->filled('export_type'), fn($q) => $q->ofType($request->export_type))
            ->orderByDesc('exported_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($logs);
    }
}