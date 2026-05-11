<?php

namespace App\Mail\QuoteRequests\Customer;

use App\Mail\BaseMail;
use App\Models\QuoteRequest;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteRequestRejected extends BaseMail
{
    public function __construct(public QuoteRequest $quoteRequest) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Update on Your Quote Request {$this->quoteRequest->request_number}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.quote_requests.customer.rejected',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}