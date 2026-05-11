<x-mail::message>
# Quote {{ $quote->quote_number }} — Rejected by Customer

The customer has declined this quote.

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
</x-mail::table>

@if($quote->rejection_reason)
**Rejection Reason:** {{ $quote->rejection_reason }}
@endif

You may want to follow up with the customer or issue a revised quote.

<x-mail::button :url="config('app.url') . '/admin/quotes/' . $quote->quote_number">
View & Revise Quote
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>