<x-mail::message>
# Booking Received

Hi {{ $booking->customer?->first_name }},

Thank you for your booking. We've received your request and will confirm it shortly.

<x-mail::panel>
**Booking Reference:** {{ $booking->booking_number }}
**Service:** {{ $booking->service?->name }}
**Date:** {{ $booking->scheduled_at?->format('D, d M Y \a\t H:i') ?? 'To be confirmed' }}
**Location:** {{ ucfirst($booking->location_type) }}{{ $booking->location_address ? ' – ' . $booking->location_address : '' }}
**Status:** Pending Confirmation
</x-mail::panel>

@if($booking->customer_notes)
**Your notes:** {{ $booking->customer_notes }}
@endif

@if($booking->policy_accepted)
*You accepted our cancellation policy at the time of booking (version: {{ $booking->policy_version }}).*
@endif

If you have any questions, reply to this email or contact us directly.

Thanks,
{{ config('app.name') }}
</x-mail::message>