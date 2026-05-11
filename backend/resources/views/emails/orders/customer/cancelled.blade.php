<x-mail::message>
# Your order has been cancelled, {{ $order->customer->first_name }}

We're sorry to let you know that your order has been cancelled.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Cancelled At** | {{ $order->cancelled_at->format('d M Y, H:i') }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
| **Payment Status** | {{ ucfirst($order->payment_status) }} |
</x-mail::table>

@if($order->cancellation_reason)
**Reason:** {{ $order->cancellation_reason }}
@endif

If this was a mistake or you have any questions, please don't hesitate to contact us.

<x-mail::button :url="config('app.url') . '/contact'" color="red">
Contact Support
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>