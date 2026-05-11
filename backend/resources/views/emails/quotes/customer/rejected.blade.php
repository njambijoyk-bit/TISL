<x-mail::message>
# We've noted your decision, {{ $quote->customer->first_name }}

We're sorry the quote didn't meet your expectations. We'd love the opportunity to make it right.

<x-mail::table>
| | |
|:--|:--|
| **Quote #** | {{ $quote->quote_number }} |
| **Version** | v{{ $quote->version }} |
| **Responded At** | {{ $quote->responded_at->format('d M Y, H:i') }} |
| **Total** | {{ $quote->currency }} {{ number_format($quote->total, 2) }} |
</x-mail::table>

@if($quote->rejection_reason)
**Your Reason:** {{ $quote->rejection_reason }}
@endif

If you'd like us to revise the quote or explore alternatives, don't hesitate to reach out.

<x-mail::button :url="config('app.url') . '/contact'">
Contact Us
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>