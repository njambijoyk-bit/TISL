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
// DeliveryRatingController
// ============================================================
class DeliveryRatingController extends Controller
{
    use LogsDeliveryActivity;

    /** Customer submits a rating after delivery */
    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'order_id'         => 'required|exists:orders,id',
            'delivery_item_id' => 'required|exists:delivery_items,id',
            'rating'           => 'required|integer|between:1,5',
            'comment'          => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        // FIX: guard against users with no linked customer record
        $customer = Auth::user()->customer;
        if (! $customer)
            return response()->json(['message' => 'No customer profile linked to this account.'], 403);

        $item = DeliveryItem::findOrFail($request->delivery_item_id);

        if ($item->status !== 'delivered')
            return response()->json(['message' => 'Can only rate delivered stops.'], 422);

        if (! $item->manifest)
            return response()->json(['message' => 'No manifest found for this delivery.'], 422);

        // Prevent duplicate ratings
        if (DeliveryRating::where('order_id', $request->order_id)
            ->where('customer_id', $customer->id)
            ->exists()) {
            return response()->json(['message' => 'You have already rated this delivery.'], 422);
        }

        $rating = DeliveryRating::create([
            'order_id'             => $request->order_id,
            'delivery_item_id'     => $request->delivery_item_id,
            'customer_id'          => $customer->id,
            'driver_id'            => $item->manifest->driver_id,
            'rating'               => $request->rating,
            'comment'              => $request->comment,
            'is_visible_to_driver' => true,
        ]);

        $this->logDeliveryActivity(
            DeliveryRating::class,
            $rating->id,
            'rating_submitted',
            'info',
            ['rating' => $request->rating, 'driver_id' => $rating->driver_id]
        );

        return response()->json(['message' => 'Thank you for your rating.', 'data' => $rating], 201);
    }

    /** Customer: view all ratings they have submitted */
    public function myRatings(Request $request): JsonResponse
    {
        $customer = Auth::user()->customer;
        if (! $customer) {
            return response()->json(['message' => 'No customer profile linked.'], 403);
        }

        $ratings = DeliveryRating::where('customer_id', $customer->id)
            ->with(['driver:id,name', 'order:id,order_number', 'deliveryItem:id'])
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'ratings' => $ratings,
        ]);
    }

    /** Admin: apply a manual rating adjustment to a driver */
    public function adjust(Request $request, int $driverId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'adjustment_value' => 'required|numeric|between:-4,4',
            'reason'           => 'required|string|max:500',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $driver = User::where('role', 'driver')->findOrFail($driverId);

        $adjustment = DriverRatingAdjustment::create([
            'driver_id'        => $driver->id,
            'adjusted_by'      => Auth::id(),
            'adjustment_value' => $request->adjustment_value,
            'reason'           => $request->reason,
        ]);

        $newOverall = DriverRatingAdjustment::overallRatingFor($driver->id);

        $this->logDeliveryActivity(
            DriverRatingAdjustment::class,
            $adjustment->id,
            'rating_adjusted',
            'warning',
            [
                'driver_id'        => $driver->id,
                'driver_name'      => $driver->name,
                'adjustment_value' => $request->adjustment_value,
                'new_overall'      => $newOverall,
                'reason'           => $request->reason,
                'adjusted_by'      => Auth::user()->name,
            ]
        );

        return response()->json([
            'message'     => 'Rating adjusted.',
            'new_overall' => $newOverall,
            'adjustment'  => $adjustment,
        ]);
    }

    /** Admin: all ratings for a driver with full breakdown + adjustments */
    public function driverRatings(Request $request, int $driverId): JsonResponse
    {
        $driver = User::where('role', 'driver')->findOrFail($driverId);

        $ratings = DeliveryRating::forDriver($driverId)
            ->with(['customer:id,first_name,last_name', 'order:id,order_number'])
            ->orderByDesc('created_at')
            ->paginate(20);

        $breakdown   = DriverRatingAdjustment::ratingBreakdownFor($driverId);
        $adjustments = DriverRatingAdjustment::where('driver_id', $driverId)
            ->with('admin:id,name')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'driver'      => ['id' => $driver->id, 'name' => $driver->name],
            'breakdown'   => $breakdown,
            'adjustments' => $adjustments,
            'ratings'     => $ratings,
        ]);
    }

    /** Admin: toggle whether a rating comment is visible to the driver */
    public function toggleVisibility(int $ratingId): JsonResponse
    {
        $rating = DeliveryRating::findOrFail($ratingId);
        $rating->update(['is_visible_to_driver' => ! $rating->is_visible_to_driver]);

        return response()->json([
            'message'              => 'Visibility updated.',
            'is_visible_to_driver' => $rating->is_visible_to_driver,
        ]);
    }

    /** Driver: their own rating summary (overall, raw avg, breakdown) */
    public function myRatingSummary(): JsonResponse
    {
        $driver = Auth::user();

        $breakdown = DriverRatingAdjustment::ratingBreakdownFor($driver->id);

        return response()->json([
            'overall_rating'    => $breakdown['overall_rating'],
            'raw_average'       => $breakdown['raw_average'],
            'total_ratings'     => $breakdown['total_ratings'],
            'total_adjustment'  => $breakdown['total_adjustment'],
            'distribution'      => $breakdown['distribution'],
        ]);
    }

    /** Customer: overall rating of the driver who handled their order */
    public function driverRatingForOrder(int $orderId): JsonResponse
    {
        $user  = Auth::user();
        $customer = $user->customer;

        if (! $customer)
            return response()->json(['message' => 'No customer profile linked.'], 403);

        // Verify this order belongs to this customer
        $order = Order::where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        // Get the manifest via delivery item
        $item = DeliveryItem::where('order_id', $order->id)
            ->whereNotNull('manifest_id')
            ->with('manifest')
            ->first();

        if (! $item || ! $item->manifest?->driver_id)
            return response()->json(['message' => 'No driver assigned to this order.'], 404);

        $driverId = $item->manifest->driver_id;

        $breakdown = DriverRatingAdjustment::ratingBreakdownFor($driverId);

        // Deliberately minimal — customer doesn't see adjustment details
        return response()->json([
            'overall_rating' => $breakdown['overall_rating'],
            'total_ratings'  => $breakdown['total_ratings'],
        ]);
    }
    
    /** Admin: fleet-wide rating KPIs for the ratings page header */
    public function fleetRatingKpis(): JsonResponse
    {
        $totalDrivers = User::where('role', 'driver')->count();
        $totalReviews = DeliveryRating::count();

        // Raw avg across all ratings (no adjustments — just for KPI display)
        $fleetAvg = DeliveryRating::avg('rating');

        $driversRated = DeliveryRating::distinct('driver_id')->count('driver_id');

        return response()->json([
            'fleet_avg'      => $fleetAvg ? round($fleetAvg, 1) : null,
            'total_reviews'  => $totalReviews,
            'drivers_rated'  => $driversRated,
            'total_drivers'  => $totalDrivers,
        ]);
    }
}