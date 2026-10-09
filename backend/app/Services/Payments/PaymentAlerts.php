<?php

namespace App\Services\Payments;

use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Http\Request;

/**
 * Tells the owner(s) when payment keys are touched: who, what, when, from where. Never a key. Goes to everyone who holds the payment-keys permission, including the person who
 * did it (so a stolen login is noticed by the others, and a real change is on record in their own inbox). Never raises: telling must not undo a change.
 */
class PaymentAlerts
{
    public const PERMISSION = 'payments.keys';

    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    /** @param  string  $what  one line: "Changed: consumer secret (changed), shortcode." */
    public function changed(?User $by, string $part, string $what, string $title = 'Payment keys were changed'): void
    {
        try {
            $who = $by ? ($by->name ?: $by->email) : 'Someone';
            $ip = app()->bound('request') ? app(Request::class)->ip() : null;
            $body = "{$who} changed the " . ($part === 'mpesa' ? 'M-Pesa' : $part) . " payment settings: {$what}"
                . ($ip ? "\n\nFrom address {$ip}, at " . now()->format('Y-m-d H:i') . '.' : "\n\nAt " . now()->format('Y-m-d H:i') . '.')
                . "\n\nIf this was not you or someone you trust, sign in now, roll the change back from Settings → Payment keys → History and change the password of the account that made it.";
            foreach ($this->staff->holding(self::PERMISSION) as $owner) {
                $this->notifier->send($owner, 'payment_settings_changed', $title, $body, ['action_url' => '/admin/settings/payments?tab=history', 'action_text' => 'See the history']);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
