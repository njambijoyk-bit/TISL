<x-mail::message>
# New Booking Placed

A new booking has been placed and is awaiting confirmation.

<x-mail::panel>
**Booking Reference:** {{ $booking->booking_number }}
**Customer:** {{ $booking->customer?->first_name }} {{ $booking->customer?->last_name }} ({{ $booking->customer?->email }})
**Service:** {{ $booking->service?->name }}
**Date:** {{ $booking->scheduled_at?->format('D, d M Y \a\t H:i') ?? 'Next available / Before EOD' }}
**Location:** {{ ucfirst($booking->location_type) }}{{ $booking->location_address ? ' – ' . $booking->location_address : '' }}
**Placed By:** {{ $booking->creator?->name }} ({{ $booking->creator?->role }})
</x-mail::panel>

@if($booking->customer_notes)
**Customer notes:** {{ $booking->customer_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/bookings/' . $booking->id">
View Booking
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>