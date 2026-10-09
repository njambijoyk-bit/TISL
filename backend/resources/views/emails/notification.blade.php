<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ $subjectLine }}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#111827;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:bold;">{{ $company }}</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">{{ $greeting }},</p>
<h1 style="margin:0 0 12px;font-size:18px;line-height:1.3;">{{ $subjectLine }}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;white-space:pre-line;">{{ $messageText }}</p>
@if ($actionUrl)
<p style="margin:0 0 8px;"><a href="{{ $actionUrl }}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:bold;">{{ $actionText ?: 'Open' }}</a></p>
@endif
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;line-height:1.6;color:#6b7280;">
Questions? @if ($whatsappUrl)<a href="{{ $whatsappUrl }}" style="color:#047857;">Chat with us on WhatsApp</a>@endif
@if ($phone) · call {{ $phone }}@endif
@if ($companyEmail) · email {{ $companyEmail }}@endif
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
