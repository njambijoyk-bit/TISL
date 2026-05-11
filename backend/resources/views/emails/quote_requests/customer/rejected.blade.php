<x-mail::message>
# Hi {{ $quoteRequest->customer->first_name }}, we're unable to process your request

We're sorry, but we are unable to fulfil your quote request at this time.

<x-mail::table>
| | |
|:--|:--|
| **Request #** | {{ $quoteRequest->request_number }} |
| **Title** | {{ $quoteRequest->request_title }} |
| **Type** | {{ ucwords(str_replace('_', ' ', $quoteRequest->request_type)) }} |
| **Date Submitted** | {{ $quoteRequest->created_at->format('d M Y') }} |
</x-mail::table>

@if($quoteRequest->rejection_reason)
**Reason:** {{ $quoteRequest->rejection_reason }}
@endif

If you believe this is an error or would like to submit a revised request, feel free to reach out.

<x-mail::button :url="config('app.url') . '/contact'">
Contact Us
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>