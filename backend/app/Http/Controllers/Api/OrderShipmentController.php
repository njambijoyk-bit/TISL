<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\Order;
use App\Models\OrderShipment;
use App\Models\DeliveryIncident;
use App\Models\DeliveryRating;
use App\Models\DriverRatingAdjustment;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\DriverLocationPing;
use App\Models\User;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

// ============================================================
// OrderShipmentController
// Handles all 3 workflows: internal, external_courier, instore
// ============================================================
class OrderShipmentController extends Controller
{
    use LogsDeliveryActivity;

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'order_id'                => 'required|exists:orders,id',
            'workflow'                => 'required|in:internal,external_courier,instore',
            'courier_name'            => 'required_if:workflow,external_courier|nullable|string|max:100',
            'tracking_number'         => 'nullable|string|max:255',
            'tracking_url'            => 'nullable|url|max:500',
            'driver_id'               => 'required_if:workflow,internal|nullable|exists:users,id',
            'estimated_delivery_date' => 'nullable|date',
            'notes'                   => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $order = Order::findOrFail($request->order_id);

        // Prevent duplicate active shipments
        if (OrderShipment::where('order_id', $order->id)
            ->active()
            ->exists()) {
            return response()->json(['message' => 'Order already has an active shipment.'], 422);
        }

        DB::beginTransaction();
        try {
            $shipment = OrderShipment::create([
                'order_id'                => $order->id,
                'workflow'                => $request->workflow,
                'dispatched_by'           => Auth::id(),
                'driver_id'               => $request->driver_id,
                'courier_name'            => $request->courier_name,
                'tracking_number'         => $request->tracking_number,
                'tracking_url'            => $request->tracking_url,
                'estimated_delivery_date' => $request->estimated_delivery_date,
                'notes'                   => $request->notes,
                'status'                  => 'dispatched',
            ]);

            if ($request->workflow === 'instore') {
                $order->update(['status' => 'ready_for_pickup']);
            } else {
                $order->markAsShipped(
                    $request->tracking_number ?? 'N/A',
                    $request->courier_name ?? ($request->workflow === 'internal' ? 'Internal Driver' : 'N/A')
                );
            }

            $this->logShipmentActivity(
                $shipment->id,
                'shipment_created',
                'info',
                [
                    'workflow'        => $request->workflow,
                    'order_number'    => $order->order_number,
                    'dispatched_by'   => Auth::user()->name,
                    'courier_name'    => $request->courier_name,
                    'tracking_number' => $request->tracking_number,
                ]
            );

            DB::commit();

            return response()->json([
                'message' => 'Shipment created.',
                'data'    => $shipment->fresh(['dispatcher:id,name', 'driver:id,name']),
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Shipment create failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create shipment.'], 500);
        }
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $shipment = OrderShipment::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'tracking_number'         => 'nullable|string|max:255',
            'tracking_url'            => 'nullable|url|max:500',
            'courier_name'            => 'nullable|string|max:100',
            'estimated_delivery_date' => 'nullable|date',
            'status'                  => 'nullable|in:dispatched,in_transit,delivered,failed',
            'notes'                   => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $old = $shipment->only(['status', 'tracking_number', 'courier_name']);

        $shipment->update($request->only([
            'tracking_number', 'tracking_url', 'courier_name',
            'estimated_delivery_date', 'status', 'notes',
        ]));

        // Sync order when status transitions to delivered
        if ($request->status === 'delivered' && $old['status'] !== 'delivered') {
            $shipment->update(['delivered_at' => now()]);
            $shipment->order->markAsDelivered();
        }

        $this->logShipmentActivity(
            $shipment->id,
            'shipment_updated',
            'info',
            ['old' => $old, 'new' => $request->only(['status', 'tracking_number'])]
        );

        return response()->json(['message' => 'Shipment updated.', 'data' => $shipment->fresh()]);
    }

    /** Customer-facing: shipment info for their order — no internal fields exposed */
    public function showForOrder(int $orderId): JsonResponse
    {
        $shipment = OrderShipment::where('order_id', $orderId)
            ->with(['driver:id,name'])
            ->latest()
            ->firstOrFail();

        // Get the associated delivery item for this order's internal shipment
        $deliveryItem   = null;
        $deliveryItemId = null;

        if ($shipment->manifest_id) {
            $deliveryItem = \App\Models\DeliveryItem::where('manifest_id', $shipment->manifest_id)
                ->whereHas('order', fn($q) => $q->where('id', $orderId))
                ->first();
            $deliveryItemId = $deliveryItem?->id;
        }

        return response()->json([
            'data' => [
                'workflow'                => $shipment->workflow,
                'workflow_label'          => $shipment->workflow_label,
                'status'                  => $shipment->status,
                'status_label'            => $shipment->status_label,
                'courier_name'            => $shipment->courier_name,
                'tracking_number'         => $shipment->tracking_number,
                'tracking_url'            => $shipment->tracking_url,
                'estimated_delivery_date' => $shipment->estimated_delivery_date,
                'delivered_at'            => $deliveryItem?->delivered_at ?? $shipment->delivered_at,
                'driver_name'             => $shipment->isInternal() ? $shipment->driver?->name : null,
                'driver_id'               => $shipment->isInternal() ? $shipment->driver_id : null,
                'manifest_id'             => $shipment->manifest_id,
                'delivery_item_id'        => $deliveryItemId,

                // ── Delivery item fields (null for non-internal or pre-dispatch) ──
                'your_stop_number'        => $deliveryItem?->sort_order,
                'your_status'             => $deliveryItem?->status,
                'delivery_notes'          => $deliveryItem?->delivery_notes,
                'failed_reason'           => $deliveryItem?->failed_reason,
                'proof_of_delivery_url'   => $deliveryItem?->proof_of_delivery_url,
                'your_stop_lat'           => $deliveryItem?->delivery_latitude  ? (float) $deliveryItem->delivery_latitude  : null,
                'your_stop_lng'           => $deliveryItem?->delivery_longitude ? (float) $deliveryItem->delivery_longitude : null,
            ],
        ]);
    }

    /**
     * Customer-facing: Get live GPS pings for their order's internal shipment
     */
    public function getLivePings(int $orderId): JsonResponse
    {
        // Find the active internal shipment for this order
        $shipment = OrderShipment::where('order_id', $orderId)
            ->where('workflow', 'internal')
            ->whereIn('status', ['dispatched', 'in_transit'])
            ->latest()
            ->first();

        if (!$shipment || !$shipment->manifest_id) {
            return response()->json(['data' => []]);
        }

        $pings = DriverLocationPing::where('manifest_id', $shipment->manifest_id)
            ->latest('pinged_at')
            ->limit(100) // Get last 100 pings to draw the trail
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
