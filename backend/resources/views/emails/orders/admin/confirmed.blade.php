<x-mail::message>
# Order {{ $order->order_number }} — Confirmed, Begin Processing

This order has been confirmed. Please begin processing it.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Customer** | {{ $order->customer->first_name }} {{ $order->customer->last_name }} |
| **Email** | {{ $order->customer->email }} |
| **Confirmed At** | {{ $order->confirmed_at->format('d M Y, H:i') }} |
| **Delivery Method** | {{ ucwords(str_replace('_', ' ', $order->delivery_method)) }} |
| **Priority** | {{ ucfirst($order->priority) }} |
@if($order->shipping_address)
| **Ship To** | {{ $order->shipping_address }} |
@endif
@if($order->estimated_delivery_date)
| **Estimated Delivery** | {{ \Carbon\Carbon::parse($order->estimated_delivery_date)->format('d M Y') }} |
@endif
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
</x-mail::table>

@if($order->admin_notes)
**Admin Notes:** {{ $order->admin_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/orders/' . $order->order_number">
Manage Order
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>