<?php

namespace App\Mail\Orders\Customer;

use App\Mail\BaseMail;
use App\Models\Order;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class OrderCreated extends BaseMail
{
    public function __construct(public Order $order) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Order {$this->order->order_number} Received — We're On It!",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.orders.customer.created',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}