<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\BookingCancelledAdmin;
use App\Mail\BookingCancelledCustomer;
use App\Mail\BookingConfirmedCustomer;
use App\Mail\BookingPlacedAdmin;
use App\Mail\BookingPlacedCustomer;
use App\Models\Booking;
use App\Models\Order;
use App\Models\BookingDisqualification;
use App\Models\BookingSetting;
use App\Models\Customer;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

use App\Http\Controllers\Api\Traits\LogsBookingActivity;
use App\Http\Controllers\Api\Traits\LogsPolicyAcceptances;

class BookingController extends Controller
{
    use LogsBookingActivity;
    use LogsPolicyAcceptances; 

    // ════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ════════════════════════════════════════════════════════════════════════

    /**
     * GET /admin/bookings
     */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = Booking::with(['service', 'customer', 'creator', 'staff.user'])
            ->withCount('worksheets');

        // Filters
        if ($request->filled('status'))      $query->where('status', $request->status);
        if ($request->filled('customer_id')) $query->where('customer_id', $request->customer_id);
        if ($request->filled('service_id'))  $query->where('service_id', $request->service_id);
        if ($request->filled('date'))        $query->forDate($request->date);
        if ($request->filled('from') && $request->filled('to'))
            $query->forDateRange($request->from, $request->to);
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('booking_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn($q) => $q->where('first_name', 'like', "%{$search}%")
                      ->orWhere('last_name', 'like', "%{$search}%")
                      ->orWhere('email', 'like', "%{$search}%"));
            });
        }

        $sort  = $request->get('sort_by', 'scheduled_at');
        $order = $request->get('sort_order', 'asc');
        $query->orderBy($sort, $order);

        $bookings = $query->paginate($request->get('per_page', 20));

        return response()->json($bookings);
    }

    /**
     * POST /admin/bookings  (admin creates on behalf of customer)
     */
    public function adminStore(Request $request): JsonResponse
    {
        $settings = BookingSetting::instance();

        $validated = $this->validateBookingRequest($request, isAdmin: true);

        // Check customer disqualification
        if (BookingDisqualification::isCustomerDisqualified($validated['customer_id'])) {
            return response()->json(['message' => 'This customer is currently disqualified from placing bookings.'], 422);
        }

        // Check service booking_required (unless global override)
        $service = Service::findOrFail($validated['service_id']);
        if (!$settings->override_booking_required && !$service->booking_required) {
            return response()->json(['message' => 'This service does not require a booking.'], 422);
        }

        // Check concurrent booking limit
        if ($service->max_concurrent_bookings) {
            $existing = Booking::where('service_id', $service->id)
                ->whereDate('scheduled_at', Carbon::parse($validated['scheduled_at'])->toDateString())
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->count();
            if ($existing >= $service->max_concurrent_bookings) {
                return response()->json(['message' => 'Maximum concurrent bookings reached for this service on that date.'], 422);
            }
        }

        return DB::transaction(function () use ($validated, $settings) {
            $booking = Booking::create(array_merge($validated, [
                'created_by'      => auth()->id(),
                'policy_accepted' => true,  // admin bypass — admin takes responsibility
            ]));

            $this->logBookingCreated($booking->id, $booking->toArray());

            $this->sendBookingPlacedEmails($booking, $settings);

            return response()->json([
                'message' => 'Booking created.',
                'booking' => $booking->load(['service', 'customer', 'staff.user']),
            ], 201);
        });
    }

    /**
     * GET /admin/bookings/{id}
     */
    public function adminShow(int $id): JsonResponse
    {
        $booking = Booking::with([
            'service',
            'customer',
            'creator',
            'cancelled_by',
            'staff.user',
            'worksheets.filled_by',
            'worksheets.items.product',
            'orders',
            'disqualifications.disqualified_by',
            'activity_logs.performed_by',
        ])->findOrFail($id);

        return response()->json(['booking' => $booking]);
    }

    /**
     * PUT /admin/bookings/{id}
     */
    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $booking = Booking::findOrFail($id);
        $before  = $booking->only(['status', 'scheduled_at', 'location_type', 'location_address', 'admin_notes']);

        $validated = $request->validate([
            'location_type'    => 'sometimes|in:instore,onsite,remote',
            'location_address' => 'sometimes|nullable|string',
            'scheduled_at'     => 'sometimes|date',
            'scheduled_end_at' => 'sometimes|nullable|date|after:scheduled_at',
            'duration_minutes' => 'sometimes|integer|min:1',
            'admin_notes'      => 'sometimes|nullable|string',
            'customer_notes'   => 'sometimes|nullable|string',
        ]);

        $booking->update($validated);

        $this->logBookingActivity(
            $booking->id, 'BOOKING_UPDATED', 'booking', $booking->id,
            $before, $booking->fresh()->only(array_keys($before))
        );

        return response()->json(['message' => 'Booking updated.', 'booking' => $booking->fresh()]);
    }

    /**
     * POST /admin/bookings/{id}/confirm
     */
    public function confirm(int $id): JsonResponse
    {
        $booking = Booking::findOrFail($id);

        if (!$booking->isPending()) {
            return response()->json(['message' => 'Only pending bookings can be confirmed.'], 422);
        }

        $booking->update(['status' => 'confirmed']);
        $this->logBookingConfirmed($booking->id);

        $settings = BookingSetting::instance();
        if ($settings->email_customer_on_booking) {
            $this->mailCustomer($booking, new BookingConfirmedCustomer($booking));
        }

        return response()->json(['message' => 'Booking confirmed.', 'booking' => $booking->fresh()]);
    }

    /**
     * POST /admin/bookings/{id}/status
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'status' => 'required|in:pending,confirmed,in_progress,completed,no_show',
        ]);

        $booking = Booking::findOrFail($id);
        $old     = $booking->status;

        $booking->update(['status' => $request->status]);
        $this->logStatusChanged($booking->id, $old, $request->status);

        return response()->json(['message' => 'Status updated.', 'booking' => $booking->fresh()]);
    }

    /**
     * POST /admin/bookings/{id}/cancel
     */
    public function adminCancel(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $booking  = Booking::findOrFail($id);
        $settings = BookingSetting::instance();

        if ($booking->isCancelled()) {
            return response()->json(['message' => 'Already cancelled.'], 422);
        }

        $booking->update([
            'status'                    => 'cancelled',
            'cancelled_by'              => auth()->id(),
            'cancelled_at'              => now(),
            'cancellation_reason'       => $request->reason,
            'cancellation_fee_applied'  => 0,  // admin cancellation waives fee
        ]);

        $this->logBookingCancelled($booking->id, $request->reason, 0);

        if ($settings->email_customer_on_cancel) {
            $this->mailCustomer($booking, new BookingCancelledCustomer($booking));
        }
        if ($settings->email_admin_on_cancel) {
            $this->mailAdmin($booking, new BookingCancelledAdmin($booking));
        }

        return response()->json(['message' => 'Booking cancelled.', 'booking' => $booking->fresh()]);
    }

    /**
     * GET /admin/bookings/{id}/activity
     */
    public function activityLog(int $id): JsonResponse
    {
        $booking = Booking::findOrFail($id);
        $logs    = $booking->activity_logs()->with('performed_by:id,name,role')->paginate(50);

        return response()->json($logs);
    }

    /**
     * GET /admin/bookings/slots?date=2025-07-14&service_id=5
     * Returns available slots minus already booked ones.
     */
    public function availableSlots(Request $request): JsonResponse
    {
        $request->validate([
            'date'       => 'required|date_format:Y-m-d',
            'service_id' => 'sometimes|exists:services,id',
        ]);

        $settings = BookingSetting::instance();
        $date     = Carbon::parse($request->date);
        $slots    = $settings->slotsForDate($date);

        if (empty($slots)) {
            return response()->json(['date' => $date->toDateString(), 'slots' => [], 'available' => false]);
        }

        // Check concurrent limit if service provided
        if ($request->filled('service_id')) {
            $service = Service::find($request->service_id);
            if ($service?->max_concurrent_bookings) {
                $booked = Booking::where('service_id', $service->id)
                    ->whereDate('scheduled_at', $date)
                    ->whereNotIn('status', ['cancelled', 'no_show'])
                    ->count();

                if ($booked >= $service->max_concurrent_bookings) {
                    return response()->json([
                        'date'      => $date->toDateString(),
                        'slots'     => [],
                        'available' => false,
                        'reason'    => 'fully_booked',
                    ]);
                }
            }
        }

        return response()->json([
            'date'      => $date->toDateString(),
            'slots'     => $slots,
            'available' => true,
        ]);
    }

    // GET /admin/bookings/activity
    public function globalActivityLog(Request $request): JsonResponse
    {
        $query = \App\Models\BookingActivityLog::with([
            'performed_by:id,name',
            'booking:id,booking_number',
        ])->orderByDesc('created_at');

        if ($request->filled('search')) {
            $query->where(function($q) use ($request) {
                $q->where('action', 'like', "%{$request->search}%")
                ->orWhere('description', 'like', "%{$request->search}%");
            });
        }

        return response()->json($query->paginate($request->get('per_page', 30)));
    }

    // ════════════════════════════════════════════════════════════════════════
    // CUSTOMER
    // ════════════════════════════════════════════════════════════════════════

    /**
     * GET /customer/bookings
     */
    public function customerIndex(Request $request): JsonResponse
    {
        $customer = auth()->user()->customer;
        if (!$customer) return response()->json(['message' => 'Customer record not found.'], 404);

        $bookings = Booking::with(['service'])
            ->forCustomer($customer->id)
            ->orderByDesc('scheduled_at')
            ->paginate($request->get('per_page', 15));

        return response()->json($bookings);
    }

    /**
     * POST /customer/bookings
     */
    public function customerStore(Request $request): JsonResponse
    {
        $settings = BookingSetting::instance();

        if (!$settings->bookings_open) {
            return response()->json(['message' => 'Bookings are currently closed.'], 422);
        }

        $customer = auth()->user()->customer;
        if (!$customer) return response()->json(['message' => 'Customer record not found.'], 404);

        // Disqualification check
        if (BookingDisqualification::isCustomerDisqualified($customer->id)) {
            return response()->json(['message' => 'You are currently not eligible to place bookings. Please contact us.'], 403);
        }

        $validated = $this->validateBookingRequest($request, isAdmin: false);
        $validated['customer_id'] = $customer->id;

        // Policy acceptance
        $cancellationAccepted = collect($validated['policy_acceptances'] ?? [])
            ->firstWhere('key', 'booking_cancellation_policy');
        $policyAccepted = ($cancellationAccepted['response'] ?? '') === 'accepted';

        if (!$policyAccepted) {
            return response()->json(['message' => 'You must accept the cancellation policy to proceed.'], 422);
        }

        // Service checks
        $service = Service::findOrFail($validated['service_id']);
        if (!$settings->override_booking_required && !$service->booking_required) {
            return response()->json(['message' => 'This service does not support bookings.'], 422);
        }

        if ($service->max_concurrent_bookings) {
            $date    = Carbon::parse($validated['scheduled_at'])->toDateString();
            $booked  = Booking::where('service_id', $service->id)
                ->whereDate('scheduled_at', $date)
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->count();
            if ($booked >= $service->max_concurrent_bookings) {
                return response()->json(['message' => 'This time slot is fully booked. Please choose another.'], 422);
            }
        }

        // Date availability check
        $schedDate = Carbon::parse($validated['scheduled_at']);
        if (!$settings->isDateAvailable($schedDate)) {
            return response()->json(['message' => 'The selected date is not available for bookings.'], 422);
        }

        // Lead time check
        if ($settings->booking_lead_time_hours > 0) {
            if ($schedDate->diffInHours(now(), false) > -$settings->booking_lead_time_hours) {
                return response()->json([
                    'message' => "Bookings must be placed at least {$settings->booking_lead_time_hours} hours in advance.",
                ], 422);
            }
        }

        return DB::transaction(function () use ($validated, $settings, $policyAccepted, $customer, $request) {
            $booking = Booking::create(array_merge($validated, [
                'created_by'          => auth()->id(),
            ]));

            $this->logBookingCreated($booking->id, $booking->toArray());
            // Log to global policy_acceptances table
            foreach ($validated['policy_acceptances'] ?? [] as $pa) {
                $this->logPolicyAcceptance(
                    policyKey:     $pa['key'],
                    actionContext: 'booking_checkout',
                    response:      $pa['response'],
                    customer:      $customer,
                    user:          auth()->user(),
                    wasSuccessful: $pa['response'] === 'accepted',
                    referenceType: 'booking',
                    referenceId:   $booking->id,
                    request:       $request,
                );
            }

            // Keep booking activity log for booking-specific audit trail
            if ($policyAccepted) {
                $policyVersion = $cancellationAccepted['version'] ?? '';
                $this->logPolicyAccepted($booking->id, $policyVersion);
            }

            $this->sendBookingPlacedEmails($booking, $settings);

            return response()->json([
                'message' => 'Booking placed successfully.',
                'booking' => $booking->load('service'),
            ], 201);
        });
    }

    /**
     * GET /customer/bookings/{id}
     */
    public function customerShow(int $id): JsonResponse
    {
        $customer = auth()->user()->customer;
        $booking  = Booking::with(['service', 'staff.user', 'worksheets' => function ($q) {
            // Customer only sees approved worksheets, without admin_notes
            $q->where('status', 'approved');
        }, 'worksheets.items'])
            ->forCustomer($customer->id)
            ->findOrFail($id);

        // Strip admin_notes from worksheets for customer view
        $booking->worksheets->each(fn($ws) => $ws->makeHidden('admin_notes'));

        return response()->json(['booking' => $booking]);
    }

    /**
     * POST /customer/bookings/{id}/cancel
     */
    public function customerCancel(Request $request, int $id): JsonResponse
    {
        $settings = BookingSetting::instance();

        if (!$settings->customer_can_cancel) {
            return response()->json(['message' => 'Customer cancellation is not enabled. Please contact us.'], 403);
        }

        $customer = auth()->user()->customer;
        $booking  = Booking::forCustomer($customer->id)->findOrFail($id);

        if (!$booking->canBeCancelledByCustomer()) {
            return response()->json([
                'message' => "Cancellations must be made at least {$settings->cancellation_window_hours} hours before the scheduled time.",
            ], 422);
        }

        $request->validate(['reason' => 'required|string|max:500']);

        // Calculate fee
        $fee = 0;
        if ($settings->cancellation_fee > 0) {
            $fee = $settings->cancellation_fee_type === 'percent'
                ? round(($settings->cancellation_fee / 100) * ($booking->service?->base_price ?? 0), 2)
                : (float) $settings->cancellation_fee;
        }

        $booking->update([
            'status'                   => 'cancelled',
            'cancelled_by'             => auth()->id(),
            'cancelled_at'             => now(),
            'cancellation_reason'      => $request->reason,
            'cancellation_fee_applied' => $fee,
        ]);

        $this->logBookingCancelled($booking->id, $request->reason, $fee);

        if ($settings->email_customer_on_cancel) {
            $this->mailCustomer($booking, new BookingCancelledCustomer($booking));
        }
        if ($settings->email_admin_on_cancel) {
            $this->mailAdmin($booking, new BookingCancelledAdmin($booking));
        }

        return response()->json([
            'message'          => 'Booking cancelled.',
            'cancellation_fee' => $fee,
            'booking'          => $booking->fresh(),
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ════════════════════════════════════════════════════════════════════════

    private function validateBookingRequest(Request $request, bool $isAdmin): array
    {
        $rules = [
            'service_id'            => 'required|exists:services,id',
            'location_type'         => 'required|in:instore,onsite,remote',
            'location_address'      => 'nullable|string',
            'scheduled_type'        => 'required|in:specific_time,next_available,before_eod',
            'scheduled_at'          => 'required_if:scheduled_type,specific_time|nullable|date',
            'duration_minutes'      => 'nullable|integer|min:1',
            'is_recurring'          => 'boolean',
            'recurrence_rule'       => 'nullable|array',
            'recurring_billing_mode'=> 'nullable|in:per_occurrence,whole',
            'customer_notes'        => 'nullable|string|max:2000',
            'project_id'            => 'nullable|exists:projects,id',
            'policy_acceptances'            => 'nullable|array',
            'policy_acceptances.*.key'      => 'required_with:policy_acceptances|string',
            'policy_acceptances.*.response' => 'required_with:policy_acceptances|in:accepted,disagreed',
        ];

        if ($isAdmin) {
            $rules['customer_id'] = 'required|exists:customers,id';
            $rules['admin_notes'] = 'nullable|string|max:2000';
            $rules['policy_accepted'] = 'boolean'; 
        }

        return $request->validate($rules);
    }

    private function sendBookingPlacedEmails(Booking $booking, BookingSetting $settings): void
    {
        if ($settings->email_customer_on_booking) {
            $this->mailCustomer($booking, new BookingPlacedCustomer($booking));
        }
        if ($settings->email_admin_on_booking) {
            $this->mailAdmin($booking, new BookingPlacedAdmin($booking));
        }
    }

    private function mailCustomer(Booking $booking, $mailable): void
    {
        try {
            $email = $booking->customer?->email ?? $booking->customer?->user?->email;
            if ($email) Mail::to($email)->queue($mailable);
        } catch (\Throwable) { /* log silently */ }
    }

    private function mailAdmin(Booking $booking, $mailable): void
    {
        try {
            $adminEmail = config('mail.admin_address', config('mail.from.address'));
            if ($adminEmail) Mail::to($adminEmail)->queue($mailable);
        } catch (\Throwable) { /* log silently */ }
    }
}