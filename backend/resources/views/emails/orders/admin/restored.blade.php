<x-mail::message>
# Order {{ $order->order_number }} — Restored

The following order has been restored and is active again.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Customer** | {{ $order->customer->first_name }} {{ $order->customer->last_name }} |
| **Email** | {{ $order->customer->email }} |
| **Phone** | {{ $order->customer->phone ?? 'N/A' }} |
| **Restored At** | {{ now()->format('d M Y, H:i') }} |
| **Status** | {{ ucfirst($order->status) }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
| **Payment Status** | {{ ucfirst($order->payment_status) }} |
</x-mail::table>

@if($order->admin_notes)
**Notes:** {{ $order->admin_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/orders/' . $order->order_number" color="green">
View Order
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>