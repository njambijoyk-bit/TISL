<x-mail::message>
# Booking Cancelled

Hi {{ $booking->customer?->first_name }},

Your booking has been cancelled.

<x-mail::panel>
**Booking Reference:** {{ $booking->booking_number }}
**Service:** {{ $booking->service?->name }}
**Original Date:** {{ $booking->scheduled_at?->format('D, d M Y \a\t H:i') ?? 'N/A' }}
**Cancellation Reason:** {{ $booking->cancellation_reason }}
@if($booking->cancellation_fee_applied > 0)
**Cancellation Fee:** KES {{ number_format($booking->cancellation_fee_applied, 2) }}
@endif
</x-mail::panel>

@if($booking->cancellation_fee_applied > 0)
A cancellation fee of **KES {{ number_format($booking->cancellation_fee_applied, 2) }}** applies as per our cancellation policy. Our team will be in touch regarding settlement.
@endif

If you'd like to rebook or have any questions, please contact us.

Thanks,
{{ config('app.name') }}
</x-mail::message>