<x-mail::message>
# Hi {{ $quoteRequest->customer->first_name }}, we've received your quote request!

Thank you for reaching out. Our team is reviewing your request and will get back to you shortly.

<x-mail::table>
| | |
|:--|:--|
| **Request #** | {{ $quoteRequest->request_number }} |
| **Title** | {{ $quoteRequest->request_title }} |
| **Type** | {{ ucwords(str_replace('_', ' ', $quoteRequest->request_type)) }} |
| **Priority** | {{ ucfirst($quoteRequest->priority) }} |
| **Date** | {{ $quoteRequest->created_at->format('d M Y, H:i') }} |
@if($quoteRequest->budget_range)
| **Budget Range** | {{ $quoteRequest->budget_range }} |
@endif
@if($quoteRequest->timeline_needed)
| **Timeline** | {{ $quoteRequest->timeline_needed }} |
@endif
@if($quoteRequest->expires_at)
| **Request Expires** | {{ \Carbon\Carbon::parse($quoteRequest->expires_at)->format('d M Y') }} |
@endif
</x-mail::table>

@if($quoteRequest->request_description)
**Description:** {{ $quoteRequest->request_description }}
@endif

@if($quoteRequest->customer_notes)
**Your Notes:** {{ $quoteRequest->customer_notes }}
@endif

We'll notify you as soon as your quote is ready.

<x-mail::button :url="config('app.url') . '/quote-requests/' . $quoteRequest->request_number">
View Your Request
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>