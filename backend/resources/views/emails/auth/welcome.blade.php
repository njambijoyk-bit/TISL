<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to TISL</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #0D8ABC 0%, #0a6d96 100%); color: white; padding: 40px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 32px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .welcome-box { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0D8ABC; }
        .feature { padding: 15px; margin: 10px 0; background: #f0f8ff; border-radius: 5px; }
        .button { display: inline-block; background: #0D8ABC; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Welcome to TISL!</h1>
        <p style="font-size: 18px;">Your Industrial Supplies Partner</p>
    </div>
    
    <div class="content">
        <div class="welcome-box">
            <h2>Hello {{ $name }}! 👋</h2>
            <p>Thank you for joining <strong>Target Industrial Suppliers Limited (TISL)</strong>. We're thrilled to have you as part of our community!</p>
            
            <p>Your account has been successfully created with:</p>
            <p><strong>📧 Email:</strong> {{ $email }}</p>
        </div>
        
        <h3>What You Can Do Now:</h3>
        
        <div class="feature">
            <strong>🛍️ Browse Our Catalog</strong><br>
            Explore thousands of quality industrial supplies, tools, and equipment.
        </div>
        
        <div class="feature">
            <strong>💰 Request Quotes</strong><br>
            Need bulk pricing or custom requirements? Request a quote and we'll get back to you within 24 hours.
        </div>
        
        <div class="feature">
            <strong>📦 Track Orders</strong><br>
            Keep track of all your orders in one place with real-time updates.
        </div>
        
        <div class="feature">
            <strong>💳 Multiple Payment Options</strong><br>
            Pay via M-Pesa, bank transfer, credit card, or request an invoice.
        </div>
        
        <center>
            <a href="{{ config('app.frontend_url') }}/products" class="button">
                Start Shopping
            </a>
        </center>
        
        <h3>Need Help?</h3>
        <p>Our support team is here to assist you:</p>
        <p>
            📧 <strong>Email:</strong> support@tisl.com<br>
            📞 <strong>Phone:</strong> +254 700 000 000<br>
            💬 <strong>WhatsApp:</strong> +254 700 000 000<br>
            ⏰ <strong>Hours:</strong> Mon-Fri: 8AM-6PM, Sat: 9AM-3PM
        </p>
        
        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <strong>💡 Pro Tip:</strong> Complete your profile to get personalized recommendations and exclusive offers!
        </div>
    </div>
    
    <div class="footer">
        <p><strong>Target Industrial Suppliers Limited (TISL)</strong></p>
        <p>Nairobi, Kenya | www.tisl.com</p>
        <p>&copy; {{ date('Y') }} TISL. All rights reserved.</p>
        <p style="font-size: 12px; color: #999;">
            You're receiving this email because you created an account at TISL.
        </p>
    </div>
</body>
</html>