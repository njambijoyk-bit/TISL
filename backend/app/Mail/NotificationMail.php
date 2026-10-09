<?php

namespace App\Mail;

use App\Models\CompanyProfile;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** A notification as an email: the company's name, the message, one button, and the company's phone and WhatsApp in the footer. */
class NotificationMail extends BaseMail
{
    public function __construct(public string $subjectLine, public string $messageText, public ?string $actionUrl = null, public ?string $actionText = null, public string $greeting = 'Hello')
    {
    }

    public function envelope(): Envelope
    {
        $replyTo = config('mail.reply_to_address') ?: CompanyProfile::defaultEmail();

        return new Envelope(subject: $this->subjectLine, replyTo: $replyTo ? [new \Illuminate\Mail\Mailables\Address($replyTo, CompanyProfile::name())] : []);
    }

    public function content(): Content
    {
        $digits = CompanyProfile::waDigits(CompanyProfile::defaultPhone());

        return new Content(view: 'emails.notification', with: [
            'company' => CompanyProfile::name(), 'phone' => CompanyProfile::defaultPhone(), 'companyEmail' => CompanyProfile::defaultEmail(),
            'whatsappUrl' => $digits ? 'https://wa.me/' . $digits . '?text=' . rawurlencode('Hello ' . CompanyProfile::name() . ', about: ' . $this->subjectLine) : null,
            'actionUrl' => $this->absolute($this->actionUrl),
        ]);
    }

    /** A link from the app is relative (/orders/12): make it a full address for an email. */
    private function absolute(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        return preg_match('#^https?://#i', $url) ? $url : rtrim((string) config('app.frontend_url'), '/') . '/' . ltrim($url, '/');
    }
}
