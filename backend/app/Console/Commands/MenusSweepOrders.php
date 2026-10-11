<?php

namespace App\Console\Commands;

use App\Services\Menus\MenuOrderService;
use Illuminate\Console\Command;

class MenusSweepOrders extends Command
{
    protected $signature = 'menus:sweep-orders {--minutes=30 : how long an unpaid online order waits}';

    protected $description = 'Cancel online food orders whose payment never arrived.';

    public function handle(MenuOrderService $orders): int
    {
        $n = $orders->sweep(max(5, (int) $this->option('minutes'))) + app(\App\Services\Menus\CounterService::class)->sweepPhone();
        if ($n) {
            $this->info("Cancelled {$n} unpaid food order(s).");
        }

        return self::SUCCESS;
    }
}
