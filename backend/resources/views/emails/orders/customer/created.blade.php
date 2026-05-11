<x-mail::message>
# Hi {{ $order->customer->first_name }}, we've received your order!

Thank you for your order. We're reviewing it and will confirm shortly.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Date** | {{ $order->created_at->format('d M Y, H:i') }} |
| **Order Type** | {{ ucfirst($order->order_type) }} |
| **Payment Method** | {{ ucwords(str_replace('_', ' ', $order->payment_method)) }} |
| **Subtotal** | {{ $order->currency }} {{ number_format($order->subtotal, 2) }} |
@if($order->discount > 0)
| **Discount** | - {{ $order->currency }} {{ number_format($order->discount, 2) }} |
@endif
@if($order->referral_discount > 0)
| **Referral Discount** | - {{ $order->currency }} {{ number_format($order->referral_discount, 2) }} |
@endif
@if($order->promo_discount > 0)
| **Promo Discount** | - {{ $order->currency }} {{ number_format($order->promo_discount, 2) }} |
@endif
@if($order->shipping_cost > 0)
| **Shipping** | {{ $order->currency }} {{ number_format($order->shipping_cost, 2) }} |
@endif
| **Tax** | {{ $order->currency }} {{ number_format($order->tax, 2) }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
@if($order->currency !== 'KES')
| **Total (KES)** | KES {{ number_format($order->total_kes, 2) }} |
@endif
</x-mail::table>

@if($order->customer_notes)
**Your Notes:** {{ $order->customer_notes }}
@endif

<x-mail::button :url="config('app.url') . '/orders/' . $order->order_number">
View Your Order
</x-mail::button>

If you have any questions, feel free to reach out.

Thanks,
{{ config('app.name') }}
</x-mail::message>