<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #0D8ABC; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .order-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
        .order-number { font-size: 24px; font-weight: bold; color: #0D8ABC; }
        .item { padding: 15px 0; border-bottom: 1px solid #eee; }
        .item:last-child { border-bottom: none; }
        .total { font-size: 20px; font-weight: bold; color: #0D8ABC; padding-top: 15px; border-top: 2px solid #0D8ABC; }
        .button { display: inline-block; background: #0D8ABC; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>✅ Order Confirmed!</h1>
        <p>Thank you for your order, {{ $customer_name }}!</p>
    </div>
    
    <div class="content">
        <div class="order-box">
            <p>Your order has been received and is being processed.</p>
            
            <p class="order-number">Order #{{ $order_number }}</p>
            <p><strong>Order Date:</strong> {{ $order->created_at->format('M d, Y') }}</p>
            
            <h3>Order Items:</h3>
            @foreach($items as $item)
            <div class="item">
                <strong>{{ $item->product_name }}</strong><br>
                Quantity: {{ $item->quantity }} × KSh {{ number_format($item->unit_price, 2) }}<br>
                <strong>Subtotal: KSh {{ number_format($item->line_total, 2) }}</strong>
            </div>
            @endforeach
            
            <div style="margin-top: 20px;">
                <p><strong>Subtotal:</strong> KSh {{ number_format($order->subtotal, 2) }}</p>
                @if($order->discount > 0)
                <p><strong>Discount:</strong> -KSh {{ number_format($order->discount, 2) }}</p>
                @endif
                <p><strong>Tax (16%):</strong> KSh {{ number_format($order->tax, 2) }}</p>
                <p><strong>Shipping:</strong> KSh {{ number_format($order->shipping_cost, 2) }}</p>
                <p class="total">Total: KSh {{ $total }}</p>
            </div>
            
            <h3>Shipping Address:</h3>
            <p>{{ $order->shipping_address }}</p>
            
            <h3>Payment Method:</h3>
            <p>{{ ucwords(str_replace('_', ' ', $order->payment_method)) }}</p>
            <p><strong>Payment Status:</strong> {{ ucfirst($order->payment_status) }}</p>
        </div>
        
        <center>
            <a href="{{ config('app.frontend_url') }}/orders/{{ $order->id }}" class="button">
                View Order Details
            </a>
        </center>
        
        <p>We'll send you another email when your order has been shipped.</p>
        
        <p>If you have any questions, please contact us at support@tisl.com or call +254 700 000 000.</p>
    </div>
    
    <div class="footer">
        <p><strong>Target Industrial Suppliers Limited (TISL)</strong></p>
        <p>Your trusted partner for quality industrial supplies in Kenya</p>
        <p>&copy; {{ date('Y') }} TISL. All rights reserved.</p>
    </div>
</body>
</html>