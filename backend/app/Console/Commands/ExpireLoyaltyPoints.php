<?php

namespace App\Console\Commands;

use App\Services\LoyaltyService;
use Illuminate\Console\Command;

class ExpireLoyaltyPoints extends Command
{
    protected $signature   = 'loyalty:expire-points';
    protected $description = 'Expire due loyalty points and write offset transactions.';

    public function handle(LoyaltyService $service): int
    {
        $count = $service->expirePoints();
        $this->info("Expired points for {$count} transaction(s).");
        return Command::SUCCESS;
    }
}