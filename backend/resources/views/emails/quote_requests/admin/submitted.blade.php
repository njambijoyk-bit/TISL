<x-mail::message>
# New Quote Request — {{ $quoteRequest->request_number }}

A new quote request has been submitted and requires your attention.

<x-mail::table>
| | |
|:--|:--|
| **Request #** | {{ $quoteRequest->request_number }} |
| **Title** | {{ $quoteRequest->request_title }} |
| **Type** | {{ ucwords(str_replace('_', ' ', $quoteRequest->request_type)) }} |
| **Priority** | {{ ucfirst($quoteRequest->priority) }} |
| **Customer** | {{ $quoteRequest->customer->first_name }} {{ $quoteRequest->customer->last_name }} |
| **Customer #** | {{ $quoteRequest->customer->customer_number }} |
| **Email** | {{ $quoteRequest->customer->email }} |
| **Phone** | {{ $quoteRequest->customer->phone ?? 'N/A' }} |
@if($quoteRequest->customer->company_name)
| **Company** | {{ $quoteRequest->customer->company_name }} |
@endif
| **Date** | {{ $quoteRequest->created_at->format('d M Y, H:i') }} |
@if($quoteRequest->budget_range)
| **Budget Range** | {{ $quoteRequest->budget_range }} |
@endif
@if($quoteRequest->timeline_needed)
| **Timeline Needed** | {{ $quoteRequest->timeline_needed }} |
@endif
@if($quoteRequest->delivery_location)
| **Delivery Location** | {{ $quoteRequest->delivery_location }} |
@endif
@if($quoteRequest->expires_at)
| **Expires At** | {{ \Carbon\Carbon::parse($quoteRequest->expires_at)->format('d M Y') }} |
@endif
</x-mail::table>

**Description:** {{ $quoteRequest->request_description }}

@if($quoteRequest->customer_notes)
**Customer Notes:** {{ $quoteRequest->customer_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/quote-requests/' . $quoteRequest->request_number">
Review & Process Request
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>