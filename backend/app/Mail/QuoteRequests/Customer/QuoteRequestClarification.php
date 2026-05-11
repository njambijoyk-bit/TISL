<?php

namespace App\Mail\QuoteRequests\Customer;

use App\Mail\BaseMail;
use App\Models\QuoteRequest;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteRequestClarification extends BaseMail
{
    public function __construct(public QuoteRequest $quoteRequest) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Clarification Needed — Request {$this->quoteRequest->request_number}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.quote_requests.customer.clarification',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}