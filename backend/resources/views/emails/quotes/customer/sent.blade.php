<x-mail::message>
# Hi {{ $quote->customer->first_name }}, your quote is ready!

Please review your quote below and let us know if you'd like to proceed.

<x-mail::table>
| | |
|:--|:--|
| **Quote #** | {{ $quote->quote_number }} |
| **Version** | v{{ $quote->version }} |
| **Type** | {{ ucfirst($quote->quote_type) }} |
| **Sent At** | {{ $quote->sent_at->format('d M Y, H:i') }} |
@if($quote->valid_until)
| **Valid Until** | {{ \Carbon\Carbon::parse($quote->valid_until)->format('d M Y') }} |
@endif
| **Subtotal** | {{ $quote->currency }} {{ number_format($quote->subtotal, 2) }} |
@if($quote->discount > 0)
| **Discount** | - {{ $quote->currency }} {{ number_format($quote->discount, 2) }}@if($quote->discount_percentage) ({{ $quote->discount_percentage }}%)@endif |
@endif
@if($quote->shipping_cost > 0)
| **Shipping** | {{ $quote->currency }} {{ number_format($quote->shipping_cost, 2) }} |
@endif
| **Tax** | {{ $quote->currency }} {{ number_format($quote->tax, 2) }} |
| **Total** | {{ $quote->currency }} {{ number_format($quote->total, 2) }} |
@if($quote->currency !== 'KES')
| **Total (KES)** | KES {{ number_format($quote->total_kes, 2) }} |
@endif
</x-mail::table>

@if($quote->payment_terms)
**Payment Terms:** {{ $quote->payment_terms }}
@endif

@if($quote->delivery_terms)
**Delivery Terms:** {{ $quote->delivery_terms }}
@endif

@if($quote->is_negotiable)
> 💬 This quote is open to negotiation. Feel free to reach out if you'd like to discuss the pricing.
@endif

@if($quote->terms_and_conditions)
**Terms & Conditions:** {{ $quote->terms_and_conditions }}
@endif

<x-mail::button :url="config('app.url') . '/quotes/' . $quote->quote_number">
Review & Respond to Quote
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>