<?php

namespace App\Console\Commands;

use App\Services\Pos\SelfCheckoutService;
use Illuminate\Console\Command;

class PosSweepSelf extends Command
{
    protected $signature = 'pos:sweep-self {--minutes=15 : how long a payment prompt gets before its order is closed}';

    protected $description = 'Close self-checkout orders whose M-Pesa payment never arrived.';

    public function handle(SelfCheckoutService $self): int
    {
        $n = $self->sweep(max(5, (int) $this->option('minutes')));
        if ($n) {
            $this->info("Closed {$n} unpaid self-checkout order(s).");
        }

        return self::SUCCESS;
    }
}
