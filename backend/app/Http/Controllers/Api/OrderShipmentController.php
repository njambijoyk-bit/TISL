<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryItem;
use App\Models\DriverLocationPing;
use App\Services\Delivery\DeliveryStopService;
use Illuminate\Http\JsonResponse;

// ============================================================
// Customer-facing delivery tracking.
// There is no separate shipment record any more: the manifest stop that carries the customer's Delivery Note is the
// shipment. {orderId} is the customer's document: the Delivery Note, or the Sales Order / invoice it belongs to.
// ============================================================
class OrderShipmentController extends Controller
{
    public function __construct(protected DeliveryStopService $stops) {}

    /** The live stop (on a dispatched, started or finished manifest) for a customer's document. */
    private function stopFor(int $orderId): ?DeliveryItem
    {
        $noteIds = $this->stops->noteIdsFor($orderId, auth()->user());

        return DeliveryItem::whereHas('notes', fn ($q) => $q->whereIn('voucher_id', $noteIds))
            ->whereHas('manifest', fn ($q) => $q->whereNotIn('status', ['draft', 'cancelled']))
            ->with(['manifest.driver:id,name'])
            ->latest('id')
            ->first();
    }

    /** Customer-facing: shipment info for their order — no internal fields exposed */
    public function showForOrder(int $orderId): JsonResponse
    {
        $item = $this->stopFor($orderId);
        abort_unless($item, 404, 'No delivery for this order yet.');
        $m = $item->manifest;

        $workflow = match ($m->delivery_method) {
            'courier' => 'external_courier', 'customer_pickup' => 'instore', 'third_party' => 'external_courier', default => 'internal',
        };
        $status = match (true) {
            $item->status === 'delivered'                            => 'delivered',
            in_array($item->status, ['failed', 'returned'], true)    => 'failed',
            $m->status === 'in_progress'                             => 'in_transit',
            default                                                  => 'dispatched',
        };
        $internal = $m->delivery_method === 'internal_driver';

        return response()->json([
            'data' => [
                'workflow'                => $workflow,
                'workflow_label'          => $this->label($m->delivery_method),
                'status'                  => $status,
                'status_label'            => ucfirst(str_replace('_', ' ', $status)),
                'courier_name'            => null,
                'tracking_number'         => $m->manifest_number,
                'tracking_url'            => null,
                'estimated_delivery_date' => $m->scheduled_date,
                'delivered_at'            => $item->delivered_at,
                'driver_name'             => $internal ? $m->driver?->name : null,
                'driver_id'               => $internal ? $m->driver_id : null,
                'manifest_id'             => $m->id,
                'delivery_item_id'        => $item->id,

                'your_stop_number'        => $item->sort_order,
                'your_status'             => $item->status,
                'delivery_notes'          => $item->delivery_notes,
                'failed_reason'           => $item->failed_reason,
                'proof_of_delivery_url'   => $item->proof_of_delivery_url,
                'your_stop_lat'           => $item->delivery_latitude  ? (float) $item->delivery_latitude  : null,
                'your_stop_lng'           => $item->delivery_longitude ? (float) $item->delivery_longitude : null,
            ],
        ]);
    }

    /** Customer-facing: live GPS pings while their stop is on a trip that is under way. */
    public function getLivePings(int $orderId): JsonResponse
    {
        $item = $this->stopFor($orderId);
        if (! $item || $item->manifest->delivery_method !== 'internal_driver' || ! in_array($item->manifest->status, ['dispatched', 'in_progress'], true)) {
            return response()->json(['data' => []]);
        }

        $pings = DriverLocationPing::where('manifest_id', $item->manifest_id)
            ->latest('pinged_at')
            ->limit(100)
            ->get()
            ->map(fn ($p) => [
                'lat'   => (float) $p->latitude,
                'lng'   => (float) $p->longitude,
                'speed' => $p->speed_kmh,
                'time'  => $p->pinged_at?->toISOString(),
            ]);

        return response()->json(['data' => $pings]);
    }

    private function label(?string $method): string
    {
        return match ($method) {
            'courier' => 'External courier', 'customer_pickup' => 'Customer pick-up', 'third_party' => 'Third-party delivery', default => 'Our driver',
        };
    }
}
