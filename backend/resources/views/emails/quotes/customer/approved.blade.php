<x-mail::message>
# Thank you, {{ $quote->customer->first_name }}! You've accepted the quote ✅

We're thrilled to move forward. Our team will be in touch shortly.

<x-mail::table>
| | |
|:--|:--|
| **Quote #** | {{ $quote->quote_number }} |
| **Version** | v{{ $quote->version }} |
| **Responded At** | {{ $quote->responded_at->format('d M Y, H:i') }} |
| **Total** | {{ $quote->currency }} {{ number_format($quote->total, 2) }} |
@if($quote->currency !== 'KES')
| **Total (KES)** | KES {{ number_format($quote->total_kes, 2) }} |
@endif
@if($quote->payment_terms)
| **Payment Terms** | {{ $quote->payment_terms }} |
@endif
@if($quote->valid_until)
| **Quote Valid Until** | {{ \Carbon\Carbon::parse($quote->valid_until)->format('d M Y') }} |
@endif
</x-mail::table>

@if($quote->converted_to_order_id)
Your quote has been converted to an order. You can track it below.

<x-mail::button :url="config('app.url') . '/orders/' . $quote->order->order_number">
View Your Order
</x-mail::button>
@else
<x-mail::button :url="config('app.url') . '/quotes/' . $quote->quote_number">
View Quote
</x-mail::button>
@endif

Thanks,
{{ config('app.name') }}
</x-mail::message>