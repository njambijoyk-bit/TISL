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
// DeliveryStatsController
// FIX: overview() and statistics() rewritten to use aggregated queries
//      instead of N+1 separate COUNT calls
// FIX: driverPerformance() wrapped in cache to avoid 200+ queries per request
// FIX: locationTrail() now checks caller is admin or the manifest's own driver
// ============================================================
class DeliveryStatsController extends Controller
{
    public function __construct(protected AiAnalyticsService $ai) {}

    public function overview(): JsonResponse
    {
        // FIX: single aggregated query instead of ~6 separate counts
        $manifestStats = DeliveryManifest::selectRaw("
            COUNT(*)                                           AS total,
            SUM(status = 'completed')                         AS completed,
            SUM(status IN ('dispatched','in_progress'))       AS active,
            ROUND(AVG(NULLIF(total_distance_km, 0)), 2)       AS avg_distance_km,
            ROUND(AVG(NULLIF(actual_duration_minutes, 0)), 0) AS avg_duration_mins
        ")->first();

        $manifestCompletionRate = $this->manifestCompletionRate();

        // FIX: single aggregated query for delivery item counts
        $deliveryStats = DeliveryItem::selectRaw("
            COUNT(*)                                              AS total,
            SUM(status = 'delivered')                            AS delivered,
            SUM(status = 'failed')                               AS failed,
            SUM(status = 'returned')                             AS returned,
            ROUND(AVG(NULLIF(time_from_prev_minutes, 0)), 0)    AS avg_time_per_stop
        ")->first();

        $failedReasons = DeliveryItem::where('status', 'failed')
            ->select('failed_reason', DB::raw('COUNT(*) as count'))
            ->groupBy('failed_reason')
            ->orderByDesc('count')
            ->get();

        // FIX: single aggregated query for incident counts
        $incidentStats = DeliveryIncident::selectRaw("
            COUNT(*)                         AS total,
            SUM(status = 'open')             AS open,
            SUM(severity = 'critical')       AS critical
        ")->first();

        $incidentsByCategory = DeliveryIncident::select('category', DB::raw('COUNT(*) as count'))
            ->groupBy('category')
            ->get();

        // FIX: single aggregated query for shipment workflow counts
        $shipmentStats = OrderShipment::selectRaw("
            SUM(workflow = 'internal')         AS internal,
            SUM(workflow = 'external_courier') AS external_courier,
            SUM(workflow = 'instore')          AS instore
        ")->first();

        return response()->json([
            'manifests' => array_merge($manifestStats->toArray(), [
                'completion_rate' => $manifestCompletionRate,
            ]),
            'deliveries' => array_merge($deliveryStats->toArray(), [
                'on_time_rate'  => $this->onTimeRate(),
                'failed_reasons'=> $failedReasons,
            ]),
            'incidents' => array_merge($incidentStats->toArray(), [
                'by_category' => $incidentsByCategory,
            ]),
            'shipments' => $shipmentStats->toArray(),
        ]);
    }

    /**
     * All-driver performance table.
     *
     * FIX: wrapped in a 5-minute cache to avoid N×10 queries per page load.
     * For real-time needs, consider a nightly materialised summary table instead.
     */
    public function driverPerformance(Request $request): JsonResponse
    {
        $stats = \Illuminate\Support\Facades\Cache::remember(
            'driver_performance_stats',
            300,
            function () {
                $drivers = User::where('role', 'driver')
                    ->where('status', 'active')
                    ->get();

                return $drivers->map(function (User $driver) {
                    $manifests = DeliveryManifest::where('driver_id', $driver->id);
                    $items     = DeliveryItem::whereHas('manifest', fn($q) => $q->where('driver_id', $driver->id));

                    return [
                        'driver_id'           => $driver->id,
                        'name'                => $driver->name,
                        'profile_picture_url' => $driver->profile_picture_url ?? null,
                        
                        // Rating — frontend expects `avg_rating`
                        'avg_rating'          => DriverRatingAdjustment::overallRatingFor($driver->id),
                        
                        // Manifests
                        'total_manifests'     => (clone $manifests)->count(),
                        'completed_manifests' => (clone $manifests)->where('status', 'completed')->count(),
                        
                        // Stops — frontend expects `total_delivered` and `total_failed`
                        'total_stops'         => (clone $items)->count(),
                        'total_delivered'     => (clone $items)->where('status', 'delivered')->count(),
                        'total_failed'        => (clone $items)->where('status', 'failed')->count(),
                        
                        // Distance & duration
                        'total_distance_km'   => round((clone $manifests)->sum('total_distance_km') ?? 0, 2),
                        'avg_duration_mins'   => round((clone $manifests)->whereNotNull('actual_duration_minutes')->avg('actual_duration_minutes') ?? 0, 0),
                        
                        // Performance
                        'on_time_rate'        => $this->onTimeRateForDriver($driver->id),
                        
                        // Safety
                        'open_incidents'      => DeliveryIncident::where('reported_against', $driver->id)
                            ->whereIn('status', ['open', 'under_review'])->count(),
                        'critical_incidents'  => DeliveryIncident::where('reported_against', $driver->id)
                            ->where('severity', 'critical')->count(),
                        'total_pings'         => DriverLocationPing::where('driver_id', $driver->id)->count(),
                    ];
                });
            }
        );

        return response()->json(['data' => $stats]);
    }

    public function driverDetail(Request $request, int $driverId): JsonResponse
    {
        $driver = User::where('role', 'driver')->findOrFail($driverId);

        $aiOutput = null;
        if ($request->boolean('include_ai')) {
            try {
                $aiOutput = $this->ai->analyse(
                    moduleKey:  'driver_performance',
                    adminId:    Auth::id(),
                    entityId:   $driverId,
                    entityType: 'driver',
                    outputType: 'insight',
                );
            } catch (\Exception $e) {
                Log::warning('Driver performance AI failed: ' . $e->getMessage());
            }
        }

        $manifests = DeliveryManifest::where('driver_id', $driverId);
        $items     = DeliveryItem::whereHas('manifest', fn($q) => $q->where('driver_id', $driverId));

        return response()->json([
            'driver' => array_merge(
                $driver->only(['id', 'name', 'phone', 'profile_picture_url']),
                [
                    'is_active'           => $driver->status === 'active',
                    'on_time_rate'        => $this->onTimeRateForDriver($driverId),
                    'total_distance_km'   => round((clone $manifests)->sum('total_distance_km') ?? 0, 2),
                    'completed_manifests' => (clone $manifests)->where('status', 'completed')->count(),
                    'total_manifests'     => (clone $manifests)->count(),
                    'total_stops'         => (clone $items)->count(),
                    'delivered_stops'     => (clone $items)->where('status', 'delivered')->count(),
                    'failed_stops'        => (clone $items)->where('status', 'failed')->count(),
                    'avg_duration_mins'   => round((clone $manifests)->whereNotNull('actual_duration_minutes')->avg('actual_duration_minutes') ?? 0, 0),
                    'open_incidents'      => DeliveryIncident::where('reported_against', $driverId)->whereIn('status', ['open', 'under_review'])->count(),
                    'critical_incidents'  => DeliveryIncident::where('reported_against', $driverId)->where('severity', 'critical')->count(),
                    'total_pings'         => DriverLocationPing::where('driver_id', $driverId)->count(),
                ]
            ),
            'rating'     => DriverRatingAdjustment::ratingBreakdownFor($driverId),
            'ai_insight' => $aiOutput,
        ]);
    }

    /**
     * GPS location trail for a manifest.
     *
     * FIX: added authorization — only admins or the manifest's own driver
     * may view the location trail. Previously any authenticated user could
     * pull any driver's GPS history by guessing a manifest ID.
     */
    public function locationTrail(int $manifestId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);
        $user     = Auth::user();

        $isAdmin      = $user->role === 'admin';
        $isOwnDriver  = $manifest->driver_id === $user->id;

        if (! $isAdmin && ! $isOwnDriver)
            return response()->json(['message' => 'Unauthorized.'], 403);

        $pings = DriverLocationPing::where('manifest_id', $manifestId)
            ->orderBy('pinged_at')
            ->get(['latitude', 'longitude', 'speed', 'heading', 'pinged_at']);

        return response()->json([
            'manifest_number' => $manifest->manifest_number,
            'driver'          => $manifest->driver?->name,
            'trail'           => $pings,
            'total_distance'  => $manifest->total_distance_km,
        ]);
    }

    // ── Private helpers ──────────────────────────────────────

    private function manifestCompletionRate(): float
    {
        $total = DeliveryManifest::whereIn('status', ['completed', 'cancelled'])->count();
        if ($total === 0) return 0.0;
        $completed = DeliveryManifest::where('status', 'completed')->count();
        return round(($completed / $total) * 100, 1);
    }

    private function onTimeRate(): float
    {
        $withEta = DeliveryItem::where('status', 'delivered')
            ->whereNotNull('estimated_arrival')
            ->count();

        if ($withEta === 0) return 0.0;

        $onTime = DeliveryItem::where('status', 'delivered')
            ->whereNotNull('estimated_arrival')
            ->whereColumn('delivered_at', '<=', 'estimated_arrival')
            ->count();

        return round(($onTime / $withEta) * 100, 1);
    }

    private function onTimeRateForDriver(int $driverId): float
    {
        $items = DeliveryItem::whereHas('manifest', fn($q) => $q->where('driver_id', $driverId))
            ->where('status', 'delivered')
            ->whereNotNull('estimated_arrival');

        $total  = (clone $items)->count();
        if ($total === 0) return 0.0;

        $onTime = (clone $items)->whereColumn('delivered_at', '<=', 'estimated_arrival')->count();
        return round(($onTime / $total) * 100, 1);
    }
}