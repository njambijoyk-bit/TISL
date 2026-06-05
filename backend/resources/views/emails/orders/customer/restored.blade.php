<x-mail::message>
# Good news, {{ $order->customer->first_name }} — your order is back!

Your order has been successfully restored and is being processed again.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Restored At** | {{ now()->format('d M Y, H:i') }} |
| **Status** | {{ ucfirst($order->status) }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
| **Payment Status** | {{ ucfirst($order->payment_status) }} |
</x-mail::table>

If you have any questions about your order, feel free to reach out.

<x-mail::button :url="config('app.url') . '/orders'" color="green">
View My Orders
</x-mail::button>

Thanks,
{{ config('app.name') }}
</x-mail::message>