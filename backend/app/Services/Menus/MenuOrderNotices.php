<?php

namespace App\Services\Menus;

use App\Models\Customer;
use App\Models\Menus\MenuOrder;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/**
 * Tells the customer how their food order is going (placed, ready, on its way, cancelled) and tells the kitchen when a new order arrives.
 * Never raises: a problem telling someone must not undo what just happened.
 */
class MenuOrderNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function when(MenuOrder $o): string
    {
        return $o->asap ? 'as soon as it is ready' : 'at '.$o->fulfil_at->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('D j M, H:i');
    }

    private function how(MenuOrder $o): string
    {
        return $o->order_type === 'delivery' ? 'delivered' : 'ready to collect';
    }

    public function placed(MenuOrder $o): void
    {
        $this->safely(function () use ($o) {
            $this->tell($o, 'menu_order_placed', "We have your order {$o->number}", "Thank you! Order {$o->number} is {$this->how($o)} {$this->when($o)}."
                .($o->payment === 'later' ? ' You pay when it '.($o->order_type === 'delivery' ? 'arrives' : 'is collected').'.' : ($o->payment === 'pending' ? ' We start as soon as your payment arrives.' : '')));
            $this->staffNew($o);
        });
    }

    /** The payment arrived: the kitchen can start. */
    public function paid(MenuOrder $o): void
    {
        $this->safely(function () use ($o) {
            $this->tell($o, 'menu_order_placed', "Payment received for order {$o->number}", "Thank you! Order {$o->number} is paid and is {$this->how($o)} {$this->when($o)}.");
            $this->staffNew($o, true);
        });
    }

    public function ready(MenuOrder $o): void
    {
        $this->safely(fn () => $this->tell($o, 'menu_order_ready', "Order {$o->number} is ready", $o->order_type === 'delivery' ? "Order {$o->number} is ready and will be with the driver shortly." : "Order {$o->number} is ready. Please come and collect it."));
    }

    public function out(MenuOrder $o): void
    {
        $this->safely(fn () => $this->tell($o, 'menu_order_out', "Order {$o->number} is on its way", "Order {$o->number} has left the kitchen and is on its way to you."));
    }

    public function cancelled(MenuOrder $o): void
    {
        $this->safely(fn () => $this->tell($o, 'menu_order_cancelled', "Order {$o->number} was cancelled", "Order {$o->number} was cancelled".($o->cancel_reason ? ": {$o->cancel_reason}" : '.')
            .($o->refundDue() ? ' We will give your money back.' : '')));
    }

    private function staffNew(MenuOrder $o, bool $paid = false): void
    {
        if ($o->payment === 'pending') {
            return;   // the kitchen is told once the money is in
        }
        foreach ($this->staff->holding('menus.manage') as $u) {
            $this->notifier->send($u, 'menu_order_new', "New order {$o->number}", "{$o->name}: ".($o->order_type === 'delivery' ? 'delivery' : 'pickup')." {$this->when($o)}, ".number_format((float) $o->total, 2).($o->payment === 'later' ? ' (pays on '.($o->order_type === 'delivery' ? 'delivery' : 'collection').')' : ' (paid)').'.',
                ['action_url' => '/admin/menus/orders', 'action_text' => 'Open the orders']);
        }
    }

    private function tell(MenuOrder $o, string $type, string $title, string $message): void
    {
        if ($o->order_type === 'counter') {
            return;   // someone at the counter is told face to face, by the number they hold
        }
        $customer = $o->customer_id ? Customer::find($o->customer_id) : null;
        $options = ['action_url' => '/menu/order/'.$o->track_token, 'action_text' => 'Follow your order'];
        if ($customer) {
            $this->notifier->send($customer, $type, $title, $message, $options);

            return;
        }
        $this->notifier->sendToContact(['name' => $o->name, 'email' => $o->email, 'phone' => $o->phone], $type, $title, $message, $options);
    }

    private function safely(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
