<x-mail::message>
# Booking Confirmed ✓

Hi {{ $booking->customer?->first_name }},

Great news — your booking has been confirmed!

<x-mail::panel>
**Booking Reference:** {{ $booking->booking_number }}
**Service:** {{ $booking->service?->name }}
**Date:** {{ $booking->scheduled_at?->format('D, d M Y \a\t H:i') }}
**Location:** {{ ucfirst($booking->location_type) }}{{ $booking->location_address ? ' – ' . $booking->location_address : '' }}
**Status:** Confirmed
</x-mail::panel>

@if($booking->service?->requires_site_visit)
One of our team members will be in touch to confirm the site visit details.
@endif

Please arrive on time. If you need to make any changes, contact us as early as possible.

Thanks,
{{ config('app.name') }}
</x-mail::message>