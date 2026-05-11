<x-mail::message>
# Great news, {{ $order->customer->first_name }}! Your order is confirmed ✅

We've confirmed your order and our team is now working on it.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Confirmed At** | {{ $order->confirmed_at->format('d M Y, H:i') }} |
| **Delivery Method** | {{ ucwords(str_replace('_', ' ', $order->delivery_method)) }} |
@if($order->estimated_delivery_date)
| **Estimated Delivery** | {{ \Carbon\Carbon::parse($order->estimated_delivery_date)->format('d M Y') }} |
@endif
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
| **Payment Status** | {{ ucfirst($order->payment_status) }} |
</x-mail::table>

@if($order->shipping_address)
**Shipping To:** {{ $order->shipping_address }}
@endif

We'll notify you once your order has been shipped.

<x-mail::button :url="config('app.url') . '/orders/' . $order->order_number">
Track Your Order
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>