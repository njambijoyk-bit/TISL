<?php

namespace App\Services\Notify;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Are the two background processes the notifications depend on actually running? Each leaves a timestamp when it does its job: the scheduler every minute, and the
 * queue worker whenever it picks up the heartbeat job the scheduler sends it. Nothing here can start them; it only says, on the notification screen, when they are
 * not running — otherwise emails would just sit unsent and nobody would know.
 */
class SystemHealth
{
    public const SCHEDULER = 'health:scheduler';

    public const QUEUE = 'health:queue';

    /** A beat is every minute; this long without one means it is not running. */
    public const STALE_AFTER = 180;

    public static function beat(string $which): void
    {
        try {
            Cache::put($which, now()->timestamp, 86400);
        } catch (\Throwable) {
            // a cache that can not be written must not break the scheduler or the queue
        }
    }

    /** @return array{scheduler: array, queue: array, ok: bool} each part: state ok | down | never | unknown, last (ISO time or null), message */
    public function status(): array
    {
        $scheduler = $this->part(self::SCHEDULER);
        $sync = config('queue.default') === 'sync';   // jobs run at once inside the request: there is no worker to check
        $queue = $sync ? ['state' => 'ok', 'last' => null] : $this->part(self::QUEUE);
        if (! $sync && $scheduler['state'] !== 'ok') {
            $queue = ['state' => 'unknown', 'last' => $queue['last']];   // its heartbeat comes from the scheduler: with that stopped there is nothing to read
        }
        $queue += ['connection' => config('queue.default'), 'pending' => $this->count('jobs'), 'failed' => $this->count('failed_jobs')];

        $scheduler['message'] = match ($scheduler['state']) {
            'ok' => 'The scheduler is running.',
            'never' => 'The scheduler has not run yet. Scheduled work (delay notices, expiries, clean-ups) will not happen. Add this to the server\'s crontab: * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1  (or run: php artisan schedule:work).',
            'down' => 'The scheduler has stopped (last seen ' . $this->ago($scheduler['last']) . '). Scheduled work is not happening. Check the server\'s crontab entry for php artisan schedule:run.',
            default => 'Could not tell whether the scheduler is running (the server cache is not shared between processes).',
        };
        $queue['message'] = match (true) {
            $sync => 'Messages are sent while the customer waits (queue is "sync"). Fine for testing; set QUEUE_CONNECTION=database and run a worker for real use.',
            $queue['state'] === 'ok' => 'The queue worker is running.',
            $queue['state'] === 'unknown' && $scheduler['state'] !== 'ok' => 'Can not tell if the queue worker is running until the scheduler is.',
            $queue['state'] === 'never' => 'No queue worker has been seen. Emails and WhatsApp messages wait in the queue ("' . $queue['pending'] . ' waiting") and are not sent. Start one: php artisan queue:work (keep it running with Supervisor or systemd).',
            $queue['state'] === 'down' => 'The queue worker has stopped (last seen ' . $this->ago($queue['last']) . '). Messages are waiting and not being sent. Restart: php artisan queue:work.',
            default => 'Could not tell whether the queue worker is running.',
        };

        return ['scheduler' => $scheduler, 'queue' => $queue, 'ok' => $scheduler['state'] === 'ok' && in_array($queue['state'], ['ok'], true)];
    }

    private function part(string $key): array
    {
        if (config('cache.default') === 'array') {
            return ['state' => 'unknown', 'last' => null];
        }
        try {
            $at = Cache::get($key);
        } catch (\Throwable) {
            return ['state' => 'unknown', 'last' => null];
        }
        if (! $at) {
            return ['state' => 'never', 'last' => null];
        }

        return ['state' => now()->timestamp - (int) $at <= self::STALE_AFTER ? 'ok' : 'down', 'last' => now()->setTimestamp((int) $at)->toIso8601String()];
    }

    private function count(string $table): ?int
    {
        try {
            return Schema::hasTable($table) ? (int) DB::table($table)->count() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function ago(?string $iso): string
    {
        return $iso ? \Illuminate\Support\Carbon::parse($iso)->diffForHumans() : 'never';
    }
}
