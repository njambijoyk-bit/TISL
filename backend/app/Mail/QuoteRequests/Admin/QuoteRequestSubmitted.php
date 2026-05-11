<?php

namespace App\Mail\QuoteRequests\Admin;

use App\Mail\BaseMail;
use App\Models\QuoteRequest;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteRequestSubmitted extends BaseMail
{
    public function __construct(public QuoteRequest $quoteRequest) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New Quote Request — {$this->quoteRequest->request_number} [{$this->quoteRequest->priority}]",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.quote_requests.admin.submitted',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}