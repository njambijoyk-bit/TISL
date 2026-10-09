<?php

namespace App\Jobs;

use App\Services\Notify\SystemHealth;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

/** Sent through the queue every minute by the scheduler: when a worker picks it up, the queue is alive (see SystemHealth). */
class QueueHeartbeat implements ShouldQueue
{
    use Dispatchable, Queueable;

    public int $tries = 1;

    public function handle(): void
    {
        SystemHealth::beat(SystemHealth::QUEUE);
    }
}
