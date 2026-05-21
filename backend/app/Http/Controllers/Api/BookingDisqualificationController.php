<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingDisqualification;
use App\Models\Customer;
use App\Http\Controllers\Api\Traits\LogsBookingActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingDisqualificationController extends Controller
{
    use LogsBookingActivity;

    /**
     * GET /admin/booking-disqualifications
     * List all disqualifications with optional filters.
     */
    public function index(Request $request): JsonResponse
    {
        $query = BookingDisqualification::with([
            'customer:id,first_name,last_name,email',
            'disqualified_by:id,name',
            'reactivated_by:id,name',
            'booking:id,booking_number',
        ]);

        if ($request->filled('customer_id'))  $query->forCustomer($request->customer_id);
        if ($request->boolean('active_only')) $query->active();

        $results = $query->orderByDesc('disqualified_at')
                         ->paginate($request->get('per_page', 20));

        return response()->json($results);
    }

    /**
     * GET /admin/booking-disqualifications/{id}
     */
    public function show(int $id): JsonResponse
    {
        $disq = BookingDisqualification::with([
            'customer:id,first_name,last_name,email',
            'disqualified_by:id,name,role',
            'reactivated_by:id,name,role',
            'booking:id,booking_number,scheduled_at',
        ])->findOrFail($id);

        return response()->json(['disqualification' => $disq]);
    }

    /**
     * POST /admin/bookings/{id}/disqualify
     */
    public function disqualify(Request $request, int $id): JsonResponse
    {
        $booking = Booking::with('customer')->findOrFail($id);

        $request->validate([
            'reason' => 'required|string|max:2000',
        ]);

        // Already disqualified?
        if (BookingDisqualification::isCustomerDisqualified($booking->customer_id)) {
            return response()->json(['message' => 'This customer is already disqualified.'], 422);
        }

        $disq = BookingDisqualification::create([
            'customer_id'     => $booking->customer_id,
            'booking_id'      => $booking->id,
            'reason'          => $request->reason,
            'disqualified_by' => auth()->id(),
            'disqualified_at' => now(),
            'is_active'       => true,
        ]);

        // Also flag the booking itself
        $booking->update(['is_disqualified' => true]);

        $this->logCustomerDisqualified($booking->id, $booking->customer_id, $request->reason);

        return response()->json([
            'message'         => 'Customer disqualified from booking.',
            'disqualification'=> $disq->load('disqualified_by:id,name'),
        ], 201);
    }

    /**
     * POST /admin/bookings/{id}/reactivate
     */
    public function reactivate(Request $request, int $id): JsonResponse
    {
        $booking = Booking::with('customer')->findOrFail($id);

        $request->validate([
            'notes' => 'nullable|string|max:2000',
        ]);

        $active = BookingDisqualification::where('customer_id', $booking->customer_id)
            ->where('is_active', true)
            ->first();

        if (!$active) {
            return response()->json(['message' => 'This customer is not currently disqualified.'], 422);
        }

        $active->reactivate(auth()->id(), $request->notes);

        // Remove disqualified flag from booking
        $booking->update(['is_disqualified' => false]);

        $this->logCustomerReactivated($booking->id, $booking->customer_id, $request->notes);

        return response()->json([
            'message'         => 'Customer reactivated.',
            'disqualification'=> $active->fresh()->load('reactivated_by:id,name'),
        ]);
    }
}