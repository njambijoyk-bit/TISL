<x-mail::message>
# New Order Received — {{ $order->order_number }}

A new order has been placed and is awaiting your confirmation.

<x-mail::table>
| | |
|:--|:--|
| **Order #** | {{ $order->order_number }} |
| **Order Type** | {{ ucfirst($order->order_type) }} |
| **Priority** | {{ ucfirst($order->priority) }} |
| **Customer** | {{ $order->customer->first_name }} {{ $order->customer->last_name }} |
| **Customer #** | {{ $order->customer->customer_number }} |
| **Email** | {{ $order->customer->email }} |
| **Phone** | {{ $order->customer->phone ?? 'N/A' }} |
@if($order->customer->company_name)
| **Company** | {{ $order->customer->company_name }} |
@endif
| **Date** | {{ $order->created_at->format('d M Y, H:i') }} |
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
| **Tax** | {{ $order->currency }} {{ number_format($order->tax, 2) }} |
| **Shipping** | {{ $order->currency }} {{ number_format($order->shipping_cost, 2) }} |
| **Total** | {{ $order->currency }} {{ number_format($order->total, 2) }} |
@if($order->currency !== 'KES')
| **Total (KES)** | KES {{ number_format($order->total_kes, 2) }} |
@endif
</x-mail::table>

@if($order->customer_notes)
**Customer Notes:** {{ $order->customer_notes }}
@endif

<x-mail::button :url="config('app.url') . '/admin/orders/' . $order->order_number">
Review & Confirm Order
</x-mail::button>

{{ config('app.name') }} Admin
</x-mail::message>