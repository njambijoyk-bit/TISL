<x-mail::message>
# Order {{ $order->order_number }} — Cancelled

The following order has been cancelled.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Customer** | {{ $order->customer->first_name }} {{ $order->customer->last_name }} |
| **Email** | {{ $order->customer->email }} |
| **Phone** | {{ $order->customer->phone ?? 'N/A' }} |
| **Cancelled At** | {{ $order->cancelled_at->format('d M Y, H:i') }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
| **Payment Status** | {{ ucfirst($order->payment_status) }} |
</x-mail::table>

@if($order->cancellation_reason)
**Cancellation Reason:** {{ $order->cancellation_reason }}
@endif

<x-mail::button :url="config('app.url') . '/admin/orders/' . $order->order_number" color="red">
View Order
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>