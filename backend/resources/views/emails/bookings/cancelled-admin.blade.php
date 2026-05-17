<x-mail::message>
# Booking Cancelled by Customer

A customer has cancelled their booking.

<x-mail::panel>
**Booking Reference:** {{ $booking->booking_number }}
**Customer:** {{ $booking->customer?->first_name }} {{ $booking->customer?->last_name }} ({{ $booking->customer?->email }})
**Service:** {{ $booking->service?->name }}
**Original Date:** {{ $booking->scheduled_at?->format('D, d M Y \a\t H:i') ?? 'N/A' }}
**Reason:** {{ $booking->cancellation_reason }}
**Cancelled At:** {{ $booking->cancelled_at?->format('D, d M Y \a\t H:i') }}
@if($booking->cancellation_fee_applied > 0)
**Fee Applied:** KES {{ number_format($booking->cancellation_fee_applied, 2) }}
@endif
</x-mail::panel>

<x-mail::button :url="config('app.url') . '/admin/bookings/' . $booking->id">
View Booking
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>