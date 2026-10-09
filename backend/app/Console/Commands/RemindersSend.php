<?php

namespace App\Console\Commands;

use App\Services\Notify\CartReminders;
use App\Services\Notify\PriceDropAlerts;
use Illuminate\Console\Command;

/** Hourly: cart reminders and price-drop alerts (each only when the company has switched it on). */
class RemindersSend extends Command
{
    protected $signature = 'reminders:send {--dry-run : Only count who would be told} {--only= : cart or price}';

    protected $description = 'Remind customers about items left in the cart and tell them about price drops on saved items';

    public function handle(CartReminders $cart, PriceDropAlerts $price): int
    {
        $dry = (bool) $this->option('dry-run');
        $only = $this->option('only');
        if (! $only || $only === 'cart') {
            $r = $cart->run(null, $dry);
            $this->info(($dry ? "Cart: {$r['would_send']} would be reminded" : "Cart: {$r['sent']} reminded") . ($r['skipped'] ? ' · skipped: ' . json_encode($r['skipped']) : '') . '.');
        }
        if (! $only || $only === 'price') {
            $r = $price->run($dry);
            $this->info(($dry ? "Price: {$r['dropped']} product(s) dropped, {$r['would_tell']} would be told" : "Price: {$r['dropped']} product(s) dropped, {$r['told']} told") . " ({$r['products']} saved products checked).");
        }

        return self::SUCCESS;
    }
}
