<?php

namespace App\Mail\Quotes\Customer;

use App\Mail\BaseMail;
use App\Models\Quote;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteRejected extends BaseMail
{
    public function __construct(public Quote $quote) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your Response on Quote {$this->quote->quote_number}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.quotes.customer.rejected',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}