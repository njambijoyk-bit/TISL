<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Shipped</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .tracking-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #28a745; text-align: center; }
        .tracking-number { font-size: 24px; font-weight: bold; color: #28a745; letter-spacing: 2px; }
        .order-number { font-size: 18px; font-weight: bold; color: #0D8ABC; }
        .button { display: inline-block; background: #28a745; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .info-box { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📦 Your Order Has Shipped!</h1>
        <p>Great news, {{ $customer_name }}!</p>
    </div>
    
    <div class="content">
        <div class="tracking-box">
            <p>Your order is on its way!</p>
            <p class="order-number">Order #{{ $order_number }}</p>
            
            <div style="margin: 20px 0;">
                <p style="margin-bottom: 5px;"><strong>Tracking Number:</strong></p>
                <p class="tracking-number">{{ $tracking_number }}</p>
            </div>
            
            <p><strong>Courier:</strong> {{ $courier_company }}</p>
            
            @if($estimated_delivery)
            <div class="info-box">
                <strong>Estimated Delivery:</strong> {{ $estimated_delivery->format('l, M d, Y') }}
            </div>
            @endif
        </div>
        
        <center>
            <a href="{{ config('app.frontend_url') }}/orders/{{ $order->id }}/track" class="button">
                Track Your Package
            </a>
        </center>
        
        <h3>What's Next?</h3>
        <ul>
            <li>📍 Track your package using the tracking number above</li>
            <li>📞 The courier may call you before delivery</li>
            <li>🏠 Ensure someone is available to receive the package</li>
            <li>📋 Inspect the package upon delivery</li>
        </ul>
        
        <div class="info-box">
            <strong>💡 Tip:</strong> Save the tracking number to monitor your delivery progress!
        </div>
        
        <p>If you have any questions about your delivery, please contact us at support@tisl.com or call +254 700 000 000.</p>
    </div>
    
    <div class="footer">
        <p><strong>Target Industrial Suppliers Limited (TISL)</strong></p>
        <p>Your trusted partner for quality industrial supplies in Kenya</p>
        <p>&copy; {{ date('Y') }} TISL. All rights reserved.</p>
    </div>
</body>
</html>