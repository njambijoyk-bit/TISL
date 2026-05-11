<x-mail::message>
# Order {{ $order->order_number }} — Marked as Shipped

The following order has been shipped.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Customer** | {{ $order->customer->first_name }} {{ $order->customer->last_name }} |
| **Email** | {{ $order->customer->email }} |
| **Shipped At** | {{ $order->shipped_at->format('d M Y, H:i') }} |
| **Delivery Method** | {{ ucwords(str_replace('_', ' ', $order->delivery_method)) }} |
@if($order->courier_company)
| **Courier** | {{ $order->courier_company }} |
@endif
@if($order->tracking_number)
| **Tracking #** | {{ $order->tracking_number }} |
@endif
@if($order->shipping_address)
| **Ship To** | {{ $order->shipping_address }} |
@endif
@if($order->estimated_delivery_date)
| **Estimated Delivery** | {{ \Carbon\Carbon::parse($order->estimated_delivery_date)->format('d M Y') }} |
@endif
</x-mail::table>

<x-mail::button :url="config('app.url') . '/admin/orders/' . $order->order_number">
View Order
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>