<?php

namespace App\Services\Mail;

use App\Models\Order;
use Illuminate\Support\Facades\Mail;
use App\Mail\Orders\Customer\OrderCreated as CustomerOrderCreated;
use App\Mail\Orders\Customer\OrderConfirmed as CustomerOrderConfirmed;
use App\Mail\Orders\Customer\OrderCancelled as CustomerOrderCancelled;
use App\Mail\Orders\Customer\OrderShipped as CustomerOrderShipped;
use App\Mail\Orders\Admin\OrderCreated as AdminOrderCreated;
use App\Mail\Orders\Admin\OrderConfirmed as AdminOrderConfirmed;
use App\Mail\Orders\Admin\OrderCancelled as AdminOrderCancelled;
use App\Mail\Orders\Admin\OrderShipped as AdminOrderShipped;
use App\Mail\Orders\Customer\OrderRestored as CustomerOrderRestored;
use App\Mail\Orders\Admin\OrderRestored as AdminOrderRestored;

class OrderMailService
{
    public function sendOrderCreated(Order $order): void
    {
        Mail::to($order->customer->email)
            ->queue(new CustomerOrderCreated($order));

        Mail::to(config('mail.admin'))
            ->queue(new AdminOrderCreated($order));
    }

    public function sendOrderConfirmed(Order $order): void
    {
        Mail::to($order->customer->email)
            ->queue(new CustomerOrderConfirmed($order));

        Mail::to(config('mail.admin'))
            ->queue(new AdminOrderConfirmed($order));
    }

    public function sendOrderCancelled(Order $order): void
    {
        Mail::to($order->customer->email)
            ->queue(new CustomerOrderCancelled($order));

        Mail::to(config('mail.admin'))
            ->queue(new AdminOrderCancelled($order));
    }

    public function sendOrderShipped(Order $order): void
    {
        Mail::to($order->customer->email)
            ->queue(new CustomerOrderShipped($order));

        Mail::to(config('mail.admin'))
            ->queue(new AdminOrderShipped($order));
    }

    public function sendOrderRestored(Order $order): void
    {
        Mail::to($order->customer->email)
            ->queue(new CustomerOrderRestored($order));

        Mail::to(config('mail.admin'))
            ->queue(new AdminOrderRestored($order));
    }
}