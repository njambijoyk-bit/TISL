<x-mail::message>
# Hi {{ $quoteRequest->customer->first_name }}, we need a little more information

We've reviewed your quote request but need some clarification before we can proceed.

<x-mail::table>
| | |
|:--|:--|
| **Request #** | {{ $quoteRequest->request_number }} |
| **Title** | {{ $quoteRequest->request_title }} |
| **Date Submitted** | {{ $quoteRequest->created_at->format('d M Y') }} |
</x-mail::table>

@if($quoteRequest->clarification_notes)
**What We Need:**

{{ $quoteRequest->clarification_notes }}
@endif

Please respond at your earliest convenience so we can move forward with your quote.

<x-mail::button :url="config('app.url') . '/quote-requests/' . $quoteRequest->request_number">
Respond to Clarification
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>