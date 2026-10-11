<?php

namespace App\Services\Menus;

use App\Models\Menus\Chef;
use App\Models\Menus\ChefCert;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;

/** Tells the chef and the people who manage the kitchen when a certificate is about to run out or has. Never raises. */
class ChefNotices
{
    public function __construct(private Notifier $notifier, private Staff $staff)
    {
    }

    public function certificate(Chef $c, ChefCert $cert, string $stage): void
    {
        try {
            $on = $cert->expires_on->format('j M Y');
            $title = $stage === 'expired' ? "{$c->display_name}'s {$cert->name} has run out" : "{$c->display_name}'s {$cert->name} runs out on {$on}";
            $message = $stage === 'expired' ? "{$cert->name} ran out on {$on}. Please renew it before they work in the kitchen again." : "{$cert->name} runs out on {$on}. Please renew it in good time.";
            $options = ['action_url' => '/admin/menus/chefs', 'action_text' => 'Open the chefs'];
            $to = $this->staff->holding('menus.manage')->keyBy('id');
            if ($c->user && ! $to->has($c->user->id)) {
                $to->put($c->user->id, $c->user);
            }
            foreach ($to as $u) {
                $this->notifier->send($u, 'menu_cert_expiring', $title, $message, $options);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
