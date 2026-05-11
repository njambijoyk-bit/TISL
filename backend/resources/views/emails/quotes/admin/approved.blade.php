<x-mail::message>
# Quote {{ $quote->quote_number }} — Accepted by Customer 🎉

The customer has accepted this quote. Please proceed accordingly.

<x-mail::table>
| | |
|:--|:--|
| **Quote #** | {{ $quote->quote_number }} |
| **Version** | v{{ $quote->version }} |
| **Customer** | {{ $quote->customer->first_name }} {{ $quote->customer->last_name }} |
| **Email** | {{ $quote->customer->email }} |
| **Phone** | {{ $quote->customer->phone ?? 'N/A' }} |
| **Responded At** | {{ $quote->responded_at->format('d M Y, H:i') }} |
| **Total** | {{ $quote->currency }} {{ number_format($quote->total, 2) }} |
@if($quote->currency !== 'KES')
| **Total (KES)** | KES {{ number_format($quote->total_kes, 2) }} |
@endif
@if($quote->payment_terms)
| **Payment Terms** | {{ $quote->payment_terms }} |
@endif
</x-mail::table>

@if($quote->converted_to_order_id)
This quote has already been converted to an order.

<x-mail::button :url="config('app.url') . '/admin/orders/' . $quote->order->order_number">
View Order
</x-mail::button>
@else
<x-mail::button :url="config('app.url') . '/admin/quotes/' . $quote->quote_number">
Convert to Order
</x-mail::button>
@endif

{{ config('app.name') }} Admin
</x-mail::message>