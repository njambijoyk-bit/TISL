<?php

namespace App\Services\Menus;

use App\Models\Menus\SubDelivery;
use App\Models\Menus\SubPeriod;
use App\Models\Menus\Subscription;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/** Tells a subscriber about their meal plan: the week to pay, the reminder, the payment, a pause for non-payment, the day's meal in the kitchen. Never raises. */
class PlanNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    private function tell(Subscription $s, string $type, string $title, string $message): void
    {
        $this->safely(function () use ($s, $type, $title, $message) {
            $options = ['action_url' => '/menu/plan/'.$s->manage_token, 'action_text' => 'Open your plan'];
            $customer = $s->customer_id ? \App\Models\Customer::find($s->customer_id) : null;
            if ($customer) {
                $this->notifier->send($customer, $type, $title, $message, $options);

                return;
            }
            $this->notifier->sendToContact(['name' => $s->name, 'email' => $s->email, 'phone' => $s->phone], $type, $title, $message, $options);
        });
    }

    public function weekReady(Subscription $s, SubPeriod $p): void
    {
        $this->tell($s, 'menu_plan_week', 'Your meals for next week', 'The week of '.$p->week_start->format('j M').' comes to '.number_format((float) $p->total, 2).'. Pay by '.$p->pay_by?->format('D j M, H:i').' and we cook it; skip any day you do not need.');
    }

    public function reminder(Subscription $s, SubPeriod $p): void
    {
        $this->tell($s, 'menu_plan_reminder', 'Pay for your meals to keep them coming', 'The week of '.$p->week_start->format('j M').' ('.number_format((float) $p->total, 2).') is not paid yet. Pay by '.$p->pay_by?->format('D j M, H:i').'.');
    }

    public function paid(Subscription $s, SubPeriod $p): void
    {
        $this->tell($s, 'menu_plan_paid', 'Payment received', 'Thank you! The week of '.$p->week_start->format('j M').' is paid. Your meals will be delivered on the days you chose.');
    }

    public function lapsed(Subscription $s, SubPeriod $p, bool $paused): void
    {
        $this->tell($s, 'menu_plan_lapsed', 'We could not make your meals', 'The week of '.$p->week_start->format('j M').' was not paid in time, so those meals were not made.'.($paused ? ' Your plan is paused: open it to pay and carry on.' : ''));
    }

    public function orderMade(Subscription $s, SubDelivery $d, string $from, string $to): void
    {
        $this->tell($s, 'menu_plan_order', 'Your meal is being prepared', 'Your meal for '.$d->delivery_date->format('D j M')." is in the kitchen and will be delivered between {$from} and {$to}.");
    }

    public function cancelled(Subscription $s): void
    {
        $this->tell($s, 'menu_plan_cancelled', 'Your meal plan was cancelled', 'Your plan '.$s->number.' was cancelled'.($s->cancel_reason ? ": {$s->cancel_reason}" : '.').' Any paid days that were not delivered will be given back.');
    }

    /** The managers hear of a new subscriber and of a plan paused for non-payment. */
    public function staff(string $type, string $title, string $message): void
    {
        $this->safely(function () use ($type, $title, $message) {
            foreach ($this->staff->holding('menus.manage') as $u) {
                $this->notifier->send($u, $type, $title, $message, ['action_url' => '/admin/menus/plans', 'action_text' => 'Open the plans']);
            }
        });
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
