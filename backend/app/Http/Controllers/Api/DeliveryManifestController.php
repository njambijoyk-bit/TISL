<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\Order;
use App\Models\OrderShipment;
use App\Models\User;
use App\Models\DeliveryIncident;
use App\Models\DriverLocationPing;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class DeliveryManifestController extends Controller
{
    use LogsDeliveryActivity;

    public function __construct(protected AiAnalyticsService $ai) {}

    // ========================================
    // INDEX
    // ========================================

    public function index(Request $request): JsonResponse
    {
        $query = DeliveryManifest::with([
            'driver:id,name,phone,profile_picture',
            'assigner:id,name',
            'items.order.customer',
        ]);

        if ($request->filled('status'))
            $query->where('status', $request->status);

        if ($request->filled('driver_id'))
            $query->where('driver_id', $request->driver_id);

        if ($request->filled('date'))
            $query->whereDate('scheduled_date', $request->date);

        if ($request->filled('search'))
            $query->where('manifest_number', 'like', "%{$request->search}%");

        if ($request->filled('delivery_method'))
            $query->where('delivery_method', $request->delivery_method);

        if ($request->boolean('ai_generated'))
            $query->where('ai_generated', true);

        $sortBy    = $request->input('sort_by', 'scheduled_date');
        $sortOrder = $request->input('sort_order', 'desc');
        if (in_array($sortBy, ['scheduled_date', 'created_at', 'status', 'manifest_number']))
            $query->orderBy($sortBy, $sortOrder);

        $manifests = $query->paginate($request->input('per_page', 20));

        return response()->json($manifests);
    }

    // ========================================
    // STATISTICS
    // ========================================

    public function statistics(): JsonResponse
    {
        $counts = DeliveryManifest::selectRaw("
            COUNT(*)                                        AS total,
            SUM(status = 'draft')                          AS draft,
            SUM(status = 'dispatched')                     AS dispatched,
            SUM(status = 'in_progress')                    AS in_progress,
            SUM(status = 'completed')                      AS completed,
            SUM(status = 'cancelled')                      AS cancelled,
            SUM(ai_generated = 1)                          AS ai_generated,
            ROUND(AVG(NULLIF(total_distance_km, 0)), 2)    AS avg_distance_km,
            ROUND(AVG(NULLIF(actual_duration_minutes, 0)), 0) AS avg_duration_mins
        ")->first();

        $byDriver = DeliveryManifest::select('driver_id', DB::raw('COUNT(*) as count'))
            ->with('driver:id,name')
            ->groupBy('driver_id')
            ->get();

        $byMethod = DeliveryManifest::select('delivery_method', DB::raw('COUNT(*) as count'))
            ->groupBy('delivery_method')
            ->get();

        return response()->json(array_merge(
            $counts->toArray(),
            [
                'by_driver'  => $byDriver,
                'by_method'  => $byMethod,
            ]
        ));
    }

    // ========================================
    // SHOW
    // ========================================

    public function show(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'driver:id,name,phone,profile_picture',
            'assigner:id,name',
            'items.order.customer',
            'items.order.items.product', 
            'items.rating',
            'items.incidents',
            'incidents.reporter:id,name',
            'incidents.accused:id,name',
            'activityLogs.performer:id,name',
        ])->findOrFail($id);

        return response()->json(['data' => $manifest]);
    }

    // ========================================
    // STORE
    // FIX: Added delivery_method, order_numbers support, override_reason,
    //      expanded order status filter, structured error responses
    // ========================================

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id'       => 'nullable|exists:users,id',
            'scheduled_date'  => 'required|date|after_or_equal:today',
            'notes'           => 'nullable|string|max:1000',
            'order_ids'       => 'nullable|array',
            'order_ids.*'     => 'integer|exists:orders,id',
            'order_numbers'   => 'nullable|array',
            'order_numbers.*' => 'string|exists:orders,order_number',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Resolve order_ids from order_numbers if provided
        $orderIds = $request->input('order_ids', []);
        if ($request->filled('order_numbers')) {
            $resolvedIds = Order::whereIn('order_number', $request->order_numbers)
                ->pluck('id')
                ->toArray();
            $orderIds = array_merge($orderIds, $resolvedIds);
            $orderIds = array_unique($orderIds);
        }

        // Validate delivery method requirements
        $deliveryMethod = $request->input('delivery_method', 'internal_driver');

        if ($deliveryMethod === 'internal_driver') {
            if (! $request->filled('driver_id')) {
                return response()->json([
                    'message' => 'Driver is required for internal driver delivery.',
                    'errors'  => ['driver_id' => ['Please select a driver for internal delivery.']],
                ], 422);
            }

            $driver = User::findOrFail($request->driver_id);

            if ($driver->role !== 'driver') {
                return response()->json([
                    'message' => 'Selected user is not a driver.',
                    'errors'  => ['driver_id' => ['The selected user does not have a driver role.']],
                ], 422);
            }

            // Safety check for driver incidents
            if (! empty($orderIds)) {
                $safetyWarning = $this->checkDriverSafetyForOrders($driver, $orderIds);
                if ($safetyWarning && ! $request->filled('override_reason')) {
                    return response()->json([
                        'requires_override' => true,
                        'warning'           => $safetyWarning,
                        'driver_id'         => $driver->id,
                        'driver_name'       => $driver->name,
                    ], 409);
                }
            }
        } else {
            // Non-internal methods: driver is optional
            $driver = $request->filled('driver_id') ? User::find($request->driver_id) : null;
        }

        DB::beginTransaction();
        try {
            $manifestData = [
                'assigned_by'     => Auth::id(),
                'status'          => 'draft',
                'scheduled_date'  => $request->scheduled_date,
                'notes'           => $request->notes,
                'ai_generated'    => false,
                'delivery_method' => $deliveryMethod,
            ];

            // Only include driver_id when explicitly provided
            if ($request->filled('driver_id')) {
                $manifestData['driver_id'] = $request->driver_id;
            }

            $manifest = DeliveryManifest::create($manifestData);

            $skipped = [];
            if (! empty($orderIds)) {
                ['added' => $added, 'skipped' => $skipped] = $this->attachOrders($manifest, $orderIds);
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_created',
                'info',
                [
                    'driver_id'       => $driver?->id,
                    'driver_name'     => $driver?->name,
                    'delivery_method' => $deliveryMethod,
                    'override_reason' => $request->override_reason,
                ]
            );

            DB::commit();

            $response = [
                'message' => 'Manifest created.',
                'data'    => $manifest->load('items.order.customer', 'driver:id,name'),
            ];

            if (! empty($skipped)) {
                $response['skipped_orders'] = $skipped; // structured: [{order_id, reason, manifest_number, ...}]
                $response['skipped_count']  = count($skipped);
            }

            return response()->json($response, 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest create failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to create manifest. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // UPDATE
    // ========================================

    public function update(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be edited.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'scheduled_date'  => 'sometimes|date',
            'notes'           => 'nullable|string|max:1000',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $old = $manifest->only(['scheduled_date', 'notes', 'delivery_method']);
        $manifest->update($request->only(['scheduled_date', 'notes', 'delivery_method']));

        $this->logManifestActivity(
            $manifest->id,
            'manifest_updated',
            'info',
            ['old' => $old, 'new' => $manifest->fresh()->only(['scheduled_date', 'notes', 'delivery_method'])]
        );

        return response()->json(['message' => 'Manifest updated.', 'data' => $manifest->fresh()]);
    }

    // ========================================
    // ADD ITEMS
    // FIX: Added order_numbers support, override_reason, structured errors
    // ========================================

    public function addItems(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('driver')->findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Can only add items to a draft manifest.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'order_ids'       => 'nullable|array',
            'order_ids.*'     => 'integer|exists:orders,id',
            'order_numbers'     => 'nullable|array',
            'order_numbers.*' => 'string|exists:orders,order_number',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Resolve order_ids from order_numbers
        $orderIds = $request->input('order_ids', []);
        if ($request->filled('order_numbers')) {
            $resolvedIds = Order::whereIn('order_number', $request->order_numbers)
                ->pluck('id')
                ->toArray();
            $orderIds = array_merge($orderIds, $resolvedIds);
            $orderIds = array_unique($orderIds);
        }

        if (empty($orderIds)) {
            return response()->json([
                'message' => 'No orders provided.',
                'errors'  => ['orders' => ['Please provide order IDs or order numbers.']],
            ], 422);
        }

        // Safety check for internal driver manifests
        if ($manifest->delivery_method === 'internal_driver' && $manifest->driver) {
            $safetyWarning = $this->checkDriverSafetyForOrders($manifest->driver, $orderIds);
            if ($safetyWarning && ! $request->filled('override_reason')) {
                return response()->json([
                    'requires_override' => true,
                    'warning'           => $safetyWarning,
                    'driver_id'         => $manifest->driver->id,
                    'driver_name'       => $manifest->driver->name,
                ], 409);
            }
        }

        ['added' => $added, 'skipped' => $skipped] = $this->attachOrders($manifest, $orderIds);

        $this->logManifestActivity(
            $manifest->id,
            'items_added',
            'info',
            ['order_ids' => $orderIds, 'added' => $added, 'skipped' => $skipped]
        );

        return response()->json([
            'message'        => "{$added} order(s) added to manifest.",
            'skipped_orders' => $skipped, // structured: [{order_id, reason, manifest_number, ...}]
            'skipped_count'  => count($skipped),
            'data'           => $manifest->load('items.order.customer'),
        ]);
    }

    // ========================================
    // REMOVE ITEM
    // ========================================

    public function removeItem(int $manifestId, int $itemId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Can only remove items from a draft manifest.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $item    = DeliveryItem::where('manifest_id', $manifestId)->findOrFail($itemId);
        $orderId = $item->order_id;
        $item->delete();

        $this->logManifestActivity(
            $manifest->id,
            'item_removed',
            'info',
            ['order_id' => $orderId, 'delivery_item_id' => $itemId]
        );

        return response()->json(['message' => 'Item removed from manifest.']);
    }

    // ========================================
    // DISPATCH
    // ========================================

    public function dispatchManifest(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items.order', 'driver')->findOrFail($id);

        if (! $manifest->canBeDispatched()) {
            return response()->json([
                'message' => 'Manifest cannot be dispatched. Ensure it is in draft and has items.',
                'errors'  => ['status' => ['Manifest must be in draft status with at least one item.']],
            ], 422);
        }

        DB::beginTransaction();
        try {
            $manifest->update([
                'status'        => 'dispatched',
                'dispatched_at' => now(),
            ]);

            foreach ($manifest->items as $item) {
                $item->update(['status' => 'out_for_delivery']);

                $item->order->markAsShipped(
                    $manifest->manifest_number,
                    $this->getCourierLabel($manifest)
                );

                $existingActive = OrderShipment::where('order_id', $item->order_id)
                    ->active()
                    ->exists();

                if (! $existingActive) {
                    OrderShipment::create([
                        'order_id'                => $item->order_id,
                        'workflow'                => $this->getWorkflowType($manifest),
                        'dispatched_by'           => Auth::id(),
                        'driver_id'               => $manifest->driver_id,
                        'manifest_id'             => $manifest->id,
                        'estimated_delivery_date' => $manifest->scheduled_date,
                        'status'                  => 'dispatched',
                    ]);
                } else {
                    OrderShipment::where('order_id', $item->order_id)
                        ->where('manifest_id', $manifest->id)
                        ->update(['status' => 'dispatched', 'driver_id' => $manifest->driver_id]);
                }
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_dispatched',
                'info',
                [
                    'dispatched_by' => Auth::user()->name,
                    'driver'        => $manifest->driver?->name,
                    'item_count'    => $manifest->items->count(),
                    'method'        => $manifest->delivery_method,
                ]
            );

            DB::commit();

            return response()->json([
                'message' => 'Manifest dispatched. All orders marked as shipped.',
                'data'    => $manifest->fresh(['items.order', 'driver:id,name']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest dispatch failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to dispatch manifest.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // CANCEL
    // ========================================

    public function cancel(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items.order')->findOrFail($id);

        if (! $manifest->canBeCancelled()) {
            return response()->json([
                'message' => 'Manifest cannot be cancelled at this stage.',
                'errors'  => ['status' => ['Manifest status does not allow cancellation.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        DB::beginTransaction();
        try {
            $wasDispatched = $manifest->status === 'dispatched';

            $manifest->update(['status' => 'cancelled']);

            if ($wasDispatched) {
                foreach ($manifest->items as $item) {
                    $item->update(['status' => 'pending']);
                    $item->order->update(['status' => 'processing']);
                }

                OrderShipment::where('manifest_id', $manifest->id)
                    ->active()
                    ->update(['status' => 'failed']);
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_cancelled',
                'warning',
                [
                    'reason'       => $request->reason,
                    'cancelled_by' => Auth::user()->name,
                    'was_dispatched' => $wasDispatched,
                ]
            );

            DB::commit();

            return response()->json(['message' => 'Manifest cancelled.']);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest cancel failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to cancel manifest.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // REASSIGN DRIVER
    // ========================================

    public function reassignDriver(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items')->findOrFail($id);

        if (! in_array($manifest->status, ['draft', 'dispatched'])) {
            return response()->json([
                'message' => 'Cannot reassign driver at this stage.',
                'errors'  => ['status' => ['Driver can only be reassigned for draft or dispatched manifests.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'driver_id'       => 'required|exists:users,id',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $newDriver = User::findOrFail($request->driver_id);

        if ($newDriver->role !== 'driver') {
            return response()->json([
                'message' => 'Selected user is not a driver.',
                'errors'  => ['driver_id' => ['The selected user does not have a driver role.']],
            ], 422);
        }

        $orderIds      = $manifest->items->pluck('order_id')->toArray();
        $safetyWarning = $this->checkDriverSafetyForOrders($newDriver, $orderIds);

        if ($safetyWarning && ! $request->filled('override_reason')) {
            return response()->json([
                'requires_override' => true,
                'warning'           => $safetyWarning,
                'driver_id'         => $newDriver->id,
                'driver_name'       => $newDriver->name,
            ], 409);
        }

        $oldDriverId = $manifest->driver_id;
        $manifest->update(['driver_id' => $newDriver->id]);

        OrderShipment::where('manifest_id', $manifest->id)
            ->update(['driver_id' => $newDriver->id]);

        $this->logManifestActivity(
            $manifest->id,
            'driver_reassigned',
            $safetyWarning ? 'warning' : 'info',
            [
                'old_driver_id'   => $oldDriverId,
                'new_driver_id'   => $newDriver->id,
                'new_driver_name' => $newDriver->name,
                'override_reason' => $request->override_reason,
                'safety_warning'  => $safetyWarning,
            ]
        );

        return response()->json([
            'message' => 'Driver reassigned.',
            'data'    => $manifest->fresh('driver:id,name'),
        ]);
    }

    // ========================================
    // TRANSFER ITEMS
    // ========================================

    public function transferItems(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item_ids'                => 'required|array|min:1',
            'item_ids.*'              => 'integer|exists:delivery_items,id',
            'destination_manifest_id' => 'required|integer|exists:delivery_manifests,id',
            'override_reason'         => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $destination = DeliveryManifest::with('items')->findOrFail($request->destination_manifest_id);

        if ($destination->status !== 'draft') {
            return response()->json([
                'message' => 'Destination manifest must be in draft status.',
                'errors'  => ['destination_manifest_id' => ['Destination is not a draft manifest.']],
            ], 422);
        }

        // Fetch items and verify they all come from transferable manifests (draft or cancelled)
        $items = DeliveryItem::with('manifest:id,status,manifest_number')
            ->whereIn('id', $request->item_ids)
            ->get();

        $invalidItems = $items->filter(
            fn($item) => ! in_array($item->manifest?->status, ['draft', 'cancelled'])
        );

        if ($invalidItems->isNotEmpty()) {
            return response()->json([
                'message' => 'One or more items belong to a manifest that cannot be transferred from.',
                'errors'  => [
                    'item_ids' => $invalidItems->map(fn($i) => 
                        "Item #{$i->id} is in a {$i->manifest?->status} manifest ({$i->manifest?->manifest_number})."
                    )->values()->toArray(),
                ],
            ], 422);
        }

        // Also block transferring into the same manifest as source (all same) — catch the obvious mistake
        $sourceManifestIds = $items->pluck('manifest_id')->unique();
        if ($sourceManifestIds->count() === 1 && $sourceManifestIds->first() === $destination->id) {
            return response()->json([
                'message' => 'Source and destination manifest are the same.',
                'errors'  => ['destination_manifest_id' => ['Cannot transfer items to the same manifest.']],
            ], 422);
        }

        // ── DRIVER SAFETY CHECK ─────────────────────────────────────────────
        // Only run for internal_driver manifests that have a driver assigned
        if (
            $destination->delivery_method === 'internal_driver'
            && $destination->driver_id
            && ! $request->filled('override_reason')
        ) {
            $orderIds = $items->pluck('order_id')->toArray();

            $safetyWarning = $this->checkDriverSafetyForOrders($destination->driver, $orderIds);

            if ($safetyWarning) {
                return response()->json([
                    'requires_override' => true,
                    'warning'           => $safetyWarning,
                    'driver_id'         => $destination->driver_id,
                    'driver_name'       => $destination->driver->name,
                ], 409);
            }
        }
        // ───────────────────────────────────────────────────────────────────

        DB::beginTransaction();
        try {
            $lastSortOrder = $destination->items()->max('sort_order') ?? 0;

            foreach ($items as $i => $item) {
                $sourceManifestId = $item->manifest_id;

                $item->update([
                    'manifest_id' => $destination->id,
                    'sort_order'  => $lastSortOrder + $i + 1,
                    // Reset delivery-specific fields so it's clean in the new manifest
                    'status'               => 'pending',
                    'estimated_arrival'    => null,
                    'distance_from_prev_km'   => null,
                    'time_from_prev_minutes'  => null,
                ]);

                $this->logManifestActivity(
                    $destination->id,
                    'item_transferred_in',
                    'info',
                    [
                        'delivery_item_id'    => $item->id,
                        'order_id'            => $item->order_id,
                        'source_manifest_id'  => $sourceManifestId,
                        'transferred_by'      => Auth::user()->name,
                    ]
                );
            }

            // Log on each unique source manifest too
            foreach ($sourceManifestIds as $sourceId) {
                $this->logManifestActivity(
                    $sourceId,
                    'items_transferred_out',
                    'info',
                    [
                        'item_count'              => $items->where('manifest_id', $destination->id)->count(),
                        'destination_manifest_id' => $destination->id,
                        'transferred_by'          => Auth::user()->name,
                    ]
                );
            }

            DB::commit();

            // Reload both the destination and all affected source manifests
            $updatedDestination = DeliveryManifest::with('items.order.customer')->find($destination->id);

            $updatedSources = DeliveryManifest::with('items.order.customer')
                ->whereIn('id', $sourceManifestIds)
                ->get();

            return response()->json([
                'message'     => count($request->item_ids) . ' item(s) transferred successfully.',
                'destination' => $updatedDestination,
                'sources'     => $updatedSources,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest transfer failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Transfer failed. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // DELETE IF EMPTY (NEW)
    // Hard delete a manifest only if it has no items
    // ========================================

    public function deleteIfEmpty(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::withCount('items')->findOrFail($id);

        if ($manifest->items_count > 0) {
            return response()->json([
                'message' => 'Cannot delete manifest with items.',
                'errors'  => ['items' => ['Remove all items before deleting this manifest.']],
            ], 422);
        }

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be deleted.',
                'errors'  => ['status' => ['Manifest must be in draft status to delete.']],
            ], 422);
        }

        $this->logManifestActivity($manifest->id, 'manifest_deleted', 'warning');
        $manifest->forceDelete();

        return response()->json(['message' => 'Manifest deleted permanently.']);
    }

    // ========================================
    // AI: GENERATE MANIFEST
    // ========================================

    public function aiGenerate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id'       => 'nullable|exists:users,id',
            'scheduled_date'  => 'required|date|after_or_equal:today',
            'order_ids'       => 'required|array|min:1',
            'order_ids.*'     => 'integer|exists:orders,id',
            'custom_prompt'   => 'nullable|string|max:500',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        try {
            $output = $this->ai->analyse(
                moduleKey:    'delivery_manifest_generator',
                adminId:      Auth::id(),
                entityId:     null,
                entityType:   'manifest_request',
                outputType:   'recommendation',
                customPrompt: $request->custom_prompt,
                extraData:    [
                    'order_ids'       => $request->order_ids,
                    'driver_id'       => $request->filled('driver_id') ? $request->driver_id : null,
                    'delivery_method' => $request->input('delivery_method', 'internal_driver'),
                ],
            );

            return response()->json([
                'success' => true,
                'output'  => $output,
                'hint'    => 'Review AI suggestion, then call POST /manifests with ai_generated=true to save.',
            ]);

        } catch (\Exception $e) {
            Log::error('AI manifest generation failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // PRINT / EXPORT DATA
    // ========================================

    public function printData(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'driver:id,name,phone',
            'assigner:id,name',
            'items' => fn($q) => $q->orderBy('sort_order'),
            'items.order.customer',
            'items.order.items.product',
        ])->findOrFail($id);

        return response()->json(['data' => $manifest]);
    }

    // ========================================
    // DESTROY (soft delete — draft only)
    // ========================================

    public function destroy(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be deleted.',
                'errors'  => ['status' => ['Manifest must be in draft status.']],
            ], 422);
        }

        $this->logManifestActivity($manifest->id, 'manifest_deleted', 'warning');
        $manifest->delete();

        return response()->json(['message' => 'Manifest deleted.']);
    }

    // ========================================
    // GET ACTIVE DRIVERS WITH SAFETY FLAGS (NEW)
    // ========================================

    public function activeDrivers(Request $request): JsonResponse
    {
        $drivers = User::where('role', 'driver')
            ->where('status', 'active')
            ->select('id', 'name', 'phone', 'profile_picture', 'employee_id')
            ->withCount([
                'deliveryManifests as completed_manifests' => fn($q) => $q->where('status', 'completed'),
                'deliveryManifests as active_manifests' => fn($q) => $q->whereIn('status', ['draft', 'dispatched', 'in_progress']),
            ])
            ->get()
            ->map(function ($driver) {
                return [
                    'driver_id'            => $driver->id,
                    'name'                 => $driver->name,
                    'phone'                => $driver->phone,
                    'profile_picture_url'  => $driver->profile_picture,
                    'employee_id'          => $driver->employee_id,
                    'completed_manifests'  => $driver->completed_manifests,
                    'active_manifests'     => $driver->active_manifests,
                ];
            });

        return response()->json(['data' => $drivers]);
    }

    public function checkDriverSafety(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id' => 'required|integer|exists:users,id',
            'order_ids' => 'required|array',
            'order_ids.*' => 'integer|exists:orders,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $driver = User::findOrFail($request->driver_id);

        if ($driver->role !== 'driver') {
            return response()->json([
                'message' => 'Selected user is not a driver.',
            ], 422);
        }

        $warning = $this->checkDriverSafetyForOrders($driver, $request->order_ids);

        if ($warning) {
            return response()->json([
                'requires_override' => true,
                'warning' => $warning,
                'driver_id' => $driver->id,
                'driver_name' => $driver->name,
            ], 409);
        }

        return response()->json(['safe' => true]);
    }

    // ========================================
    // PRIVATE HELPERS
    // ========================================

    /**
     * Attach orders to a manifest as delivery items.
     * Skips orders already attached to any manifest (active or not).
     * Returns structured skipped entries with manifest_number for UI display.
     */
    private function attachOrders(DeliveryManifest $manifest, array $orderIds): array
    {
        // Fetch existing items with their manifest so we can surface the manifest number
        $existingItems = DeliveryItem::whereIn('order_id', $orderIds)
            ->whereHas('manifest', fn($q) => $q->whereNotIn('status', ['cancelled']))
            ->with('manifest:id,manifest_number,status')
            ->get(['order_id', 'manifest_id']);

        $existingOrderIds = $existingItems->pluck('order_id')->toArray();

        $toAttach  = array_diff($orderIds, $existingOrderIds);
        $lastOrder = $manifest->items()->max('sort_order') ?? 0;
        $added     = 0;

        foreach (array_values($toAttach) as $i => $orderId) {
            DeliveryItem::create([
                'manifest_id' => $manifest->id,
                'order_id'    => $orderId,
                'status'      => 'pending',
                'sort_order'  => $lastOrder + $i + 1,
            ]);
            $added++;
        }

        // Build structured skipped list with reason + manifest reference
        $skipped = $existingItems->map(fn($item) => [
            'order_id'        => $item->order_id,
            'reason'          => 'in_manifest',
            'manifest_number' => $item->manifest?->manifest_number,
            'manifest_status' => $item->manifest?->status,
            'manifest_id'     => $item->manifest_id,
        ])->values()->toArray();

        return ['added' => $added, 'skipped' => $skipped];
    }

    /**
     * Pre-flight eligibility check for a set of order IDs.
     * Returns per-order eligibility with ineligibility reasons including manifest numbers.
     * Used by the frontend order selector before manifest creation.
     */
    public function checkOrderEligibility(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'order_ids'   => 'required|array|min:1',
            'order_ids.*' => 'integer|exists:orders,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $orderIds = $request->input('order_ids');

        // Eligible statuses — must match frontend ELIGIBLE_STATUSES constant
        $eligibleStatuses = ['confirmed', 'processing', 'ready_for_pickup'];

        // Fetch orders with status
        $orders = Order::whereIn('id', $orderIds)
            ->select('id', 'order_number', 'status')
            ->get()
            ->keyBy('id');

        // Find which ones are already in a manifest
        $inManifest = DeliveryItem::whereIn('order_id', $orderIds)
            ->with('manifest:id,manifest_number,status')
            ->get(['order_id', 'manifest_id'])
            ->keyBy('order_id');

        $result = [];

        foreach ($orderIds as $orderId) {
            $order = $orders->get($orderId);
            if (! $order) continue;

            // Check manifest first — takes priority as a reason
            if ($inManifest->has($orderId)) {
                $item = $inManifest->get($orderId);
                $result[] = [
                    'order_id'        => $orderId,
                    'order_number'    => $order->order_number,
                    'eligible'        => false,
                    'reason'          => 'in_manifest',
                    'manifest_number' => $item->manifest?->manifest_number,
                    'manifest_status' => $item->manifest?->status,
                    'manifest_id'     => $item->manifest_id,
                ];
                continue;
            }

            // Check status eligibility
            if (! in_array($order->status, $eligibleStatuses)) {
                $result[] = [
                    'order_id'     => $orderId,
                    'order_number' => $order->order_number,
                    'eligible'     => false,
                    'reason'       => 'status',
                    'status'       => $order->status,
                ];
                continue;
            }

            $result[] = [
                'order_id'     => $orderId,
                'order_number' => $order->order_number,
                'eligible'     => true,
                'reason'       => null,
            ];
        }

        return response()->json(['data' => $result]);
    }

    /**
     * Check for unresolved high/critical incidents between a driver and customers.
     */
    private function checkDriverSafetyForOrders(User $driver, array $orderIds): ?string
    {
        if (empty($orderIds)) return null;

        $customerUserIds = Order::whereIn('orders.id', $orderIds)
            ->join('customers', 'orders.customer_id', '=', 'customers.id')
            ->pluck('customers.user_id')
            ->toArray();

        if (empty($customerUserIds)) return null;

        $incidents = DeliveryIncident::whereIn('severity', ['high', 'critical'])
            ->whereIn('status', ['open', 'under_review'])
            ->betweenMany($driver->id, $customerUserIds)
            ->get();

        if ($incidents->isEmpty()) return null;

        $hasAssault  = $incidents->where('category', 'assault')->isNotEmpty();
        $hasCritical = $incidents->where('severity', 'critical')->isNotEmpty();

        $warning = match (true) {
            $hasAssault  => 'WARNING: This driver has an unresolved assault incident with one or more customers in this manifest.',
            $hasCritical => 'WARNING: This driver has unresolved critical incidents with one or more customers in this manifest.',
            default      => 'WARNING: This driver has unresolved high-severity incidents with customers in this manifest.',
        };

        try {
            $this->ai->analyse(
                moduleKey:  'driver_assignment_safety',
                adminId:    Auth::id(),
                entityId:   $driver->id,
                entityType: 'driver',
                outputType: 'risk',
            );
        } catch (\Exception $e) {
            Log::warning('Safety AI check failed: ' . $e->getMessage());
        }

        return $warning;
    }

    /**
     * Get courier label based on delivery method
     */
    private function getCourierLabel(DeliveryManifest $manifest): string
    {
        return match ($manifest->delivery_method) {
            'internal_driver'  => 'Internal Driver — ' . ($manifest->driver?->name ?? 'Unassigned'),
            'courier'          => 'External Courier Service',
            'customer_pickup'  => 'Customer Self-Pickup',
            'third_party'      => 'Third-Party Delivery Partner',
            default            => 'Internal Driver — ' . ($manifest->driver?->name ?? 'Unassigned'),
        };
    }

    /**
     * Get workflow type for shipment record
     */
    private function getWorkflowType(DeliveryManifest $manifest): string
    {
        return match ($manifest->delivery_method) {
            'internal_driver' => 'internal',
            'courier'         => 'courier',
            'customer_pickup' => 'pickup',
            'third_party'     => 'third_party',
            default           => 'internal',
        };
    }

    /**
     * Admin-facing: Get live GPS pings for a specific manifest
     */
    public function getLivePings(int $manifestId): JsonResponse
    {
        $pings = DriverLocationPing::where('manifest_id', $manifestId)
            ->latest('pinged_at')
            ->limit(100)
            ->get()
            ->map(fn($p) => [
                'lat'   => (float) $p->latitude,
                'lng'   => (float) $p->longitude,
                'speed' => $p->speed_kmh,
                'time'  => $p->pinged_at?->toISOString(),
            ]);

        return response()->json(['data' => $pings]);
    }
}