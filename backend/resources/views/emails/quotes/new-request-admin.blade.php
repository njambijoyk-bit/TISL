<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Quote Request</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .quote-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc3545; }
        .quote-number { font-size: 24px; font-weight: bold; color: #dc3545; }
        .customer-info { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .item { padding: 15px 0; border-bottom: 1px solid #eee; }
        .item:last-child { border-bottom: none; }
        .button { display: inline-block; background: #dc3545; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔔 New Quote Request!</h1>
        <p>Action Required</p>
    </div>
    
    <div class="content">
        <div class="quote-box">
            <p class="quote-number">Quote #{{ $quote_number }}</p>
            <p><strong>Received:</strong> {{ $quote->created_at->format('M d, Y - h:i A') }}</p>
            
            <div class="customer-info">
                <h3 style="margin-top: 0;">Customer Details:</h3>
                <p>
                    <strong>Name:</strong> {{ $customer_name }}<br>
                    <strong>Email:</strong> {{ $customer_email }}<br>
                    <strong>Phone:</strong> {{ $customer_phone }}
                    @if($quote->company_name)
                    <br><strong>Company:</strong> {{ $quote->company_name }}
                    @endif
                </p>
            </div>
            
            @if($quote->message)
            <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>Customer Message:</strong><br>
                {{ $quote->message }}
            </div>
            @endif
            
            @if($quote->delivery_address)
            <p><strong>Delivery Address:</strong><br>{{ $quote->delivery_address }}</p>
            @endif
            
            <h3>Requested Items:</h3>
            @foreach($items as $item)
            <div class="item">
                <strong>{{ $item->product_name }}</strong>
                @if($item->brand_name)
                <br><small>Brand: {{ $item->brand_name }}</small>
                @endif
                <br><strong>Quantity:</strong> {{ $item->quantity }}
                @if($item->customer_notes)
                <br><small style="color: #666;">Customer Notes: {{ $item->customer_notes }}</small>
                @endif
            </div>
            @endforeach
        </div>
        
        <center>
            <a href="{{ config('app.url') }}/admin/quotes/{{ $quote->id }}" class="button">
                Respond to Quote
            </a>
        </center>
        
        <p style="text-align: center; color: #dc3545;">
            <strong>⚡ Please respond within 24 hours!</strong>
        </p>
    </div>
    
    <div class="footer">
        <p><strong>TISL Admin System</strong></p>
        <p>This is an automated notification</p>
    </div>
</body>
</html>