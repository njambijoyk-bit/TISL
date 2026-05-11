<x-mail::message>
# Your order is on its way, {{ $order->customer->first_name }}! 🚚

Great news — your order has been shipped and is heading to you.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Shipped At** | {{ $order->shipped_at->format('d M Y, H:i') }} |
| **Delivery Method** | {{ ucwords(str_replace('_', ' ', $order->delivery_method)) }} |
@if($order->courier_company)
| **Courier** | {{ $order->courier_company }} |
@endif
@if($order->tracking_number)
| **Tracking #** | {{ $order->tracking_number }} |
@endif
@if($order->estimated_delivery_date)
| **Estimated Delivery** | {{ \Carbon\Carbon::parse($order->estimated_delivery_date)->format('d M Y') }} |
@endif
</x-mail::table>

@if($order->shipping_address)
**Delivering To:** {{ $order->shipping_address }}
@endif

<x-mail::button :url="config('app.url') . '/orders/' . $order->order_number">
View Order Details
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>