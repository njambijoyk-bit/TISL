<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookingSetting;
use App\Models\Currency;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BookingSettingController extends Controller
{
    /**
     * GET /admin/booking-settings
     */
    public function show(): JsonResponse
    {
        $settings = BookingSetting::instance();
        return response()->json(['settings' => $settings]);
    }

    /**
     * PUT /admin/booking-settings
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slot_duration_minutes'      => 'sometimes|integer|min:15|max:480',
            'booking_lead_time_hours'    => 'sometimes|integer|min:0',
            'max_advance_booking_days'   => 'sometimes|integer|min:1',
            'working_hours'              => 'sometimes|array',
            'working_hours.*.open'       => 'sometimes|string',
            'working_hours.*.close'      => 'sometimes|string',
            'working_hours.*.enabled'    => 'sometimes|boolean',
            'blackout_dates'             => 'sometimes|array',
            'blackout_dates.*'           => 'date_format:Y-m-d',
            'bookings_open'              => 'sometimes|boolean',
            'allow_weekend_bookings'     => 'sometimes|boolean',
            'allow_holiday_bookings'     => 'sometimes|boolean',
            'override_booking_required'  => 'sometimes|boolean',
            'customer_can_cancel'        => 'sometimes|boolean',
            'cancellation_window_hours'  => 'sometimes|integer|min:0',
            'cancellation_fee_type'      => 'sometimes|in:flat,percent',
            'cancellation_fee'           => 'sometimes|numeric|min:0',
            'cancellation_currency_code' => 'sometimes|string|max:10|exists:currencies,code',
            'cancellation_policy_template' => 'sometimes|nullable|string',
            'require_policy_acceptance'  => 'sometimes|boolean',
            'email_customer_on_booking'  => 'sometimes|boolean',
            'email_admin_on_booking'     => 'sometimes|boolean',
            'email_customer_on_cancel'   => 'sometimes|boolean',
            'email_admin_on_cancel'      => 'sometimes|boolean',
        ]);

        $settings = BookingSetting::instance();

        // If policy template changes, bump version hash for legal tracking
        if (isset($validated['cancellation_policy_template'])
            && $validated['cancellation_policy_template'] !== $settings->cancellation_policy_template
        ) {
            $validated['cancellation_policy_version'] = Str::substr(
                md5($validated['cancellation_policy_template'] . now()->toIso8601String()),
                0, 12
            );
        }

        $validated['updated_by'] = auth()->id();
        $validated['updated_at'] = now();

        $settings->update($validated);

        return response()->json([
            'message'  => 'Booking settings updated.',
            'settings' => $settings->fresh(),
        ]);
    }

    /**
     * GET /booking-settings/policy  (public — no auth needed)
     * Returns the rendered policy and available slot days for the booking form.
     */
    public function publicPolicy(): JsonResponse
    {
        $settings = BookingSetting::instance();

        return response()->json([
            'policy_text'    => $settings->renderPolicy(),
            'policy_version' => $settings->cancellation_policy_version,
            'bookings_open'  => $settings->bookings_open,
            'require_policy_acceptance' => $settings->require_policy_acceptance,
            'lead_time_hours'           => $settings->booking_lead_time_hours,
            'max_advance_days'          => $settings->max_advance_booking_days,
            'slot_duration_minutes'     => $settings->slot_duration_minutes,
            'working_hours'             => $settings->working_hours,
            'blackout_dates'            => $settings->blackout_dates,
            'allow_weekend_bookings'    => $settings->allow_weekend_bookings,
        ]);
    }

    /**
     * GET /admin/booking-settings/slots?date=2025-07-14
     * Returns available time slots for a given date.
     */
    public function slotsForDate(Request $request): JsonResponse
    {
        $request->validate(['date' => 'required|date_format:Y-m-d']);

        $settings = BookingSetting::instance();
        $date     = \Carbon\Carbon::parse($request->date);
        $slots    = $settings->slotsForDate($date);

        return response()->json([
            'date'      => $date->toDateString(),
            'available' => !empty($slots),
            'slots'     => $slots,
        ]);
    }
}