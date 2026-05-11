<?php

namespace App\Mail\Quotes\Admin;

use App\Mail\BaseMail;
use App\Models\Quote;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteSent extends BaseMail
{
    public function __construct(public Quote $quote) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Quote {$this->quote->quote_number} — Sent to Customer",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.quotes.admin.sent',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}