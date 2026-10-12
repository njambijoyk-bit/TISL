<?php

namespace App\Console\Commands;

use App\Services\Menus\SubscriptionService;
use Illuminate\Console\Command;

class MenusPlansRun extends Command
{
    protected $signature = 'menus:plans-run';

    protected $description = 'Meal plans: bill the coming weeks, let unpaid weeks lapse, remind, and make the kitchen orders that are due.';

    public function handle(SubscriptionService $plans): int
    {
        $r = $plans->run();
        if ($r['billed'] || $r['lapsed'] || $r['orders']) {
            $this->info("Meal plans: {$r['billed']} week(s) billed, {$r['lapsed']} lapsed, {$r['orders']} kitchen order(s) made.");
        }

        return self::SUCCESS;
    }
}
