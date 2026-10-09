<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Console\Commands\VaultArchiveCommand;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ── Promo code automation ─────────────────────────────────────────────────────
Schedule::command('promo:birthday')->dailyAt('08:00');
Schedule::command('promo:winback')->dailyAt('09:00');
Schedule::command('promo:expire')->dailyAt('23:00');
Schedule::command('auctions:close')->everyMinute();
Schedule::command('algorithm:compute-scores')->dailyAt('03:00');

Schedule::command('loyalty:expire-points')->dailyAt('02:00');
Schedule::command('giftvouchers:expire')->dailyAt('01:00');
Schedule::command('preorders:notify-delays')->dailyAt('09:20')->withoutOverlapping();   // paid preorders past their promised date
Schedule::call(fn () => \App\Services\Notify\SystemHealth::beat(\App\Services\Notify\SystemHealth::SCHEDULER))->everyMinute()->name('health-scheduler-beat');   // proof the scheduler is running (shown on Settings → Notifications)
Schedule::job(new \App\Jobs\QueueHeartbeat)->everyMinute()->name('health-queue-beat');   // proof a queue worker is running
Schedule::command('notifications:prune')->dailyAt('03:30')->withoutOverlapping();   // delivery-log text older than 12 months is blanked
Schedule::command('stock:expire')->dailyAt('00:10')->withoutOverlapping();   // expired batches, auto write-offs, expiry warnings

// ── Data backups ────────────────────────────────────────────────────────────
// Runs hourly; the command decides whether the configured frequency/time is due.
Schedule::command('backup:run')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// ── Vault Archiver ────────────────────────────────────────────────────────────
Schedule::command('vault:archive')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->runInBackground()
    ->onFailure(fn() => \Illuminate\Support\Facades\Log::error('Vault archiver scheduled run failed.'))
    ->onSuccess(fn() => \Illuminate\Support\Facades\Log::info('Vault archiver completed successfully.'));