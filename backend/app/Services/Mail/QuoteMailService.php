<?php

namespace App\Services\Mail;

use App\Models\Quote;
use Illuminate\Support\Facades\Mail;
use App\Mail\Quotes\Customer\QuoteSent as CustomerQuoteSent;
use App\Mail\Quotes\Customer\QuoteApproved as CustomerQuoteApproved;
use App\Mail\Quotes\Customer\QuoteRejected as CustomerQuoteRejected;
use App\Mail\Quotes\Admin\QuoteSent as AdminQuoteSent;
use App\Mail\Quotes\Admin\QuoteApproved as AdminQuoteApproved;
use App\Mail\Quotes\Admin\QuoteRejected as AdminQuoteRejected;

class QuoteMailService
{
    public function sendQuoteSent(Quote $quote): void
    {
        Mail::to($quote->customer->email)
            ->queue(new CustomerQuoteSent($quote));

        Mail::to(config('mail.admin'))
            ->queue(new AdminQuoteSent($quote));
    }

    public function sendQuoteApproved(Quote $quote): void
    {
        Mail::to($quote->customer->email)
            ->queue(new CustomerQuoteApproved($quote));

        Mail::to(config('mail.admin'))
            ->queue(new AdminQuoteApproved($quote));
    }

    public function sendQuoteRejected(Quote $quote): void
    {
        Mail::to($quote->customer->email)
            ->queue(new CustomerQuoteRejected($quote));

        Mail::to(config('mail.admin'))
            ->queue(new AdminQuoteRejected($quote));
    }
}