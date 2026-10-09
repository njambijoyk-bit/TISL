<?php

namespace Tests\Feature;

use App\Jobs\QueueHeartbeat;
use App\Services\Notify\SystemHealth;
use Illuminate\Support\Facades\Cache;

/** The warning on Settings → Notifications when the scheduler or the queue worker is not running. */
class SystemHealthTest extends NotifyTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.stores.shared' => ['driver' => 'array'], 'cache.default' => 'shared', 'queue.default' => 'database']);   // an array store the way a shared one behaves inside one test
        Cache::flush();
    }

    private function beatAt(string $which, int $secondsAgo): void
    {
        Cache::put($which, now()->subSeconds($secondsAgo)->timestamp, 3600);
    }

    private function health(): array
    {
        return app(SystemHealth::class)->status();
    }

    public function test_nothing_ever_seen_says_so_and_tells_how_to_start_each(): void
    {
        $s = $this->health();
        $this->assertSame('never', $s['scheduler']['state']);
        $this->assertStringContainsString('schedule:run', $s['scheduler']['message']);
        $this->assertSame('unknown', $s['queue']['state'], 'no scheduler, so its heartbeat can not be judged');
        $this->assertFalse($s['ok']);
    }

    public function test_both_beating_recently_is_healthy(): void
    {
        $this->beatAt(SystemHealth::SCHEDULER, 30);
        $this->beatAt(SystemHealth::QUEUE, 70);
        $s = $this->health();
        $this->assertSame(['ok', 'ok'], [$s['scheduler']['state'], $s['queue']['state']]);
        $this->assertTrue($s['ok']);
    }

    public function test_a_stale_beat_is_down_and_a_missing_queue_beat_under_a_live_scheduler_is_a_worker_not_running(): void
    {
        $this->beatAt(SystemHealth::SCHEDULER, 30);
        $s = $this->health();
        $this->assertSame('never', $s['queue']['state']);
        $this->assertStringContainsString('queue:work', $s['queue']['message']);

        $this->beatAt(SystemHealth::QUEUE, 600);
        $s = $this->health();
        $this->assertSame('down', $s['queue']['state']);
        $this->assertStringContainsString('stopped', $s['queue']['message']);

        $this->beatAt(SystemHealth::SCHEDULER, 900);
        $this->assertSame('down', $this->health()['scheduler']['state']);
        $this->assertSame('unknown', $this->health()['queue']['state'], 'with the scheduler down the queue can not be judged');
    }

    public function test_a_sync_queue_needs_no_worker(): void
    {
        config(['queue.default' => 'sync']);
        $this->beatAt(SystemHealth::SCHEDULER, 10);
        $s = $this->health();
        $this->assertSame('ok', $s['queue']['state']);
        $this->assertTrue($s['ok']);
    }

    public function test_a_cache_that_is_not_shared_between_processes_is_not_blamed_on_them(): void
    {
        config(['cache.default' => 'array']);
        $this->assertSame('unknown', $this->health()['scheduler']['state']);
    }

    public function test_the_heartbeat_job_leaves_the_beat(): void
    {
        (new QueueHeartbeat)->handle();
        $this->assertGreaterThan(now()->subSeconds(5)->timestamp, Cache::get(SystemHealth::QUEUE));
    }
}
