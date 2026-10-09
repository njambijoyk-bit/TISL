<?php

namespace App\Services\Notify;

/**
 * Every kind of message the system sends, in one list: what it is called, whether it is ESSENTIAL (orders, payments, refunds, delays: it reaches the customer
 * whatever they chose, and is never silent) and whether staff are also emailed. The company can switch a type off or give it its own channels (Settings → Types).
 * A type not listed here is treated as non-essential and bell-only unless its caller names channels.
 */
class NotificationTypes
{
    /** key => [label, essential, audience customer|staff] */
    public const ALL = [
        'order_placed' => ['Order placed', true, 'customer'],
        'order_confirmed' => ['Order confirmed', true, 'customer'],
        'order_shipped' => ['Order on its way', true, 'customer'],
        'order_delivered' => ['Order delivered', true, 'customer'],
        'order_cancelled' => ['Order cancelled', true, 'customer'],
        'payment_received' => ['Payment received', true, 'customer'],
        'preorder_delayed' => ['Preorder delayed', true, 'customer'],
        'preorder_cancel_decided' => ['Preorder cancellation decided', true, 'customer'],
        'preorder_delays_staff' => ['Preorders past their date (daily)', false, 'staff'],
        'preorder_cancel_requested' => ['Customer asked to cancel a preorder', false, 'staff'],
        'quote_received' => ['Quotation ready', true, 'customer'],
        'quote_accepted' => ['Quotation accepted', true, 'customer'],
        'quotation_requested' => ['New quotation request', false, 'staff'],
        'back_in_stock' => ['Back in stock (asked for)', true, 'customer'],   // essential: the customer asked for exactly this, so "essential messages only" must not silence it
        'stock_recall' => ['Product recall', true, 'customer'],
        'referral_earned' => ['Referral reward', false, 'customer'],
        'account_created' => ['Account created', true, 'customer'],
        'password_reset' => ['Password reset', true, 'customer'],
        'engagement_taken_down' => ['Post taken down', false, 'customer'],
    ];

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::ALL);
    }

    public static function label(string $type): string
    {
        return self::ALL[$type][0] ?? ucfirst(str_replace('_', ' ', $type));
    }

    public static function isEssential(string $type): bool
    {
        return (bool) (self::ALL[$type][1] ?? false);
    }
}
