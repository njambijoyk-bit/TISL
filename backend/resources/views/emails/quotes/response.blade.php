<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quote Response</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FF9800; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .quote-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd; }
        .quote-number { font-size: 24px; font-weight: bold; color: #FF9800; }
        .item { padding: 15px 0; border-bottom: 1px solid #eee; }
        .item:last-child { border-bottom: none; }
        .total { font-size: 20px; font-weight: bold; color: #FF9800; padding-top: 15px; border-top: 2px solid #FF9800; }
        .button { display: inline-block; background: #FF9800; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning-box { background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #FF9800; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💼 Your Quote is Ready!</h1>
        <p>Hello {{ $customer_name }},</p>
    </div>
    
    <div class="content">
        <p>Thank you for your quote request. We're pleased to provide you with our pricing:</p>
        
        <div class="quote-box">
            <p class="quote-number">Quote #{{ $quote_number }}</p>
            <p><strong>Quote Date:</strong> {{ $quote->quoted_at->format('M d, Y') }}</p>
            
            <h3>Quoted Items:</h3>
            @foreach($items as $item)
            <div class="item">
                <strong>{{ $item->product_name }}</strong>
                @if($item->brand_name)
                <br><small>Brand: {{ $item->brand_name }}</small>
                @endif
                <br>Quantity: {{ $item->quantity }}
                <br>Unit Price: KSh {{ number_format($item->unit_price, 2) }}
                @if($item->admin_notes)
                <br><small style="color: #666;">{{ $item->admin_notes }}</small>
                @endif
                <br><strong>Line Total: KSh {{ number_format($item->line_total, 2) }}</strong>
                
                <br><small>
                    <strong>Availability:</strong> {{ ucwords(str_replace('_', ' ', $item->availability)) }}
                    @if($item->lead_time_days)
                    | <strong>Lead Time:</strong> {{ $item->lead_time_days }} days
                    @endif
                </small>
            </div>
            @endforeach
            
            <div style="margin-top: 20px;">
                <p><strong>Subtotal:</strong> KSh {{ number_format($quote->quoted_amount - $quote->delivery_cost, 2) }}</p>
                @if($quote->delivery_cost > 0)
                <p><strong>Delivery:</strong> KSh {{ number_format($quote->delivery_cost, 2) }}</p>
                @endif
                <p class="total">Total: KSh {{ $quoted_amount }}</p>
            </div>
            
            @if($quote->payment_terms)
            <p><strong>Payment Terms:</strong> {{ ucwords(str_replace('_', ' ', $quote->payment_terms)) }}</p>
            @endif
            
            @if($quote->admin_notes)
            <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin-top: 15px;">
                <strong>Additional Notes:</strong><br>
                {{ $quote->admin_notes }}
            </div>
            @endif
        </div>
        
        <div class="warning-box">
            <strong>⏰ Important:</strong> This quote is valid until <strong>{{ $valid_until->format('M d, Y') }}</strong>
        </div>
        
        <center>
            <a href="{{ config('app.frontend_url') }}/quotes/{{ $quote->id }}" class="button">
                Accept Quote
            </a>
        </center>
        
        <p>To accept this quote and proceed with your order, please click the button above or reply to this email.</p>
        
        <p>If you have any questions or would like to negotiate the terms, please don't hesitate to contact us.</p>
        
        <p><strong>Contact Us:</strong><br>
        📧 Email: sales@tisl.com<br>
        📞 Phone: +254 700 000 000<br>
        💬 WhatsApp: +254 700 000 000</p>
    </div>
    
    <div class="footer">
        <p><strong>Target Industrial Suppliers Limited (TISL)</strong></p>
        <p>Your trusted partner for quality industrial supplies in Kenya</p>
        <p>&copy; {{ date('Y') }} TISL. All rights reserved.</p>
    </div>
</body>
</html>