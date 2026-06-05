<?php

namespace App\Mail\Orders\Customer;

use App\Mail\BaseMail;
use App\Models\Order;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class OrderRestored extends BaseMail
{
    public function __construct(public Order $order) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your Order {$this->order->order_number} Has Been Restored",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.orders.customer.restored',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}