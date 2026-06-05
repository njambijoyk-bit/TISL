<?php

namespace App\Mail;

use App\Models\CustomerCreditInvoice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class CreditInvoiceMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly CustomerCreditInvoice $invoice,
    ) {}

    public function envelope(): Envelope
    {
        $number = $this->invoice->invoice_number;

        return new Envelope(
            subject: "Invoice {$number} from TISL",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.credit.invoice',
            with: [
                'invoice'  => $this->invoice->load(['items', 'customer', 'currency']),
                'customer' => $this->invoice->customer,
            ],
        );
    }
}