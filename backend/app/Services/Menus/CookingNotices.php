<?php

namespace App\Services\Menus;

use App\Models\Customer;
use App\Models\Menus\CookingRequest;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/**
 * Tells the customer how their cake or catering request is going and tells the kitchen when a request or a deposit arrives.
 * Never raises: a problem telling someone must not undo what just happened.
 */
class CookingNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function day(CookingRequest $r): string
    {
        return $r->event_at->copy()->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('D j M, H:i');
    }

    public function requested(CookingRequest $r): void
    {
        $this->safely(function () use ($r) {
            $quoted = $r->status === 'quoted';
            $this->tell($r, 'menu_request_received', "We have your request {$r->number}", $quoted
                ? "Thank you! Your quote for {$this->day($r)} is ready: open it to see the price and confirm."
                : "Thank you! We will send you a quote for {$this->day($r)} soon.");
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_request_new', "New ".strtolower(CookingRequest::KINDS[$r->kind] ?? 'request')." {$r->number}", "{$r->name}: {$this->day($r)}".($r->headcount ? ", {$r->headcount} people" : '').'.',
                    ['action_url' => '/admin/menus/custom', 'action_text' => 'Open the requests']);
            }
        });
    }

    public function quoted(CookingRequest $r): void
    {
        $this->safely(fn () => $this->tell($r, 'menu_request_quoted', "Your quote {$r->number} is ready", 'Total '.number_format((float) $r->total, 2).', deposit '.number_format((float) $r->deposit_amount, 2)
            .'. It stays open until '.$r->valid_until?->format('j M').'.'));
    }

    public function confirmed(CookingRequest $r): void
    {
        $this->safely(function () use ($r) {
            $this->tell($r, 'menu_request_confirmed', "Booked: {$r->number}", "Your deposit has arrived. We will have it ready for {$this->day($r)}.".($r->balance() > 0 ? ' The balance of '.number_format($r->balance(), 2).' is paid before it is handed over.' : ''));
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, 'menu_request_confirmed', "Deposit received for {$r->number}", "{$r->name}: {$this->day($r)}.", ['action_url' => '/admin/menus/custom', 'action_text' => 'Open the requests']);
            }
        });
    }

    /** The chef is told once their job is booked (the deposit is in). */
    public function chefBooked(CookingRequest $r, \App\Models\Menus\Chef $chef): void
    {
        $this->safely(function () use ($r, $chef) {
            if ($u = \App\Models\User::find($chef->user_id)) {
                $this->notifier->send($u, 'menu_request_chef', "You are booked: {$r->number}", "{$r->name}, {$this->day($r)}".($r->duration_minutes ? ' for '.round($r->duration_minutes / 60, 1).' h' : '').($r->headcount ? ", {$r->headcount} people" : '').($r->address ? ", at {$r->address}" : '').'.',
                    ['action_url' => '/admin/menus/custom', 'action_text' => 'Open the job']);
            }
        });
    }

    public function ready(CookingRequest $r): void
    {
        $this->safely(fn () => $this->tell($r, 'menu_request_ready', "{$r->number} is ready", $r->balance() > 0 ? 'It is ready. The balance of '.number_format($r->balance(), 2).' is due on '.($r->fulfil === 'delivery' ? 'delivery.' : 'collection.') : 'It is ready.'));
    }

    public function cancelled(CookingRequest $r): void
    {
        $this->safely(fn () => $this->tell($r, 'menu_request_cancelled', "{$r->number} was cancelled", "Your request {$r->number} was cancelled".($r->cancel_reason ? ": {$r->cancel_reason}" : '.').($r->refundDue() ? ' We will give your deposit back.' : '')));
    }

    private function tell(CookingRequest $r, string $type, string $title, string $message): void
    {
        $customer = $r->customer_id ? Customer::find($r->customer_id) : null;
        $options = ['action_url' => '/menu/request/'.$r->track_token, 'action_text' => 'Open your request'];
        if ($customer) {
            $this->notifier->send($customer, $type, $title, $message, $options);

            return;
        }
        $this->notifier->sendToContact(['name' => $r->name, 'email' => $r->email, 'phone' => $r->phone], $type, $title, $message, $options);
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
