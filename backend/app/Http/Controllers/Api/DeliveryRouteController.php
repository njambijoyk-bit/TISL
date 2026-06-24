<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\Order;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class DeliveryRouteController extends Controller
{
    use LogsDeliveryActivity;

    public function __construct(protected AiAnalyticsService $ai) {}

    // ========================================
    // ADMIN: Get route plan for editing
    // ========================================

    public function getRoutePlan(int $manifestId): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'items' => fn($q) => $q->orderBy('sort_order'),
            'items.order.customer',
        ])->findOrFail($manifestId);

        $items = $manifest->items->map(function ($item) {
            return [
                'id'                    => $item->id,
                'sort_order'            => $item->sort_order,
                'order_id'              => $item->order_id,
                'order_number'          => $item->order->order_number,
                'customer_name'         => trim("{$item->order->customer->first_name} {$item->order->customer->last_name}"),
                'customer_phone'        => $item->order->customer->phone,
                'shipping_address'      => $item->order->shipping_address,
                'delivery_latitude'     => $item->delivery_latitude,
                'delivery_longitude'    => $item->delivery_longitude,
                'estimated_arrival'     => $item->estimated_arrival,
                'status'                => $item->status,
                'distance_from_prev_km' => $item->distance_from_prev_km,
            ];
        });

        return response()->json([
            'manifest_id'     => $manifest->id,
            'manifest_number' => $manifest->manifest_number,
            'start_latitude'  => $manifest->start_latitude,
            'start_longitude' => $manifest->start_longitude,
            'items'           => $items,
        ]);
    }

    // ========================================
    // ADMIN: Save route plan (locations + sort order)
    // ========================================

    public function saveRoutePlan(Request $request, int $manifestId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Can only edit route for draft manifests.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'items'                      => 'required|array|min:1',
            'items.*.id'                 => 'required|integer|exists:delivery_items,id',
            'items.*.sort_order'         => 'required|integer|min:1',
            'items.*.delivery_latitude'  => 'nullable|numeric|between:-90,90',
            'items.*.delivery_longitude' => 'nullable|numeric|between:-180,180',
            'items.*.estimated_arrival'  => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            foreach ($request->items as $itemData) {
                DeliveryItem::where('id', $itemData['id'])
                    ->where('manifest_id', $manifestId)
                    ->update([
                        'sort_order'         => $itemData['sort_order'],
                        'delivery_latitude'  => $itemData['delivery_latitude'] ?? null,
                        'delivery_longitude' => $itemData['delivery_longitude'] ?? null,
                        'estimated_arrival'  => $itemData['estimated_arrival'] ?? null,
                    ]);
            }

            $this->recalculateLegDistances($manifest->fresh());

            DB::commit();

            return response()->json([
                'message' => 'Route plan saved.',
                'data'    => $manifest->fresh(['items' => fn($q) => $q->orderBy('sort_order')]),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Route plan save failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to save route plan.'], 500);
        }
    }

    // ========================================
    // ADMIN: Auto-optimize route
    // ========================================

    public function optimizeRoute(Request $request, int $manifestId): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'items' => fn($q) => $q->orderBy('sort_order'),
        ])->findOrFail($manifestId);

        $items    = $manifest->items;
        $startLat = $manifest->start_latitude  ?? -4.0435;  // Mombasa fallback
        $startLng = $manifest->start_longitude ?? 39.6682;

        $useAi        = $request->boolean('use_ai', true);
        $optimizedIds = null;

        if ($useAi) {
            try {
                $output = $this->ai->analyse(
                    moduleKey:  'delivery_route_optimiser',
                    adminId:    auth()->id() ?? 0,
                    entityId:   $manifest->id,
                    entityType: 'manifest',
                    outputType: 'recommendation',
                );
                $optimizedIds = $this->parseAiRouteSequence($output->content ?? '');
            } catch (\Exception $e) {
                Log::info('AI route optimization failed, falling back to nearest-neighbour: ' . $e->getMessage());
            }
        }

        if (empty($optimizedIds)) {
            $optimizedIds = $this->nearestNeighbourOptimize($items, $startLat, $startLng);
        }

        $method = ($useAi && !empty($optimizedIds)) ? 'ai' : 'nearest_neighbour';

        DB::beginTransaction();
        try {
            foreach ($optimizedIds as $newOrder => $itemId) {
                DeliveryItem::where('id', $itemId)->update(['sort_order' => $newOrder + 1]);
            }

            $this->recalculateLegDistances($manifest->fresh());

            DB::commit();

            return response()->json([
                'message' => 'Route optimized.',
                'method'  => $method,
                'data'    => $manifest->fresh(['items' => fn($q) => $q->orderBy('sort_order')]),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Optimization failed.'], 500);
        }
    }

    // ========================================
    // DRIVER: Get current route with live position
    // ========================================

    public function getDriverRoute(int $manifestId): JsonResponse
    {
        $driver = auth()->user();

        $manifest = DeliveryManifest::forDriver($driver->id)
            ->with([
                'items' => fn($q) => $q->orderBy('sort_order'),
                'items.order.customer',
            ])
            ->findOrFail($manifestId);

        $items = $manifest->items->map(function ($item) {
            return [
                'id'                    => $item->id,
                'sort_order'            => $item->sort_order,
                'status'                => $item->status,
                'order_number'          => $item->order->order_number,
                'customer_name'         => trim("{$item->order->customer->first_name} {$item->order->customer->last_name}"),
                'customer_phone'        => $item->order->customer->phone,
                'shipping_address'      => $item->order->shipping_address,
                'delivery_latitude'     => $item->delivery_latitude,
                'delivery_longitude'    => $item->delivery_longitude,
                'estimated_arrival'     => $item->estimated_arrival,
                'arrival_latitude'      => $item->arrival_latitude,
                'arrival_longitude'     => $item->arrival_longitude,
                'distance_from_prev_km' => $item->distance_from_prev_km,
            ];
        });

        $latestPing = $manifest->locationPings()->latest('pinged_at')->first();

        return response()->json([
            'manifest_id'     => $manifest->id,
            'manifest_number' => $manifest->manifest_number,
            'status'          => $manifest->status,
            'start_latitude'  => $manifest->start_latitude,
            'start_longitude' => $manifest->start_longitude,
            'driver_position' => $latestPing ? [
                'lat' => (float) $latestPing->latitude,
                'lng' => (float) $latestPing->longitude,
            ] : null,
            'items'           => $items,
        ]);
    }

    // ========================================
    // DRIVER: Optimize own route
    // Only optimizes pending (non-terminal) stops.
    // Delivered/failed stops keep their current sort_order
    // and are pushed after the re-optimized pending sequence.
    // Logged to delivery_activity_logs for audit trail.
    // ========================================

    public function driverOptimizeRoute(Request $request, int $manifestId): JsonResponse
    {
        $driver = auth()->user();

        $manifest = DeliveryManifest::forDriver($driver->id)
            ->with(['items' => fn($q) => $q->orderBy('sort_order')])
            ->whereIn('status', ['dispatched', 'in_progress'])
            ->findOrFail($manifestId);

        // Split items — only reorder pending stops
        $allItems    = $manifest->items;
        $pending     = $allItems->filter(fn($i) => !in_array($i->status, ['delivered', 'failed', 'returned']));
        $terminal    = $allItems->filter(fn($i) =>  in_array($i->status, ['delivered', 'failed', 'returned']));

        if ($pending->isEmpty()) {
            return response()->json(['message' => 'No pending stops to optimize.'], 422);
        }

        // Use driver's current position as start if available,
        // otherwise fall back to manifest start coords, then Mombasa
        $startLat = $request->input('current_lat', $manifest->start_latitude  ?? -4.0435);
        $startLng = $request->input('current_lng', $manifest->start_longitude ?? 39.6682);

        // Nearest-neighbour on pending only (no AI for driver — keeps it fast + predictable)
        $optimizedPendingIds = $this->nearestNeighbourOptimize($pending, (float) $startLat, (float) $startLng);

        // Terminal stops keep their existing sort_orders at the bottom
        // (they're already done — no need to touch them)
        $terminalIds = $terminal->sortBy('sort_order')->pluck('id')->toArray();

        $orderedIds = array_merge($optimizedPendingIds, $terminalIds);

        DB::beginTransaction();
        try {
            foreach ($orderedIds as $newOrder => $itemId) {
                DeliveryItem::where('manifest_id', $manifestId)
                    ->where('id', $itemId)
                    ->update(['sort_order' => $newOrder + 1]);
            }

            $this->recalculateLegDistances($manifest->fresh());

            // Log the optimization so admin can see driver changed their route
            $this->logManifestActivity(
                $manifest->id,
                'driver_route_optimized',
                'info',
                [
                    'driver_id'         => $driver->id,
                    'driver_name'       => $driver->name,
                    'method'            => 'nearest_neighbour',
                    'pending_stops'     => $pending->count(),
                    'start_lat'         => $startLat,
                    'start_lng'         => $startLng,
                    'new_order'         => $optimizedPendingIds,
                ]
            );

            DB::commit();

            // Return the fresh driver route shape (same as getDriverRoute)
            $fresh = $manifest->fresh(['items' => fn($q) => $q->orderBy('sort_order'), 'items.order.customer']);

            $items = $fresh->items->map(fn($item) => [
                'id'                    => $item->id,
                'sort_order'            => $item->sort_order,
                'status'                => $item->status,
                'order_number'          => $item->order->order_number,
                'customer_name'         => trim("{$item->order->customer->first_name} {$item->order->customer->last_name}"),
                'customer_phone'        => $item->order->customer->phone,
                'shipping_address'      => $item->order->shipping_address,
                'delivery_latitude'     => $item->delivery_latitude,
                'delivery_longitude'    => $item->delivery_longitude,
                'estimated_arrival'     => $item->estimated_arrival,
                'arrival_latitude'      => $item->arrival_latitude,
                'arrival_longitude'     => $item->arrival_longitude,
                'distance_from_prev_km' => $item->distance_from_prev_km,
            ]);

            return response()->json([
                'message'         => 'Route optimized for your current position.',
                'method'          => 'nearest_neighbour',
                'stops_optimized' => $pending->count(),
                'items'           => $items,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Driver route optimization failed [manifest:{$manifestId}, driver:{$driver->id}]: " . $e->getMessage());
            return response()->json(['message' => 'Optimization failed. Please try again.'], 500);
        }
    }

    // ========================================
    // DRIVER: Skip a stop (move to end with reason)
    // ========================================

    public function skipStop(Request $request, int $manifestId, int $itemId): JsonResponse
    {
        $driver = auth()->user();

        $manifest = DeliveryManifest::forDriver($driver->id)
            ->whereIn('status', ['dispatched', 'in_progress'])
            ->findOrFail($manifestId);

        $item = DeliveryItem::where('manifest_id', $manifestId)
            ->where('id', $itemId)
            ->whereNotIn('status', ['delivered', 'failed', 'returned'])
            ->firstOrFail();

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $maxOrder = DeliveryItem::where('manifest_id', $manifestId)->max('sort_order');

            $item->update([
                'sort_order'     => $maxOrder + 1,
                'delivery_notes' => ($item->delivery_notes ? $item->delivery_notes . "\n" : '')
                    . "[SKIPPED] " . now()->toDateTimeString() . ": " . $request->reason,
            ]);

            // Re-sort remaining pending items to fill gap
            $remaining = DeliveryItem::where('manifest_id', $manifestId)
                ->whereNotIn('status', ['delivered', 'failed', 'returned'])
                ->orderBy('sort_order')
                ->get();

            foreach ($remaining as $i => $ri) {
                $ri->update(['sort_order' => $i + 1]);
            }

            $this->recalculateLegDistances($manifest->fresh());

            DB::commit();

            return response()->json([
                'message' => 'Stop skipped and re-queued.',
                'data'    => $item->fresh(),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Skip stop failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to skip stop.'], 500);
        }
    }

    // ========================================
    // DRIVER: Reorder remaining stops
    // ========================================

    public function reorderStops(Request $request, int $manifestId): JsonResponse
    {
        $driver = auth()->user();

        $manifest = DeliveryManifest::forDriver($driver->id)
            ->whereIn('status', ['dispatched', 'in_progress'])
            ->findOrFail($manifestId);

        $validator = Validator::make($request->all(), [
            'item_ids'   => 'required|array',
            'item_ids.*' => 'integer|exists:delivery_items,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            foreach ($request->item_ids as $i => $itemId) {
                DeliveryItem::where('manifest_id', $manifestId)
                    ->where('id', $itemId)
                    ->update(['sort_order' => $i + 1]);
            }

            $this->recalculateLegDistances($manifest->fresh());

            DB::commit();

            return response()->json([
                'message' => 'Stops reordered.',
                'data'    => $manifest->fresh(['items' => fn($q) => $q->orderBy('sort_order')]),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to reorder stops.'], 500);
        }
    }

    // ========================================
    // CUSTOMER: Get tracking for their order
    // ========================================

    public function getCustomerTracking(int $orderId): JsonResponse
    {
        $item = DeliveryItem::where('order_id', $orderId)
            ->with([
                'manifest' => fn($q) => $q->with([
                    'driver:id,name,phone',
                    'items' => fn($q2) => $q2->orderBy('sort_order'),
                    'items.order:id,order_number',
                ]),
                'manifest.locationPings' => fn($q) => $q->latest('pinged_at')->limit(100),
            ])
            ->firstOrFail();

        $manifest = $item->manifest;

        $allItems         = $manifest->items;
        $myStopNumber     = $allItems->search(fn($i) => $i->order_id === $orderId) + 1;
        $totalStops       = $allItems->count();

        $currentStopNumber = $allItems
            ->filter(fn($i) => !in_array($i->status, ['delivered', 'failed', 'returned']))
            ->first()?->sort_order ?? $totalStops + 1;

        $routePreview = $allItems->map(fn($i) => [
            'lat'         => $i->delivery_latitude,
            'lng'         => $i->delivery_longitude,
            'stop_number' => $i->sort_order,
            'is_yours'    => $i->order_id === $orderId,
            'status'      => $i->status,
        ])->values();

        $latestPing = $manifest->locationPings->first();

        return response()->json([
            'data' => [
                'manifest_number'     => $manifest->manifest_number,
                'driver_name'         => $manifest->driver?->name,
                'driver_phone'        => $manifest->driver?->phone,
                'your_stop_number'    => $myStopNumber,
                'total_stops'         => $totalStops,
                'current_stop_number' => $currentStopNumber,
                'your_status'         => $item->status,
                'estimated_arrival'   => $item->estimated_arrival,
                'driver_position'     => $latestPing ? [
                    'lat'   => (float) $latestPing->latitude,
                    'lng'   => (float) $latestPing->longitude,
                    'speed' => $latestPing->speed_kmh,
                    'time'  => $latestPing->pinged_at?->toISOString(),
                ] : null,
                'route_preview'       => $routePreview,
            ],
        ]);
    }

    // ========================================
    // PRIVATE HELPERS
    // ========================================

    private function nearestNeighbourOptimize($items, float $startLat, float $startLng): array
    {
        $unvisited  = $items->keyBy('id');
        $ordered    = [];
        $currentLat = $startLat;
        $currentLng = $startLng;

        while ($unvisited->isNotEmpty()) {
            $next = $unvisited->sortBy(function ($item) use ($currentLat, $currentLng) {
                if (!$item->delivery_latitude || !$item->delivery_longitude) {
                    return PHP_FLOAT_MAX;
                }
                return $this->haversine(
                    $currentLat, $currentLng,
                    (float) $item->delivery_latitude,
                    (float) $item->delivery_longitude
                );
            })->first();

            $ordered[]  = $next->id;
            $currentLat = (float) ($next->delivery_latitude  ?? $currentLat);
            $currentLng = (float) ($next->delivery_longitude ?? $currentLng);
            $unvisited->forget($next->id);
        }

        return $ordered;
    }

    private function parseAiRouteSequence(string $aiResponse): ?array
    {
        preg_match_all('/(?:stop|item|id)[\s#:]+(\d+)/i', $aiResponse, $matches);
        if (!empty($matches[1])) {
            return array_map('intval', $matches[1]);
        }

        if (preg_match('/\[.*?\]/s', $aiResponse, $jsonMatch)) {
            $decoded = json_decode($jsonMatch[0], true);
            if (is_array($decoded)) {
                return array_map('intval', $decoded);
            }
        }

        return null;
    }

    private function recalculateLegDistances(DeliveryManifest $manifest): void
    {
        $items   = $manifest->items()->orderBy('sort_order')->get();
        $prevLat = $manifest->start_latitude;
        $prevLng = $manifest->start_longitude;

        foreach ($items as $item) {
            if ($prevLat !== null && $prevLng !== null
                && $item->delivery_latitude && $item->delivery_longitude
            ) {
                $dist = $this->haversine(
                    (float) $prevLat, (float) $prevLng,
                    (float) $item->delivery_latitude,
                    (float) $item->delivery_longitude
                );
                $item->update(['distance_from_prev_km' => round($dist, 2)]);
            }

            $prevLat = $item->delivery_latitude;
            $prevLng = $item->delivery_longitude;
        }
    }

    private function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R    = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a    = sin($dLat / 2) ** 2
              + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}