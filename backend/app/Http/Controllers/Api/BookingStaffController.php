<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingStaff;
use App\Models\User;
use App\Http\Controllers\Api\Traits\LogsBookingActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingStaffController extends Controller
{
    use LogsBookingActivity;

    /**
     * POST /admin/bookings/{id}/staff
     */
    public function assign(Request $request, int $id): JsonResponse
    {
        $booking = Booking::findOrFail($id);

        $validated = $request->validate([
            'user_id'          => 'required|exists:users,id',
            'role'             => 'required|in:lead,support,observer',
            'task_description' => 'nullable|string|max:1000',
        ]);

        // Ensure they're a staff member, not a customer
        $user = User::findOrFail($validated['user_id']);
        if ($user->isCustomer()) {
            return response()->json(['message' => 'Cannot assign a customer as booking staff.'], 422);
        }

        // Enforce one lead per booking
        if ($validated['role'] === 'lead') {
            $existing = BookingStaff::where('booking_id', $booking->id)
                ->where('role', 'lead')->first();
            if ($existing) {
                return response()->json([
                    'message' => 'A lead is already assigned. Update their role first.',
                    'lead'    => $existing->load('user:id,name,role'),
                ], 422);
            }
        }

        // Prevent duplicate assignment
        if (BookingStaff::where('booking_id', $booking->id)->where('user_id', $validated['user_id'])->exists()) {
            return response()->json(['message' => 'This staff member is already assigned to this booking.'], 422);
        }

        $staff = BookingStaff::create([
            'booking_id'       => $booking->id,
            'user_id'          => $validated['user_id'],
            'role'             => $validated['role'],
            'task_description' => $validated['task_description'] ?? null,
            'assigned_by'      => auth()->id(),
            'assigned_at'      => now(),
            'status'           => 'assigned',
        ]);

        $this->logStaffAssigned($booking->id, $validated['user_id'], $validated['role']);

        return response()->json([
            'message' => 'Staff assigned.',
            'staff'   => $staff->load('user:id,name,role,profile_picture'),
        ], 201);
    }

    /**
     * PUT /admin/bookings/{id}/staff/{staffId}
     */
    public function update(Request $request, int $id, int $staffId): JsonResponse
    {
        $booking = Booking::findOrFail($id);
        $staff   = BookingStaff::where('booking_id', $booking->id)->findOrFail($staffId);

        $validated = $request->validate([
            'role'             => 'sometimes|in:lead,support,observer',
            'task_description' => 'sometimes|nullable|string|max:1000',
            'status'           => 'sometimes|in:assigned,accepted,declined,completed',
        ]);

        // Enforce one lead
        if (($validated['role'] ?? null) === 'lead' && $staff->role !== 'lead') {
            $existing = BookingStaff::where('booking_id', $booking->id)
                ->where('role', 'lead')->where('id', '!=', $staffId)->first();
            if ($existing) {
                return response()->json(['message' => 'A lead is already assigned.'], 422);
            }
        }

        $oldTask = $staff->task_description;
        $staff->update($validated);

        if (isset($validated['task_description'])) {
            $this->logStaffTaskUpdated($booking->id, $staff->user_id, $oldTask, $validated['task_description']);
        }

        return response()->json(['message' => 'Staff updated.', 'staff' => $staff->fresh()->load('user:id,name,role')]);
    }

    /**
     * DELETE /admin/bookings/{id}/staff/{staffId}
     */
    public function remove(int $id, int $staffId): JsonResponse
    {
        $booking = Booking::findOrFail($id);
        $staff   = BookingStaff::where('booking_id', $booking->id)->findOrFail($staffId);

        $this->logStaffRemoved($booking->id, $staff->user_id);
        $staff->delete();

        return response()->json(['message' => 'Staff removed.']);
    }
}