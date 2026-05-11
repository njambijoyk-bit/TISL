<?php

namespace App\Services\Mail;

use App\Models\QuoteRequest;
use Illuminate\Support\Facades\Mail;
use App\Mail\QuoteRequests\Customer\QuoteRequestSubmitted as CustomerQuoteRequestSubmitted;
use App\Mail\QuoteRequests\Customer\QuoteRequestRejected as CustomerQuoteRequestRejected;
use App\Mail\QuoteRequests\Customer\QuoteRequestClarification as CustomerQuoteRequestClarification;
use App\Mail\QuoteRequests\Admin\QuoteRequestSubmitted as AdminQuoteRequestSubmitted;

class QuoteRequestMailService
{
    public function sendQuoteRequestSubmitted(QuoteRequest $quoteRequest): void
    {
        Mail::to($quoteRequest->customer->email)
            ->queue(new CustomerQuoteRequestSubmitted($quoteRequest));

        Mail::to(config('mail.admin'))
            ->queue(new AdminQuoteRequestSubmitted($quoteRequest));
    }

    public function sendQuoteRequestRejected(QuoteRequest $quoteRequest): void
    {
        Mail::to($quoteRequest->customer->email)
            ->queue(new CustomerQuoteRequestRejected($quoteRequest));
    }

    public function sendQuoteRequestClarification(QuoteRequest $quoteRequest): void
    {
        Mail::to($quoteRequest->customer->email)
            ->queue(new CustomerQuoteRequestClarification($quoteRequest));
    }
}