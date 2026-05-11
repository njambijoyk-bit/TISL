<?php

namespace App\Mail\Orders\Admin;

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
            subject: "New Order Received — {$this->order->order_number} [{$this->order->priority}]",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.orders.admin.created',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}