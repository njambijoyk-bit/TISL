<?php

namespace App\Mail\Orders\Admin;

use App\Mail\BaseMail;
use App\Models\Order;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class OrderShipped extends BaseMail
{
    public function __construct(public Order $order) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Order {$this->order->order_number} Marked as Shipped",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.orders.admin.shipped',
        );
    }

    public function build(): static
    {
        return $this->withSuperadminBcc();
    }
}