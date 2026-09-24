<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\OrderShipment;
use App\Models\DriverLocationPing;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class DriverManifestController extends Controller
{
    use LogsDeliveryActivity;

    // ========================================
    // DRIVER: LIST OWN MANIFESTS
    // ========================================

    public function index(Request $request): JsonResponse
    {
        $driver = Auth::user();

        $query = DeliveryManifest::forDriver($driver->id)
            ->with([
                'items.order.customer',
                'items.rating',
            ]);

        if ($request->filled('status'))
            $query->where('status', $request->status);

        if ($request->filled('date'))
            $query->whereDate('scheduled_date', $request->date);

        // Default: show last 7 days + future
        if (! $request->filled('status') && ! $request->filled('date'))
            $query->where('scheduled_date', '>=', now()->subDays(7));

        $manifests = $query->orderByDesc('scheduled_date')->paginate(10);

        return response()->json([
            'data' => $manifests->items(),
            'meta' => [
                'current_page' => $manifests->currentPage(),
                'last_page'    => $manifests->lastPage(),
                'from'         => $manifests->firstItem(),
                'to'           => $manifests->lastItem(),
                'total'        => $manifests->total(),
                'per_page'     => $manifests->perPage(),
            ],
        ]);
    }

    // ========================================
    // DRIVER: VIEW SINGLE MANIFEST
    // ========================================

    public function show(int $id): JsonResponse
    {
        $driver   = Auth::user();
        $manifest = DeliveryManifest::forDriver($driver->id)
            ->with([
                'items' => fn($q) => $q->orderBy('sort_order'),
                'items.order.customer',
                'items.order.items.product',
                'items.rating',
            ])
            ->findOrFail($id);

        // Enrich each item with customer contact (driver needs this for delivery)
        // NOTE: presentation logic — consider moving to an API Resource if response
        //       shapes proliferate across driver-facing endpoints
        $manifest->items->each(function ($item) {
            $customer = $item->order->customer;
            $item->setRelation('customer_contact', (object) [
                'name'    => $customer ? trim("{$customer->first_name} {$customer->last_name}") : null,
                'phone'   => $customer?->phone,
                'address' => $item->order->shipping_address,
            ]);
        });

        return response()->json(['data' => $manifest]);
    }

    // ========================================
    // DRIVER: START TRIP
    // ========================================

    public function startTrip(Request $request, int $id): JsonResponse
    {
        $driver   = Auth::user();
        $manifest = DeliveryManifest::forDriver($driver->id)->findOrFail($id);

        if ($manifest->status !== 'dispatched')
            return response()->json(['message' => 'Manifest is not in dispatched state.'], 422);

        $validator = Validator::make($request->all(), [
            'latitude'  => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $manifest->update([
            'status'          => 'in_progress',
            'started_at'      => now(),
            'start_latitude'  => $request->latitude,
            'start_longitude' => $request->longitude,
        ]);

        // First ping
        DriverLocationPing::create([
            'driver_id'   => $driver->id,
            'manifest_id' => $manifest->id,
            'latitude'    => $request->latitude,
            'longitude'   => $request->longitude,
            'accuracy'    => $request->accuracy,
            'pinged_at'   => now(),
        ]);

        $this->logManifestActivity(
            $manifest->id,
            'trip_started',
            'info',
            ['latitude' => $request->latitude, 'longitude' => $request->longitude]
        );

        return response()->json(['message' => 'Trip started.', 'data' => $manifest->fresh()]);
    }

    // ========================================
    // DRIVER: GPS PING (every 15 seconds)
    // Route should be throttled in routes/api.php:
    //   Route::middleware('throttle:240,1')->post('ping', ...)
    //   (240/min = 4/s ceiling — well above 1 per 15s normal cadence)
    // ========================================

    public function ping(Request $request): JsonResponse
    {
        $driver = Auth::user();

        $validator = Validator::make($request->all(), [
            'manifest_id' => 'required|integer|exists:delivery_manifests,id',
            'latitude'    => 'required|numeric|between:-90,90',
            'longitude'   => 'required|numeric|between:-180,180',
            'accuracy'    => 'nullable|numeric',
            'speed'       => 'nullable|numeric',
            'heading'     => 'nullable|numeric',
            'pinged_at'   => 'nullable|date',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $manifest = DeliveryManifest::where('id', $request->manifest_id)
            ->where('driver_id', $driver->id)
            ->where('status', 'in_progress')
            ->first();

        if (! $manifest)
            return response()->json(['message' => 'No active manifest found.'], 404);

        DriverLocationPing::create([
            'driver_id'   => $driver->id,
            'manifest_id' => $manifest->id,
            'latitude'    => $request->latitude,
            'longitude'   => $request->longitude,
            'accuracy'    => $request->accuracy,
            'speed'       => $request->speed,
            'heading'     => $request->heading,
            'pinged_at'   => $request->pinged_at ?? now(),
        ]);

        // Lightweight — driver phone hits this every 15s
        return response()->json(['ok' => true], 200);
    }

    // ========================================
    // DRIVER: Get own location ping trail for a manifest
    // Used by route map to draw the live trail client-side
    // ========================================

    public function myPings(int $manifestId): JsonResponse
    {
        $driver   = Auth::user();
        $manifest = DeliveryManifest::forDriver($driver->id)->findOrFail($manifestId);

        $pings = DriverLocationPing::where('manifest_id', $manifest->id)
            ->where('driver_id', $driver->id)
            ->orderBy('pinged_at')
            ->get(['latitude', 'longitude', 'speed', 'heading', 'pinged_at'])
            ->map(fn($p) => [
                'lat'     => (float) $p->latitude,
                'lng'     => (float) $p->longitude,
                'speed'   => $p->speed_kmh,   // uses the accessor — m/s → km/h
                'heading' => $p->heading ? (float) $p->heading : null,
                'time'    => $p->pinged_at?->toISOString(),
            ]);

        return response()->json(['data' => $pings]);
    }

    // ========================================
    // DRIVER: UPDATE STOP STATUS
    // FIX: proof of delivery now handled inside the transaction to prevent
    //      orphaned files on disk if the DB rolls back
    // FIX: completeManifest() now correctly splits delivered vs failed shipments
    // ========================================

    public function updateStop(Request $request, int $itemId): JsonResponse
    {
        $driver = Auth::user();

        $item = DeliveryItem::whereHas('manifest', fn($q) =>
            $q->where('driver_id', $driver->id)->whereIn('status', ['dispatched', 'in_progress'])
        )->findOrFail($itemId);

        $validator = Validator::make($request->all(), [
            'status'             => 'required|in:out_for_delivery,delivered,failed',
            'delivery_notes'     => 'nullable|string|max:1000',
            'failed_reason'      => 'required_if:status,failed|nullable|string|max:500',
            'latitude'           => 'nullable|numeric|between:-90,90',
            'longitude'          => 'nullable|numeric|between:-180,180',
            'proof_of_delivery'  => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        DB::beginTransaction();
        try {
            // FIX: file stored inside the transaction so a DB rollback
            // can be followed by a Storage::delete cleanup — no orphaned files
            $proofPath = null;
            if ($request->hasFile('proof_of_delivery')) {
                $proofPath = $request->file('proof_of_delivery')
                    ->store("delivery/proof/{$item->manifest_id}", 'public');
            }

            if ($request->status === 'delivered') {
                $item->markDelivered(
                    lat:   $request->latitude,
                    lng:   $request->longitude,
                    notes: $request->delivery_notes,
                    proof: $proofPath,
                );
            } elseif ($request->status === 'failed') {
                $item->markFailed(
                    reason: $request->failed_reason,
                    lat:    $request->latitude,
                    lng:    $request->longitude,
                );
            } else {
                $item->update([
                    'status'         => $request->status,
                    'delivery_notes' => $request->delivery_notes,
                ]);
            }

            $this->calculateLegStats($item);

            $manifest = $item->manifest;
            $allDone  = $manifest->items()
                ->whereNotIn('status', ['delivered', 'failed', 'returned'])
                ->doesntExist();

            if ($allDone) {
                $this->completeManifest($manifest);
            }

            $this->logDeliveryItemActivity(
                $item->id,
                'stop_' . $request->status,
                $request->status === 'failed' ? 'warning' : 'info',
                [
                    'driver_id'     => $driver->id,
                    'order_id'      => $item->order_id,
                    'failed_reason' => $request->failed_reason,
                    'has_proof'     => ! is_null($proofPath),
                ]
            );

            DB::commit();

            return response()->json([
                'message' => 'Stop updated.',
                'data'    => $item->fresh(['order.customer', 'rating']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();

            // Clean up the uploaded file if DB failed
            if ($proofPath) {
                Storage::disk('public')->delete($proofPath);
            }

            Log::error('Stop update failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update stop.'], 500);
        }
    }

    // ========================================
    // DRIVER: REPLACE PROOF OF DELIVERY PHOTO
    // Only allowed on delivered items belonging to an in_progress or completed manifest
    // ========================================

    public function updateProof(Request $request, int $itemId): JsonResponse
    {
        $driver = Auth::user();

        $item = DeliveryItem::whereHas('manifest', fn($q) =>
            $q->where('driver_id', $driver->id)->whereIn('status', ['in_progress', 'completed'])
        )->findOrFail($itemId);

        if ($item->status !== 'delivered') {
            return response()->json([
                'message' => 'Proof can only be replaced on delivered stops.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'proof_of_delivery' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        DB::beginTransaction();
        try {
            // Store new file first
            $newPath = $request->file('proof_of_delivery')
                ->store("delivery/proof/{$item->manifest_id}", 'public');

            // Delete old file if one exists
            $oldPath = $item->proof_of_delivery;
            if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }

            $item->update(['proof_of_delivery' => $newPath]);

            $this->logDeliveryItemActivity(
                $item->id,
                'proof_replaced',
                'info',
                [
                    'driver_id' => $driver->id,
                    'old_path'  => $oldPath,
                    'new_path'  => $newPath,
                ]
            );

            DB::commit();

            return response()->json([
                'message'           => 'Proof of delivery updated.',
                'proof_of_delivery' => Storage::disk('public')->url($newPath),
                'data'              => $item->fresh(['order.customer', 'rating']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            if (isset($newPath)) {
                Storage::disk('public')->delete($newPath);
            }
            Log::error('Proof update failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update proof.'], 500);
        }
    }

    // ========================================
    // DRIVER: RETRY A FAILED STOP
    // Allows driver to re-attempt a failed/returned item while the
    // manifest is still in_progress. They can re-mark it as delivered or failed.
    // ========================================

    public function retryStop(Request $request, int $itemId): JsonResponse
    {
        $driver = Auth::user();

        $item = DeliveryItem::whereHas('manifest', fn($q) =>
            $q->where('driver_id', $driver->id)->where('status', 'in_progress')
        )->findOrFail($itemId);

        if (! in_array($item->status, ['failed', 'returned'])) {
            return response()->json([
                'message' => 'Only failed or returned stops can be retried.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'status'            => 'required|in:delivered,failed',
            'delivery_notes'    => 'nullable|string|max:1000',
            'failed_reason'     => 'required_if:status,failed|nullable|string|max:500',
            'latitude'          => 'nullable|numeric|between:-90,90',
            'longitude'         => 'nullable|numeric|between:-180,180',
            'proof_of_delivery' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        DB::beginTransaction();
        try {
            $proofPath = null;
            if ($request->hasFile('proof_of_delivery')) {
                $proofPath = $request->file('proof_of_delivery')
                    ->store("delivery/proof/{$item->manifest_id}", 'public');
            }

            if ($request->status === 'delivered') {
                $item->markDelivered(
                    lat:   $request->latitude,
                    lng:   $request->longitude,
                    notes: $request->delivery_notes,
                    proof: $proofPath,
                );
            } else {
                $item->markFailed(
                    reason: $request->failed_reason,
                    lat:    $request->latitude,
                    lng:    $request->longitude,
                );
            }

            // Re-check if all stops are now resolved (retry may complete the manifest)
            $manifest = $item->manifest;
            $allDone  = $manifest->items()
                ->whereNotIn('status', ['delivered', 'failed', 'returned'])
                ->doesntExist();

            if ($allDone) {
                $this->completeManifest($manifest);
            }

            $this->logDeliveryItemActivity(
                $item->id,
                'stop_retried_' . $request->status,
                $request->status === 'failed' ? 'warning' : 'info',
                [
                    'driver_id'     => $driver->id,
                    'order_id'      => $item->order_id,
                    'failed_reason' => $request->failed_reason,
                    'has_proof'     => ! is_null($proofPath),
                ]
            );

            DB::commit();

            return response()->json([
                'message' => 'Stop retry recorded.',
                'data'    => $item->fresh(['order.customer', 'rating']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            if ($proofPath) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($proofPath);
            }
            Log::error('Stop retry failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to retry stop.'], 500);
        }
    }

    // ========================================
    // DRIVER: VIEW OWN RATINGS
    // ========================================

    public function myRatings(Request $request): JsonResponse
    {
        $driver = Auth::user();

        $ratings = \App\Models\DeliveryRating::forDriver($driver->id)
            ->visibleToDriver()
            ->with('order:id,order_number', 'customer:id,first_name,last_name')
            ->orderByDesc('created_at')
            ->paginate(20);

        $overall = \App\Models\DriverRatingAdjustment::overallRatingFor($driver->id);

        return response()->json([
            'overall_rating' => $overall,
            'ratings'        => $ratings,
        ]);
    }

    // ========================================
    // PRIVATE HELPERS
    // ========================================

    private function calculateLegStats(DeliveryItem $item): void
    {
        if (! $item->arrival_latitude || ! $item->arrival_longitude) return;

        $prev = DeliveryItem::where('manifest_id', $item->manifest_id)
            ->where('sort_order', '<', $item->sort_order)
            ->whereNotNull('arrival_latitude')
            ->orderByDesc('sort_order')
            ->first();

        if (! $prev) return;

        $timeDiff = $prev->delivered_at && $item->delivered_at
            ? (int) $prev->delivered_at->diffInMinutes($item->delivered_at)
            : null;

        $dist = $this->haversine(
            (float) $prev->arrival_latitude,
            (float) $prev->arrival_longitude,
            (float) $item->arrival_latitude,
            (float) $item->arrival_longitude,
        );

        $item->update([
            'distance_from_prev_km'  => round($dist, 2),
            'time_from_prev_minutes' => $timeDiff,
        ]);
    }

    /**
     * Complete a manifest once all stops are resolved.
     *
     * Any item still in 'failed' status is promoted to 'returned' before the
     * manifest is sealed — this is the single moment where the driver hands
     * undelivered goods back, so 'returned' is the correct terminal state.
     * 'failed' then means "attempted but not yet accounted for", while
     * 'returned' means "confirmed back with us, ready to re-assign".
     */
    private function completeManifest(DeliveryManifest $manifest): void
    {
        // Promote any lingering failed items to returned before sealing
        $manifest->items()
            ->where('status', 'failed')
            ->update([
                'status'      => 'returned',
                'returned_at' => now(),
            ]);

        $totalKm  = $manifest->calculateDistanceFromPings();
        $duration = $manifest->started_at
            ? (int) $manifest->started_at->diffInMinutes(now())
            : null;

        $lastPing = $manifest->locationPings()->orderByDesc('pinged_at')->first();

        $manifest->update([
            'status'                  => 'completed',
            'completed_at'            => now(),
            'total_distance_km'       => $totalKm,
            'actual_duration_minutes' => $duration,
            'end_latitude'            => $lastPing?->latitude,
            'end_longitude'           => $lastPing?->longitude,
        ]);

        // Reload items after the status promotion above
        $manifest->load('items');

        $deliveredOrderIds = $manifest->items
            ->where('status', 'delivered')
            ->pluck('order_id');

        $returnedOrderIds = $manifest->items
            ->where('status', 'returned')
            ->pluck('order_id');

        if ($deliveredOrderIds->isNotEmpty()) {
            OrderShipment::where('manifest_id', $manifest->id)
                ->whereIn('order_id', $deliveredOrderIds)
                ->update(['status' => 'delivered', 'delivered_at' => now()]);
        }

        if ($returnedOrderIds->isNotEmpty()) {
            OrderShipment::where('manifest_id', $manifest->id)
                ->whereIn('order_id', $returnedOrderIds)
                ->update(['status' => 'failed']);
        }

        $this->logManifestActivity(
            $manifest->id,
            'manifest_completed',
            'info',
            [
                'total_distance_km'       => $totalKm,
                'actual_duration_minutes' => $duration,
                'stops_total'             => $manifest->items->count(),
                'stops_delivered'         => $deliveredOrderIds->count(),
                'stops_returned'          => $returnedOrderIds->count(),
            ]
        );
    }

    /**
     * Haversine great-circle distance in km.
     *
     * NOTE: This is duplicated from DeliveryManifest model.
     * TODO: Extract to App\Support\GeoHelper::haversine() and reference from both.
     */
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