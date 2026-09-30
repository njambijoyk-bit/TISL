<?php

namespace App\Console\Commands;

use App\Services\Stock\ExpiryService;
use Illuminate\Console\Command;

class ExpireStock extends Command
{
    protected $signature = 'stock:expire';
    protected $description = 'Mark batches past their expiry date, write off the ones due, and warn staff about batches about to expire.';

    public function handle(ExpiryService $expiry): int
    {
        $r = $expiry->run();
        $this->info("Marked {$r['marked']} batch(es) expired, wrote off {$r['written_off']}, sent {$r['warned']} notification(s).");
        foreach ($r['errors'] as $e) {
            $this->warn($e);
        }

        return $r['errors'] ? Command::FAILURE : Command::SUCCESS;
    }
}
