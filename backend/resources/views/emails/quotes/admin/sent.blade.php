<x-mail::message>
# Quote {{ $quote->quote_number }} — Sent to Customer

The following quote has been sent and is awaiting the customer's response.

<x-mail::table>
| | |
|:--|:--|
| **Quote #** | {{ $quote->quote_number }} |
| **Version** | v{{ $quote->version }} |
| **Customer** | {{ $quote->customer->first_name }} {{ $quote->customer->last_name }} |
| **Email** | {{ $quote->customer->email }} |
| **Sent At** | {{ $quote->sent_at->format('d M Y, H:i') }} |
@if($quote->valid_until)
| **Valid Until** | {{ \Carbon\Carbon::parse($quote->valid_until)->format('d M Y') }} |
@endif
| **Type** | {{ ucfirst($quote->quote_type) }} |
| **Pricing Type** | {{ ucwords(str_replace('_', ' ', $quote->pricing_type)) }} |
| **Negotiable** | {{ $quote->is_negotiable ? 'Yes' : 'No' }} |
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

@if($quote->admin_notes)
**Admin Notes:** {{ $quote->admin_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/quotes/' . $quote->quote_number">
View Quote
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>