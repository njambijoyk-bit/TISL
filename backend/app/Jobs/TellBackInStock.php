<?php

namespace App\Jobs;

use App\Services\Stock\BackInStock;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

/** Stock of a variant went up and people are waiting for it (or for a hamper it is part of): tell them (BackInStock::restocked, restockedPart). Safe to run twice: each person is marked told before anything is sent. */
class TellBackInStock implements ShouldQueue
{
    use Dispatchable, Queueable;

    public int $tries = 2;

    public function __construct(public int $variantId)
    {
    }

    public function handle(BackInStock $alerts): void
    {
        $alerts->restocked($this->variantId);
        $alerts->restockedPart($this->variantId);   // a hamper this is part of may be makeable again
    }
}
